"""Custody tests for FirstFault V3's two-phase funding boundary."""

import json

import pytest

from tests.direct.conftest import to_hex, workflow_terms
from tests.direct.test_custody import schedule_transfers


NOW = 1_700_000_000
TOTAL = 51


def create_draft(contract, vm, buyer, orchestrator, researcher, writer, publisher, workflow_id="v3-funding"):
    vm.sender = buyer
    contract.create_workflow(
        workflow_id,
        to_hex(orchestrator),
        to_hex(researcher),
        to_hex(writer),
        to_hex(publisher),
        nonce="create-" + workflow_id,
        **workflow_terms(),
    )


def deploy_draft(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie, direct_accounts):
    direct_vm.warp("2023-11-14T22:13:20+00:00")
    contract = direct_deploy("contracts/firstfault_v3.py")
    orchestrator, publisher = direct_accounts[:2]
    create_draft(contract, direct_vm, direct_alice, orchestrator, direct_bob, direct_charlie, publisher)
    return contract


def warp_transaction_time(direct_vm, timestamp):
    direct_vm.warp(timestamp)
    import genlayer.gl as runtime_gl

    runtime_gl.message_raw["datetime"] = timestamp


def test_prepared_intent_readback_binds_the_runtime_domain(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie, direct_accounts
):
    contract = deploy_draft(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie, direct_accounts)

    contract.prepare_funding("v3-funding", "intent-1", NOW + 300, "prepare-1")

    intent = json.loads(contract.get_funding_intent("v3-funding"))
    assert intent["workflow_id"] == "v3-funding"
    assert intent["intent_id"] == "intent-1"
    assert intent["buyer"] == to_hex(direct_alice)
    assert intent["expected_amount"] == str(TOTAL)
    assert intent["expires_at"] == str(NOW + 300)
    assert intent["version"] == "1"
    assert intent["chain_id"] == str(direct_vm._chain_id)
    assert intent["contract_address"] == to_hex(direct_vm._contract_address)
    assert intent["nonce"] == "prepare-1"
    assert len(intent["intent_hash"]) == 64
    assert intent["consumed"] is False


def test_exact_prepared_funding_becomes_reserved(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie, direct_accounts
):
    contract = deploy_draft(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie, direct_accounts)
    contract.prepare_funding("v3-funding", "intent-1", NOW + 300, "prepare-1")

    direct_vm.value = TOTAL
    attempt = contract.fund_workflow("v3-funding", "intent-1")
    direct_vm.value = 0

    workflow = json.loads(contract.get_workflow("v3-funding"))
    outcome = json.loads(contract.get_funding_outcome(attempt))
    totals = json.loads(contract.get_global_accounting())
    assert attempt == 1
    assert workflow["state"] == "FUNDED"
    assert workflow["deposited"] == str(TOTAL)
    assert workflow["reserved"] == str(TOTAL)
    assert outcome["result"] == "FUNDED"
    assert outcome["retained"] == str(TOTAL)
    assert outcome["refund_scheduled"] == "0"
    assert outcome["intent_version"] == "1"
    assert totals["funding_attempt_count"] == "1"
    assert totals["total_accepted_funding"] == str(TOTAL)


def test_nonexistent_workflow_value_is_fully_refunded_without_throwing(
    direct_vm, direct_deploy, direct_alice
):
    direct_vm.warp("2023-11-14T22:13:20+00:00")
    contract = direct_deploy("contracts/firstfault_v3.py")
    transfers = schedule_transfers(direct_vm)
    direct_vm.sender = direct_alice
    direct_vm.value = 23

    attempt = contract.fund_workflow("missing", "no-intent")
    direct_vm.value = 0

    outcome = json.loads(contract.get_funding_outcome(attempt))
    totals = json.loads(contract.get_global_accounting())
    assert outcome["result"] == "REFUND_SCHEDULED"
    assert outcome["reason"] == "WORKFLOW_NOT_FOUND"
    assert outcome["received"] == "23"
    assert outcome["retained"] == "0"
    assert outcome["refund_scheduled"] == "23"
    assert [(item["address"].as_hex, int(item["value"])) for item in transfers] == [(to_hex(direct_alice), 23)]
    assert totals["total_rejected_funding_received"] == "23"
    assert totals["total_rejected_funding_refund_scheduled"] == "23"


