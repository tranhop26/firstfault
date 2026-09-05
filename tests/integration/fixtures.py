"""Hand-checked FirstFault scenarios shared by Localnet integration tests."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import json
from typing import Any

import pytest
from genlayer_py.types import CalldataAddress, TransactionStatus
from gltest.accounts import create_accounts
from gltest.assertions import tx_execution_succeeded
from gltest.contracts.contract import Contract
from gltest.contracts import get_contract_factory
from gltest import get_validator_factory
from gltest.utils import extract_contract_address


SOURCE_URL = "https://www.iana.org/help/example-domains"


@dataclass(frozen=True)
class IntegrationScenario:
    slug: str
    research_output: str
    writer_output: str
    publisher_output: str
    rejection_reason: str
    outcome: str
    first_breach_step: int
    step_statuses: tuple[str, str, str]
    confidence: str


SCENARIOS = {
    "all_compliant": IntegrationScenario(
        slug="all-compliant",
        research_output="IANA reserves example domains for documentation purposes.",
        writer_output="Example domains are reserved for documentation purposes.",
        publisher_output="Example domains are reserved for documentation purposes.",
        rejection_reason="Buyer asks GenLayer to verify every brief was followed.",
        outcome="ACCEPT_ALL",
        first_breach_step=-1,
        step_statuses=("COMPLIANT", "COMPLIANT", "COMPLIANT"),
        confidence="HIGH",
    ),
    "writer_breach": IntegrationScenario(
        slug="writer-breach",
        research_output="IANA reserves example domains but states no audience metric.",
        writer_output="Example domains reached 250,000 users in one week.",
        publisher_output="Example domains reached 250,000 users in one week.",
        rejection_reason="The published audience metric is unsupported by IANA.",
        outcome="FIRST_BREACH",
        first_breach_step=1,
        step_statuses=("COMPLIANT", "MATERIAL_BREACH", "COMPLIANT"),
        confidence="HIGH",
    ),
    "unresolved": IntegrationScenario(
        slug="contradictory-evidence",
        research_output="The available sources disagree about the launch details.",
        writer_output="The launch details cannot be verified from the supplied evidence.",
        publisher_output="The launch details remain unverified.",
        rejection_reason="The supplied evidence is contradictory and insufficient.",
        outcome="UNRESOLVED",
        first_breach_step=-1,
        step_statuses=("UNRESOLVED", "UNRESOLVED", "UNRESOLVED"),
        confidence="LOW",
    ),
}


STEP_AMOUNTS = (11, 17, 23)
TOTAL_HOLD = sum(STEP_AMOUNTS)

FIRSTFAULT_METHODS = {
    name: {"readonly": name.startswith("get_")}
    for name in (
        "create_workflow",
        "fund_workflow",
        "start_workflow",
        "submit_step",
        "open_dispute",
        "adjudicate",
        "get_workflow",
        "get_accounting",
        "get_step",
    )
}


@dataclass(frozen=True)
class LifecycleProof:
    contract_address: str
    role_addresses: dict[str, str]
    parent_receipt: dict[str, Any]
    parent_execution: str
    triggered_transaction_ids: list[str]
    triggered_receipts: list[dict[str, Any]]
    balances_before: dict[str, int]
    balances_after: dict[str, int]
    balance_deltas: dict[str, int]
    contract_balance_before_funding: int
    contract_balance_after_funding: int
    contract_balance_before_adjudication: int
    contract_balance_after_children: int
    workflow: dict[str, Any]
    accounting: dict[str, str]
    readback_after_children: dict[str, Any]


def _execution_result(receipt: dict[str, Any]) -> str:
    consensus_data = receipt.get("consensus_data") or {}
    leaders = consensus_data.get("leader_receipt") or []
    return leaders[0].get("execution_result", "UNKNOWN") if leaders else "UNKNOWN"


def _transaction_hash(receipt: dict[str, Any]) -> str:
    return str(receipt.get("hash") or receipt.get("tx_id") or "")


def _verdict(scenario: IntegrationScenario, evidence_hashes: list[str]) -> dict[str, Any]:
    return {
        "outcome": scenario.outcome,
        "first_breach_step": scenario.first_breach_step,
        "step_statuses": [
            {"step_index": index, "status": status}
            for index, status in enumerate(scenario.step_statuses)
        ],
        "reasons": [
            {
                "step_index": index,
                "confidence": scenario.confidence,
                "material": status == "MATERIAL_BREACH",
                "causal": status == "MATERIAL_BREACH",
                "reason": "Hand-checked Localnet scenario grounded in bound evidence.",
            }
            for index, status in enumerate(scenario.step_statuses)
        ],
        "cited_evidence_hashes": evidence_hashes,
    }


class FirstFaultLocalnetHarness:
    """Runs contract transactions and retains proof at every network boundary."""

    def __init__(self, gl_client):
        self.client = gl_client
        self.factory = get_contract_factory(contract_file_path="firstfault.py")
        deterministic_validator = get_validator_factory().create_validator(
            stake=8,
            provider="openai",
            model="gpt-4o",
            config={"temperature": 0.0, "max_tokens": 500},
            plugin="openai-compatible",
            plugin_config={
                "api_key_env_var": "OPENAIKEY",
                "api_url": "https://api.openai.com",
            },
        )
        self.deterministic_context = {
            "validators": [deterministic_validator.to_dict()]
        }
        self.proofs: dict[str, LifecycleProof] = {}

    def _write(
        self,
        contract,
        method: str,
        args: list[Any],
        *,
        value: int = 0,
        transaction_context: dict[str, Any] | None = None,
    ):
        receipt = getattr(contract, method)(args=args).transact(
            value=value,
            wait_transaction_status=TransactionStatus.FINALIZED,
            wait_interval=250,
            wait_retries=600,
            transaction_context=(
                transaction_context
                if transaction_context is not None
                else self.deterministic_context
            ),
        )
        assert tx_execution_succeeded(receipt), receipt
        return receipt

    def _balance(self, address: str) -> int:
        raw = self.client.provider.make_request(
            "eth_getBalance", [address, "latest"]
        )["result"]
        return int(raw, 16) if isinstance(raw, str) and raw.startswith("0x") else int(raw)

    def _mock_transaction_context(
        self, scenario: IntegrationScenario, evidence_hashes: list[str]
    ) -> dict[str, Any]:
        validators = get_validator_factory().batch_create_mock_validators(
            count=5,
            mock_llm_response={
                "nondet_exec_prompt": {
                    "FIRSTFAULT SEMANTIC RUBRIC": json.dumps(
                        _verdict(scenario, evidence_hashes)
                    )
                },
                "eq_principle_prompt_comparative": {},
                "eq_principle_prompt_non_comparative": {},
            },
        )
        return {"validators": [validator.to_dict() for validator in validators]}

    def run(self, scenario: IntegrationScenario) -> LifecycleProof:
        if scenario.slug not in self.proofs:
            self.proofs[scenario.slug] = self._run_uncached(scenario)
        return self.proofs[scenario.slug]

    def _run_uncached(self, scenario: IntegrationScenario) -> LifecycleProof:
        buyer, orchestrator, researcher, writer, publisher = create_accounts(5)
        roles = {
            "buyer": buyer,
            "orchestrator": orchestrator,
            "researcher": researcher,
            "writer": writer,
            "publisher": publisher,
        }
        for account in roles.values():
            fund_tx = self.client.provider.make_request(
                "sim_fundAccount", [account.address, 1_000_000]
            )["result"]
            assert isinstance(fund_tx, str) and fund_tx.startswith("0x")
            assert self._balance(account.address) >= 1_000_000

        deployment = self.factory.deploy_contract_tx(
            account=buyer,
            wait_transaction_status=TransactionStatus.FINALIZED,
            wait_interval=250,
            wait_retries=600,
            transaction_context=self.deterministic_context,
        )
        assert tx_execution_succeeded(deployment), deployment
        contract_address = extract_contract_address(deployment)
        contract = Contract.new(
            address=contract_address,
            schema={"methods": FIRSTFAULT_METHODS},
            account=buyer,
        )
        workflow_id = f"{scenario.slug}-{buyer.address[-8:]}"
        now = datetime.now(timezone.utc).replace(microsecond=0)
        observed_at = int(now.timestamp())
        deadlines = [int((now + timedelta(hours=hours)).timestamp()) for hours in (1, 2, 3)]

        self._write(
            contract,
            "create_workflow",
            [
                workflow_id,
                CalldataAddress(orchestrator.address),
                CalldataAddress(researcher.address),
                CalldataAddress(writer.address),
                CalldataAddress(publisher.address),
                "Find verifiable primary sources.",
                "Write only claims supported by Research; do not invent metrics.",
                "Format the Writer artifact without adding or changing claims.",
                *STEP_AMOUNTS,
                *deadlines,
                f"{workflow_id}-create",
            ],
        )
        contract_balance_before_funding = self._balance(contract_address)
        self._write(contract, "fund_workflow", [workflow_id, f"{workflow_id}-fund"], value=TOTAL_HOLD)
        contract_balance_after_funding = self._balance(contract_address)
        self._write(contract.connect(orchestrator), "start_workflow", [workflow_id, f"{workflow_id}-start"])

        research_receipt = self._write(
            contract.connect(researcher),
            "submit_step",
            [workflow_id, 0, scenario.research_output, "", SOURCE_URL, observed_at, f"{workflow_id}-research"],
        )
        assert _execution_result(research_receipt) == "SUCCESS"
        research_step = json.loads(contract.get_step(args=[workflow_id, 0]).call())
        self._write(
            contract.connect(writer),
            "submit_step",
            [workflow_id, 1, scenario.writer_output, research_step["output_hash"], "", observed_at, f"{workflow_id}-writer"],
        )
        writer_step = json.loads(contract.get_step(args=[workflow_id, 1]).call())
        self._write(
            contract.connect(publisher),
            "submit_step",
            [workflow_id, 2, scenario.publisher_output, writer_step["output_hash"], "", observed_at, f"{workflow_id}-publisher"],
        )
        assert json.loads(contract.get_workflow(args=[workflow_id]).call())["state"] == "READY_FOR_REVIEW"
        self._write(
            contract,
            "open_dispute",
            [workflow_id, scenario.rejection_reason, f"{workflow_id}-dispute"],
        )

        evidence_hashes = [
            json.loads(contract.get_step(args=[workflow_id, index]).call())["evidence_hash"]
            for index in range(3)
        ]
        transaction_context = self._mock_transaction_context(scenario, evidence_hashes)
        balances_before = {role: self._balance(account.address) for role, account in roles.items()}
        contract_balance_before_adjudication = self._balance(contract_address)
        parent_receipt = self._write(
            contract.connect(orchestrator),
            "adjudicate",
            [workflow_id, f"{workflow_id}-adjudicate"],
            transaction_context=transaction_context,
        )
        parent_hash = _transaction_hash(parent_receipt)
        triggered_ids = self.client.get_triggered_transaction_ids(parent_hash) if parent_hash else []
        triggered_receipts = [
            self.client.wait_for_transaction_receipt(
                transaction_hash=tx_id,
                status=TransactionStatus.FINALIZED,
                interval=250,
                retries=600,
            )
            for tx_id in triggered_ids
        ]
        balances_after = {role: self._balance(account.address) for role, account in roles.items()}
        contract_balance_after_children = self._balance(contract_address)
        workflow = json.loads(contract.get_workflow(args=[workflow_id]).call())
        accounting = json.loads(contract.get_accounting(args=[workflow_id]).call())

        return LifecycleProof(
            contract_address=contract_address,
            role_addresses={role: account.address for role, account in roles.items()},
            parent_receipt=parent_receipt,
            parent_execution=_execution_result(parent_receipt),
            triggered_transaction_ids=list(triggered_ids),
            triggered_receipts=triggered_receipts,
            balances_before=balances_before,
            balances_after=balances_after,
            balance_deltas={role: balances_after[role] - before for role, before in balances_before.items()},
            contract_balance_before_funding=contract_balance_before_funding,
            contract_balance_after_funding=contract_balance_after_funding,
            contract_balance_before_adjudication=contract_balance_before_adjudication,
            contract_balance_after_children=contract_balance_after_children,
            workflow=workflow,
            accounting=accounting,
            readback_after_children=json.loads(contract.get_workflow(args=[workflow_id]).call()),
        )


@pytest.fixture(scope="session")
def firstfault_localnet(gl_client):
    return FirstFaultLocalnetHarness(gl_client)
