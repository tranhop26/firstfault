"""Adversarial tests for FirstFault semantic first-breach adjudication.

The fixtures exercise the real public workflow and the pinned runtime's
``run_nondet`` direct-mode boundary.  Expected settlement amounts and semantic
keys are literal, independently checked values.
"""

import json
import re

import pytest

from tests.direct.conftest import to_address, to_hex
from tests.direct.test_custody import (
    EVIDENCE_NOW,
    TOTAL,
    accounting,
    assert_conserved,
    create_workflow,
    evidence_terms,
    schedule_transfers,
    submit_required_evidence,
)


SOURCE_URL = "https://example.test/primary-source"
SOURCE_TEXT = "Primary source confirms the one supported claim."
PROMPT_PATTERN = r"FIRSTFAULT SEMANTIC RUBRIC"


def reason(step_index, *, confidence="HIGH", material=False, causal=False, text="Supported by bound evidence."):
    """Build the exact reason shape expected from a leader or validator."""
    return {
        "step_index": step_index,
        "confidence": confidence,
        "material": material,
        "causal": causal,
        "reason": text,
    }


def verdict(
    evidence_hashes,
    *,
    outcome="ACCEPT_ALL",
    first_breach_step=-1,
    statuses=("COMPLIANT", "COMPLIANT", "COMPLIANT"),
    confidence="HIGH",
    prose="Supported by bound evidence.",
):
    """Build a hand-controlled model response without contract helpers."""
    return {
        "outcome": outcome,
        "first_breach_step": first_breach_step,
        "step_statuses": [
            {"step_index": index, "status": status}
            for index, status in enumerate(statuses)
        ],
        "reasons": [
            reason(
                index,
                confidence=confidence,
                material=status == "MATERIAL_BREACH",
                causal=status == "MATERIAL_BREACH",
                text=prose,
            )
            for index, status in enumerate(statuses)
        ],
        "cited_evidence_hashes": list(evidence_hashes),
    }


def evidence_hashes(contract, workflow_id):
    """Read the three authoritative hashes through the public contract view."""
    return [
        json.loads(contract.get_step(workflow_id, index))["evidence_hash"]
        for index in range(3)
    ]


def install_decision_mocks(direct_vm, decision, *, source_text=SOURCE_TEXT):
    """Install complete bare-dictionary web and JSON LLM mocks before adjudication."""
    direct_vm.mock_web(
        re.escape(SOURCE_URL),
        {"status": 200, "body": source_text},
    )
    direct_vm.mock_llm(PROMPT_PATTERN, json.dumps(decision))


def run_with_simulated_consensus_rollback(direct_vm, call):
    """Model GenVM's transaction rollback when a captured validator disagrees.

    Direct mode deliberately returns the leader result before consensus.  A
    real GenVM rejects the whole transaction when this validator returns
    False, so this small harness restores the pre-transaction VM snapshot.
    Integration tests must still prove the network boundary itself.
    """
    snapshot = direct_vm.snapshot()
    call()
    agreed = direct_vm.run_validator()
    if not agreed:
        direct_vm.revert(snapshot)
    return agreed


def warp_authoritative_transaction_time(direct_vm, timestamp):
    """Advance the direct runner's VM clock and its cached raw message timestamp."""
    direct_vm.warp(timestamp)
    import genlayer.gl as runtime_gl

    runtime_gl.message_raw["datetime"] = timestamp


def make_disputed(
    contract,
    direct_vm,
    buyer,
    orchestrator,
    researcher,
    writer,
    publisher,
    workflow_id="wf-adjudication",
):
    """Reach DISPUTED through the real funded and evidence-bound public workflow."""
    direct_vm.sender = buyer
    create_workflow(
        contract,
        orchestrator,
        researcher,
        writer,
        publisher,
        workflow_id=workflow_id,
        nonce="create-" + workflow_id,
        terms=evidence_terms(),
    )
    direct_vm.value = TOTAL
    contract.fund_workflow(workflow_id, "fund-" + workflow_id)
    direct_vm.value = 0
    direct_vm.sender = orchestrator
    contract.start_workflow(workflow_id, "start-" + workflow_id)
    submit_required_evidence(
        contract,
        direct_vm,
        researcher,
        writer,
        publisher,
        workflow_id,
    )
    direct_vm.sender = buyer
    contract.open_dispute(
        workflow_id,
        "The final article contains an unsupported material claim.",
        "dispute-" + workflow_id,
    )