def test_oversized_identifiers_are_safely_reduced_before_refund_outcome_storage(
    direct_vm, direct_deploy, direct_alice
):
    direct_vm.warp("2023-11-14T22:13:20+00:00")
    contract = direct_deploy("contracts/firstfault_v3.py")
    transfers = schedule_transfers(direct_vm)
    direct_vm.sender = direct_alice
    direct_vm.value = 19

    attempt = contract.fund_workflow("w" * 10_000, "i" * 10_000)
    direct_vm.value = 0

    outcome = json.loads(contract.get_funding_outcome(attempt))
    assert outcome["reason"] == "INVALID_IDENTIFIER"
    assert outcome["workflow_id"].startswith("sha256:")
    assert outcome["intent_id"].startswith("sha256:")
    assert outcome["refund_scheduled"] == "19"
    assert [(item["address"].as_hex, int(item["value"])) for item in transfers] == [(to_hex(direct_alice), 19)]


@pytest.mark.parametrize(
    ("case", "sender_kind", "intent_id", "value", "timestamp"),
    [
        ("WRONG_BUYER", "other", "intent-1", TOTAL, None),
        ("INTENT_NOT_FOUND", "buyer", "other-intent", TOTAL, None),
        ("INTENT_EXPIRED", "buyer", "intent-1", TOTAL, "2023-11-14T22:18:21+00:00"),
        ("WRONG_AMOUNT", "buyer", "intent-1", TOTAL - 1, None),
    ],
)
def test_invalid_prepared_funding_refunds_and_preserves_workflow(
    direct_vm,
    direct_deploy,
    direct_alice,
    direct_bob,
    direct_charlie,
    direct_accounts,
    case,
    sender_kind,
    intent_id,
    value,
    timestamp,
):
    contract = deploy_draft(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie, direct_accounts)
    contract.prepare_funding("v3-funding", "intent-1", NOW + 300, "prepare-1")
    if timestamp is not None:
        warp_transaction_time(direct_vm, timestamp)
    transfers = schedule_transfers(direct_vm)
    sender = direct_bob if sender_kind == "other" else direct_alice
    direct_vm.sender = sender
    direct_vm.value = value

    attempt = contract.fund_workflow("v3-funding", intent_id)
    direct_vm.value = 0

    outcome = json.loads(contract.get_funding_outcome(attempt))
    workflow = json.loads(contract.get_workflow("v3-funding"))
    assert outcome["reason"] == case
    assert outcome["result"] == "REFUND_SCHEDULED"
    assert outcome["refund_scheduled"] == str(value)
    assert workflow["state"] == "DRAFT"
    assert workflow["deposited"] == "0"
    assert workflow["reserved"] == "0"
    assert [(item["address"].as_hex, int(item["value"])) for item in transfers] == [(to_hex(sender), value)]


def test_consumed_intent_and_zero_value_rejections_are_recorded(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie, direct_accounts
):
    contract = deploy_draft(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie, direct_accounts)
    contract.prepare_funding("v3-funding", "intent-1", NOW + 300, "prepare-1")
    direct_vm.value = TOTAL
    assert contract.fund_workflow("v3-funding", "intent-1") == 1
    transfers = schedule_transfers(direct_vm)
    assert contract.fund_workflow("v3-funding", "intent-1") == 2
    direct_vm.value = 0
    zero_attempt = contract.fund_workflow("v3-funding", "intent-1")

    duplicate = json.loads(contract.get_funding_outcome(2))
    zero = json.loads(contract.get_funding_outcome(zero_attempt))
    assert duplicate["reason"] == "INVALID_STATE"
    assert duplicate["result"] == "REFUND_SCHEDULED"
    assert duplicate["intent_version"] == "1"
    assert zero["result"] == "REJECTED_NO_VALUE"
    assert zero["refund_scheduled"] == "0"
    assert len(transfers) == 1