@pytest.fixture
def disputed(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie, direct_accounts
):
    """One funded, fully evidenced dispute and all actors needed by assertions."""
    direct_vm.warp("2023-11-14T22:13:20+00:00")
    contract = direct_deploy("contracts/firstfault.py")
    orchestrator, publisher, resolver = direct_accounts[:3]
    make_disputed(
        contract,
        direct_vm,
        direct_alice,
        orchestrator,
        direct_bob,
        direct_charlie,
        publisher,
    )
    return contract, orchestrator, publisher, resolver


def test_only_buyer_opens_dispute_and_rejected_nonce_remains_usable(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie, direct_accounts
):
    """Break caught: a worker invents rejection grounds or burns a buyer nonce."""
    direct_vm.warp("2023-11-14T22:13:20+00:00")
    contract = direct_deploy("contracts/firstfault.py")
    orchestrator, publisher = direct_accounts[:2]
    direct_vm.sender = direct_alice
    create_workflow(
        contract,
        orchestrator,
        direct_bob,
        direct_charlie,
        publisher,
        terms=evidence_terms(),
    )
    direct_vm.value = TOTAL
    contract.fund_workflow("wf-custody", "fund-dispute")
    direct_vm.value = 0
    direct_vm.sender = orchestrator
    contract.start_workflow("wf-custody", "start-dispute")
    submit_required_evidence(contract, direct_vm, direct_bob, direct_charlie, publisher)

    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("Buyer only"):
        contract.open_dispute("wf-custody", "I choose the outcome.", "retry-dispute")

    direct_vm.sender = direct_alice
    contract.open_dispute("wf-custody", "Unsupported material claim.", "retry-dispute")
    readback = json.loads(contract.get_workflow("wf-custody"))
    assert readback["state"] == "DISPUTED"
    assert readback["rejection_reason"] == "Unsupported material claim."
    assert accounting(contract) == {
        "deposited": "51",
        "reserved": "51",
        "payout_scheduled": "0",
        "refund_scheduled": "0",
        "paid": "0",
        "refunded": "0",
    }


def test_accept_all_schedules_three_stored_worker_holds_without_claiming_payment(
    disputed, direct_vm, direct_bob, direct_charlie
):
    """Break caught: ACCEPT_ALL uses model recipients/amounts or marks child transfers paid."""
    contract, _, publisher, resolver = disputed
    decision = verdict(evidence_hashes(contract, "wf-adjudication"))
    install_decision_mocks(direct_vm, decision)
    scheduled = schedule_transfers(direct_vm)
    direct_vm.check_pickling = True
    direct_vm.sender = resolver

    contract.adjudicate("wf-adjudication", "adjudicate-accept")

    workflow = json.loads(contract.get_workflow("wf-adjudication"))
    assert workflow["state"] == "DECISION_PENDING_FINALITY"
    assert workflow["outcome"] == "ACCEPT_ALL"
    values = accounting(contract, "wf-adjudication")
    assert values == {
        "deposited": "51",
        "reserved": "0",
        "payout_scheduled": "51",
        "refund_scheduled": "0",
        "paid": "0",
        "refunded": "0",
    }
    assert_conserved(values)
    assert [(item["address"].as_hex, int(item["value"]), item["on"]) for item in scheduled] == [
        (to_hex(direct_bob), 11, "finalized"),
        (to_hex(direct_charlie), 17, "finalized"),
        (to_hex(publisher), 23, "finalized"),
    ]


def test_writer_first_breach_pays_compliant_workers_and_refunds_only_writer_hold(
    disputed, direct_vm, direct_alice, direct_bob, direct_charlie
):
    """Break caught: first-breach attribution pays the breacher or refunds the wrong hold."""
    contract, _, publisher, resolver = disputed
    decision = verdict(
        evidence_hashes(contract, "wf-adjudication"),
        outcome="FIRST_BREACH",
        first_breach_step=1,
        statuses=("COMPLIANT", "MATERIAL_BREACH", "COMPLIANT"),
    )
    install_decision_mocks(direct_vm, decision)
    scheduled = schedule_transfers(direct_vm)
    direct_vm.sender = resolver

    contract.adjudicate("wf-adjudication", "adjudicate-writer")

    values = accounting(contract, "wf-adjudication")
    assert values == {
        "deposited": "51",
        "reserved": "0",
        "payout_scheduled": "34",
        "refund_scheduled": "17",
        "paid": "0",
        "refunded": "0",
    }
    assert_conserved(values)
    assert json.loads(contract.get_workflow("wf-adjudication"))["outcome"] == "FIRST_BREACH"
    assert [json.loads(contract.get_step("wf-adjudication", index))["state"] for index in range(3)] == [
        "PAYOUT_SCHEDULED",
        "REFUND_SCHEDULED",
        "PAYOUT_SCHEDULED",
    ]
    assert [(item["address"].as_hex, int(item["value"]), item["on"]) for item in scheduled] == [
        (to_hex(direct_bob), 11, "finalized"),
        (to_hex(direct_alice), 17, "finalized"),
        (to_hex(publisher), 23, "finalized"),
    ]
    assert to_hex(direct_charlie) not in [item["address"].as_hex for item in scheduled]


@pytest.mark.parametrize(
    ("case", "mutate"),
    [
        ("insufficient", lambda value: verdict(value, outcome="UNRESOLVED", statuses=("UNRESOLVED",) * 3, confidence="LOW")),
        ("contradictory", lambda value: verdict(value, outcome="UNRESOLVED", statuses=("UNRESOLVED",) * 3, confidence="HIGH")),
        ("malformed-json", lambda value: "not-json"),
        ("low-confidence", lambda value: verdict(value, confidence="LOW")),
        ("unknown-outcome", lambda value: {**verdict(value), "outcome": "PAY_BUYER"}),
        (
            "duplicate-index",
            lambda value: {
                **verdict(value),
                "step_statuses": [
                    {"step_index": 0, "status": "COMPLIANT"},
                    {"step_index": 0, "status": "COMPLIANT"},
                    {"step_index": 2, "status": "COMPLIANT"},
                ],
            },
        ),
        ("missing-citation", lambda value: {**verdict(value), "cited_evidence_hashes": value[:2]}),
        (
            "noncausal-breach",
            lambda value: {
                **verdict(
                    value,
                    outcome="FIRST_BREACH",
                    first_breach_step=1,
                    statuses=("COMPLIANT", "MATERIAL_BREACH", "COMPLIANT"),
                ),
                "reasons": [reason(0), reason(1, material=True, causal=False), reason(2)],
            },
        ),
        (
            "unresolved-reason-flags",
            lambda value: {
                **verdict(
                    value,
                    outcome="UNRESOLVED",
                    statuses=("UNRESOLVED",) * 3,
                    confidence="LOW",
                ),
                "reasons": [
                    reason(0, confidence="LOW", material=True, causal=True),
                    reason(1, confidence="LOW"),
                    reason(2, confidence="LOW"),
                ],
            },
        ),
        ("model-address", lambda value: {**verdict(value), "recipient": "0x1111111111111111111111111111111111111111"}),
        ("model-amount", lambda value: {**verdict(value), "payout_amount": 51}),
    ],
)
def test_unsafe_model_results_become_unresolved_and_move_no_held_value(
    disputed, direct_vm, case, mutate
):
    """Break caught: malformed, weak, contradictory, or authoritative model output settles value."""
    contract, _, _, resolver = disputed
    hashes = evidence_hashes(contract, "wf-adjudication")
    raw = mutate(hashes)
    direct_vm.mock_web(re.escape(SOURCE_URL), {"status": 200, "body": SOURCE_TEXT})
    direct_vm.mock_llm(PROMPT_PATTERN, raw if isinstance(raw, str) else json.dumps(raw))
    scheduled = schedule_transfers(direct_vm)
    direct_vm.sender = resolver

    contract.adjudicate("wf-adjudication", "unsafe-" + case)

    workflow = json.loads(contract.get_workflow("wf-adjudication"))
    assert workflow["state"] == "UNRESOLVED"
    assert workflow["outcome"] == "UNRESOLVED"
    assert scheduled == []
    values = accounting(contract, "wf-adjudication")
    assert values["reserved"] == "51"
    assert values["payout_scheduled"] == values["refund_scheduled"] == "0"
    assert_conserved(values)
    assert all(
        item["material"] is False and item["causal"] is False
        for item in workflow["verdict"]["reasons"]
    )


def test_first_breach_refunds_every_breached_hold_but_records_the_earliest_one(
    disputed, direct_vm, direct_alice, direct_bob
):
    """Break caught: a later independently breached step is paid just because it is not first."""
    contract, _, publisher, resolver = disputed
    decision = verdict(
        evidence_hashes(contract, "wf-adjudication"),
        outcome="FIRST_BREACH",
        first_breach_step=1,
        statuses=("COMPLIANT", "MATERIAL_BREACH", "MATERIAL_BREACH"),
    )
    install_decision_mocks(direct_vm, decision)
    scheduled = schedule_transfers(direct_vm)
    direct_vm.sender = resolver

    contract.adjudicate("wf-adjudication", "adjudicate-two-breaches")

    values = accounting(contract, "wf-adjudication")
    assert values == {
        "deposited": "51",
        "reserved": "0",
        "payout_scheduled": "11",
        "refund_scheduled": "40",
        "paid": "0",
        "refunded": "0",
    }
    assert_conserved(values)
    assert json.loads(contract.get_workflow("wf-adjudication"))["verdict"]["first_breach_step"] == 1
    assert [(item["address"].as_hex, int(item["value"])) for item in scheduled] == [
        (to_hex(direct_bob), 11),
        (to_hex(direct_alice), 17),
        (to_hex(direct_alice), 23),
    ]


def test_unavailable_research_source_becomes_unresolved_without_llm_or_transfer(
    disputed, direct_vm
):
    """Break caught: a failed Research render silently defaults to settlement."""
    contract, _, _, resolver = disputed
    direct_vm.mock_web(re.escape(SOURCE_URL), {"status": 503, "body": "unavailable"})
    scheduled = schedule_transfers(direct_vm)
    direct_vm.sender = resolver

    contract.adjudicate("wf-adjudication", "source-unavailable")

    assert json.loads(contract.get_workflow("wf-adjudication"))["state"] == "UNRESOLVED"
    assert scheduled == []
    assert accounting(contract, "wf-adjudication")["reserved"] == "51"


def test_stale_stored_evidence_becomes_unresolved_before_value_moves(disputed, direct_vm):
    """Break caught: adjudication treats expired observations as current settlement proof."""
    contract, _, _, resolver = disputed
    direct_vm.warp("2023-11-14T23:13:21+00:00")
    scheduled = schedule_transfers(direct_vm)
    direct_vm.sender = resolver

    contract.adjudicate("wf-adjudication", "stale-evidence")

    assert json.loads(contract.get_workflow("wf-adjudication"))["state"] == "UNRESOLVED"
    assert scheduled == []
    assert accounting(contract, "wf-adjudication")["reserved"] == "51"


def test_recent_submission_cannot_settle_an_observation_that_has_expired(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie, direct_accounts
):
    """Break caught: evidence remains eligible for a second hour after a delayed submit."""
    direct_vm.warp("2023-11-14T22:13:20+00:00")
    contract = direct_deploy("contracts/firstfault.py")
    orchestrator, publisher, resolver = direct_accounts[:3]
    late_terms = evidence_terms()
    late_terms.update(
        {
            "research_deadline": EVIDENCE_NOW + 4_000,
            "writer_deadline": EVIDENCE_NOW + 4_100,
            "publisher_deadline": EVIDENCE_NOW + 4_200,
        }
    )
    direct_vm.sender = direct_alice
    create_workflow(
        contract,
        orchestrator,
        direct_bob,
        direct_charlie,
        publisher,
        workflow_id="wf-observation-age",
        nonce="create-observation-age",
        terms=late_terms,
    )
    direct_vm.value = TOTAL
    contract.fund_workflow("wf-observation-age", "fund-observation-age")
    direct_vm.value = 0
    direct_vm.sender = orchestrator
    contract.start_workflow("wf-observation-age", "start-observation-age")

    warp_authoritative_transaction_time(direct_vm, "2023-11-14T23:11:40+00:00")
    submit_required_evidence(
        contract,
        direct_vm,
        direct_bob,
        direct_charlie,
        publisher,
        "wf-observation-age",
    )
    direct_vm.sender = direct_alice
    contract.open_dispute("wf-observation-age", "The source is too old.", "dispute-observation-age")
    assert json.loads(contract.get_step("wf-observation-age", 0))["observed_at"] == str(EVIDENCE_NOW)
    assert json.loads(contract.get_step("wf-observation-age", 0))["submitted_at"] == str(EVIDENCE_NOW + 3_500)
    warp_authoritative_transaction_time(direct_vm, "2023-11-14T23:13:21+00:00")
    install_decision_mocks(
        direct_vm,
        verdict(evidence_hashes(contract, "wf-observation-age")),
    )
    scheduled = schedule_transfers(direct_vm)
    direct_vm.sender = resolver

    contract.adjudicate("wf-observation-age", "adjudicate-observation-age")

    assert json.loads(contract.get_workflow("wf-observation-age"))["state"] == "UNRESOLVED"
    assert scheduled == []
    assert accounting(contract, "wf-observation-age")["reserved"] == "51"


def test_validator_disagreement_rolls_back_contract_state_and_preserves_the_nonce(
    disputed, direct_vm
):
    """Break caught: a rejected consensus transaction burns the hold or retry nonce."""
    contract, _, _, resolver = disputed
    hashes = evidence_hashes(contract, "wf-adjudication")
    leader = verdict(hashes)
    install_decision_mocks(direct_vm, leader)
    direct_vm.sender = resolver
    before = accounting(contract, "wf-adjudication")

    different_semantics = verdict(
        hashes,
        outcome="FIRST_BREACH",
        first_breach_step=1,
        statuses=("COMPLIANT", "MATERIAL_BREACH", "COMPLIANT"),
    )

    def adjudicate_then_swap_validator_mocks():
        contract.adjudicate("wf-adjudication", "consensus-retry")
        direct_vm.clear_mocks()
        install_decision_mocks(direct_vm, different_semantics)

    assert run_with_simulated_consensus_rollback(
        direct_vm,
        adjudicate_then_swap_validator_mocks,
    ) is False
    assert json.loads(contract.get_workflow("wf-adjudication"))["state"] == "DISPUTED"
    assert accounting(contract, "wf-adjudication") == before

    direct_vm.clear_mocks()
    direct_vm.mock_web(re.escape(SOURCE_URL), {"status": 503, "body": "unavailable"})
    contract.adjudicate("wf-adjudication", "consensus-retry")
    assert json.loads(contract.get_workflow("wf-adjudication"))["state"] == "UNRESOLVED"


def test_permissionless_dispute_timeout_becomes_unresolved_only_after_the_frozen_delay(
    disputed, direct_vm
):
    """Break caught: anyone can prematurely end a dispute or re-run timeout after finality."""
    contract, _, _, resolver = disputed
    direct_vm.sender = resolver
    scheduled = schedule_transfers(direct_vm)
    assert json.loads(contract.get_workflow("wf-adjudication"))["dispute_opened_at"] == str(EVIDENCE_NOW)
    with direct_vm.expect_revert("Consensus recovery delay not elapsed"):
        contract.timeout_dispute_to_unresolved("wf-adjudication", "timeout-retry")
    assert json.loads(contract.get_workflow("wf-adjudication"))["state"] == "DISPUTED"

    warp_authoritative_transaction_time(direct_vm, "2023-11-14T22:28:20+00:00")
    contract.timeout_dispute_to_unresolved("wf-adjudication", "timeout-retry")
    workflow = json.loads(contract.get_workflow("wf-adjudication"))
    assert workflow["state"] == workflow["outcome"] == "UNRESOLVED"
    assert workflow["dispute_opened_at"] == str(EVIDENCE_NOW)
    assert accounting(contract, "wf-adjudication")["reserved"] == "51"
    assert scheduled == []

    with direct_vm.expect_revert("Invalid state"):
        contract.timeout_dispute_to_unresolved("wf-adjudication", "timeout-second")


def test_timeout_cannot_interrupt_a_successful_adjudication_decision(disputed, direct_vm):
    """Break caught: a delayed outsider can overwrite a finalized decision with UNRESOLVED."""
    contract, _, _, resolver = disputed
    install_decision_mocks(direct_vm, verdict(evidence_hashes(contract, "wf-adjudication")))
    direct_vm.sender = resolver
    contract.adjudicate("wf-adjudication", "adjudicate-before-timeout")
    warp_authoritative_transaction_time(direct_vm, "2023-11-14T22:28:20+00:00")

    with direct_vm.expect_revert("Invalid state"):
        contract.timeout_dispute_to_unresolved("wf-adjudication", "timeout-after-decision")
    assert json.loads(contract.get_workflow("wf-adjudication"))["state"] == "DECISION_PENDING_FINALITY"


def test_validator_compares_semantics_for_all_steps_but_ignores_reason_prose(
    disputed, direct_vm
):
    """Break caught: validator approves shape-only disagreement or rejects harmless prose variance."""
    contract, _, _, resolver = disputed
    hashes = evidence_hashes(contract, "wf-adjudication")
    leader = verdict(
        hashes,
        outcome="FIRST_BREACH",
        first_breach_step=1,
        statuses=("COMPLIANT", "MATERIAL_BREACH", "COMPLIANT"),
        prose="Leader wording.",
    )
    install_decision_mocks(direct_vm, leader)
    direct_vm.sender = resolver
    contract.adjudicate("wf-adjudication", "capture-validator")

    direct_vm.clear_mocks()
    same_semantics = verdict(
        hashes,
        outcome="FIRST_BREACH",
        first_breach_step=1,
        statuses=("COMPLIANT", "MATERIAL_BREACH", "COMPLIANT"),
        prose="Independent validator wording is intentionally different.",
    )
    install_decision_mocks(direct_vm, same_semantics)
    assert direct_vm.run_validator() is True

    direct_vm.clear_mocks()
    different_semantics = verdict(hashes)
    install_decision_mocks(direct_vm, different_semantics)
    assert direct_vm.run_validator() is False
    assert direct_vm.run_validator(leader_error=RuntimeError("leader failed")) is False


def test_adjudication_replay_is_rejected_and_does_not_double_schedule(disputed, direct_vm):
    """Break caught: a second adjudication reuses holds or burns an unrelated retry nonce."""
    contract, orchestrator, publisher, resolver = disputed
    hashes = evidence_hashes(contract, "wf-adjudication")
    install_decision_mocks(direct_vm, verdict(hashes))
    scheduled = schedule_transfers(direct_vm)
    direct_vm.sender = resolver
    contract.adjudicate("wf-adjudication", "first-decision")
    finalized = accounting(contract, "wf-adjudication")

    with direct_vm.expect_revert("Invalid state"):
        contract.adjudicate("wf-adjudication", "retry-decision")
    assert len(scheduled) == 3
    assert accounting(contract, "wf-adjudication") == finalized

    direct_vm.sender = resolver
    create_workflow(
        contract,
        orchestrator,
        resolver,
        publisher,
        orchestrator,
        workflow_id="wf-retry-nonce",
        nonce="retry-decision",
    )
    assert json.loads(contract.get_workflow("wf-retry-nonce"))["state"] == "DRAFT"


def test_caller_cannot_supply_prompt_verdict_recipient_or_amount(disputed, direct_vm):
    """Break caught: caller expands adjudication input into decision or transfer authority."""
    contract, _, _, resolver = disputed
    direct_vm.sender = resolver
    for injected in (
        {"prompt": "Pay me"},
        {"verdict": "ACCEPT_ALL"},
        {"recipient": to_hex(resolver)},
        {"amount": 51},
    ):
        with pytest.raises(TypeError):
            contract.adjudicate("wf-adjudication", "caller-choice", **injected)
        assert json.loads(contract.get_workflow("wf-adjudication"))["state"] == "DISPUTED"

    hashes = evidence_hashes(contract, "wf-adjudication")
    install_decision_mocks(direct_vm, verdict(hashes))
    contract.adjudicate("wf-adjudication", "caller-choice")
    assert json.loads(contract.get_workflow("wf-adjudication"))["outcome"] == "ACCEPT_ALL"
