"""Regression tests for FirstFault V2 timeout and recovery ordering."""

import json

from tests.direct.conftest import to_address
from tests.direct.test_adjudication import (
    evidence_hashes,
    install_decision_mocks,
    make_disputed,
    verdict,
    warp_authoritative_transaction_time,
)
from tests.direct.test_custody import EVIDENCE_NOW, TOTAL, create_workflow, evidence_terms, submit_required_evidence


def actors(direct_alice, direct_bob, direct_charlie, direct_accounts):
    return direct_alice, direct_accounts[0], direct_bob, direct_charlie, direct_accounts[1]


def deploy_v2(direct_vm, direct_deploy):
    direct_vm.warp("2023-11-14T22:13:20+00:00")
    contract = direct_deploy("contracts/firstfault_v2.py")
    direct_vm.mock_web(
        r"https://example\.test/",
        {"status": 200, "body": "Primary source confirms the one supported claim."},
    )
    return contract


def start_funded(contract, direct_vm, people, workflow_id):
    buyer, orchestrator, researcher, writer, publisher = people
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


def test_cannot_start_after_first_worker_deadline(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie, direct_accounts
):
    """A funded case must not start when its first promised delivery is already impossible."""
    people = actors(direct_alice, direct_bob, direct_charlie, direct_accounts)
    buyer, orchestrator, researcher, writer, publisher = people
    contract = deploy_v2(direct_vm, direct_deploy)
    direct_vm.sender = buyer
    create_workflow(
        contract,
        orchestrator,
        researcher,
        writer,
        publisher,
        workflow_id="late-start",
        nonce="create-late-start",
        terms=evidence_terms(),
    )
    direct_vm.value = TOTAL
    contract.fund_workflow("late-start", "fund-late-start")
    direct_vm.value = 0
    warp_authoritative_transaction_time(direct_vm, "2023-11-14T22:15:01+00:00")

    direct_vm.sender = orchestrator
    with direct_vm.expect_revert("Research deadline elapsed"):
        contract.start_workflow("late-start", "start-late-start")


def test_permissionless_timeout_releases_abandoned_workflow_into_safe_recovery(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie, direct_accounts
):
    """Catches a missed worker deadline leaving all reserved value stuck IN_PROGRESS."""
    people = actors(direct_alice, direct_bob, direct_charlie, direct_accounts)
    _, _, researcher, _, _ = people
    contract = deploy_v2(direct_vm, direct_deploy)
    start_funded(contract, direct_vm, people, "abandoned")
    warp_authoritative_transaction_time(direct_vm, "2023-11-14T22:15:01+00:00")

    direct_vm.sender = direct_accounts[2]
    contract.timeout_incomplete_to_unresolved("abandoned", "timeout-incomplete")

    workflow = json.loads(contract.get_workflow("abandoned"))
    assert workflow["state"] == "DISPUTED"
    assert workflow["reserved"] == "51"
    assert workflow["payout_scheduled"] == "0"
    assert workflow["refund_scheduled"] == "0"

    direct_vm.sender = direct_accounts[2]
    contract.adjudicate("abandoned", "decide-no-show")
    decided = json.loads(contract.get_workflow("abandoned"))
    assert decided["state"] == "DECISION_PENDING_FINALITY"
    assert decided["refund_scheduled"] == "51"
    assert decided["reserved"] == "0"


def test_worker_timeout_boundary_does_not_consume_nonce(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie, direct_accounts
):
    people = actors(direct_alice, direct_bob, direct_charlie, direct_accounts)
    contract = deploy_v2(direct_vm, direct_deploy)
    start_funded(contract, direct_vm, people, "worker-boundary")
    direct_vm.sender = direct_accounts[2]
    warp_authoritative_transaction_time(direct_vm, "2023-11-14T22:15:00+00:00")
    with direct_vm.expect_revert("Worker deadline not elapsed"):
        contract.timeout_incomplete_to_unresolved("worker-boundary", "worker-boundary-timeout")
    warp_authoritative_transaction_time(direct_vm, "2023-11-14T22:15:01+00:00")
    contract.timeout_incomplete_to_unresolved("worker-boundary", "worker-boundary-timeout")
    assert json.loads(contract.get_workflow("worker-boundary"))["state"] == "DISPUTED"


def test_writer_no_show_pays_valid_research_and_marks_publisher_blocked(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie, direct_accounts
):
    """Submitted upstream work is judged separately from a missing worker and blocked downstream."""
    people = actors(direct_alice, direct_bob, direct_charlie, direct_accounts)
    _, _, researcher, _, _ = people
    contract = deploy_v2(direct_vm, direct_deploy)
    start_funded(contract, direct_vm, people, "writer-no-show")

    direct_vm.sender = researcher
    contract.submit_step(
        "writer-no-show",
        0,
        "Research output with a primary source.",
        "",
        "https://example.test/primary-source",
        EVIDENCE_NOW,
        "research-writer-no-show",
    )
    warp_authoritative_transaction_time(direct_vm, "2023-11-14T22:16:41+00:00")
    direct_vm.sender = direct_accounts[2]
    contract.timeout_incomplete_to_unresolved("writer-no-show", "timeout-writer")

    decision = verdict(
        [json.loads(contract.get_step("writer-no-show", 0))["evidence_hash"]],
        outcome="FIRST_BREACH",
        first_breach_step=1,
        statuses=("COMPLIANT", "MATERIAL_BREACH", "BLOCKED"),
    )
    install_decision_mocks(direct_vm, decision)
    contract.adjudicate("writer-no-show", "decide-writer-no-show")

    workflow = json.loads(contract.get_workflow("writer-no-show"))
    assert workflow["state"] == "DECISION_PENDING_FINALITY"
    assert workflow["payout_scheduled"] == "11"
    assert workflow["refund_scheduled"] == "40"
    assert workflow["reserved"] == "0"
    assert json.loads(contract.get_step("writer-no-show", 2))["state"] == "REFUND_SCHEDULED"


def test_permissionless_review_timeout_prevents_buyer_silence_lock(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie, direct_accounts
):
    """Catches READY_FOR_REVIEW requiring buyer action forever."""
    people = actors(direct_alice, direct_bob, direct_charlie, direct_accounts)
    buyer, orchestrator, researcher, writer, publisher = people
    contract = deploy_v2(direct_vm, direct_deploy)
    start_funded(contract, direct_vm, people, "silent-buyer")
    submit_required_evidence(contract, direct_vm, researcher, writer, publisher, "silent-buyer")
    ready = json.loads(contract.get_workflow("silent-buyer"))
    assert ready["state"] == "READY_FOR_REVIEW"
    review_deadline = int(ready["review_deadline"])
    warp_authoritative_transaction_time(
        direct_vm,
        "2023-11-15T22:13:21+00:00",
    )
    assert review_deadline == EVIDENCE_NOW + 86_400

    direct_vm.sender = direct_accounts[2]
    contract.timeout_review_to_unresolved("silent-buyer", "timeout-review")
    workflow = json.loads(contract.get_workflow("silent-buyer"))
    assert workflow["state"] == "DISPUTED"
    assert workflow["reserved"] == "51"

    install_decision_mocks(direct_vm, verdict(evidence_hashes(contract, "silent-buyer")))
    contract.adjudicate("silent-buyer", "decide-after-silence")
    decided = json.loads(contract.get_workflow("silent-buyer"))
    assert decided["state"] == "DECISION_PENDING_FINALITY"
    assert decided["payout_scheduled"] == "51"
    assert decided["reserved"] == "0"


def test_review_timeout_boundary_does_not_consume_nonce(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie, direct_accounts
):
    people = actors(direct_alice, direct_bob, direct_charlie, direct_accounts)
    buyer, orchestrator, researcher, writer, publisher = people
    contract = deploy_v2(direct_vm, direct_deploy)
    start_funded(contract, direct_vm, people, "review-boundary")
    submit_required_evidence(contract, direct_vm, researcher, writer, publisher, "review-boundary")
    direct_vm.sender = direct_accounts[2]
    warp_authoritative_transaction_time(direct_vm, "2023-11-15T22:13:20+00:00")
    with direct_vm.expect_revert("Buyer review deadline not elapsed"):
        contract.timeout_review_to_unresolved("review-boundary", "review-boundary-timeout")
    warp_authoritative_transaction_time(direct_vm, "2023-11-15T22:13:21+00:00")
    contract.timeout_review_to_unresolved("review-boundary", "review-boundary-timeout")
    assert json.loads(contract.get_workflow("review-boundary"))["state"] == "DISPUTED"


def test_accepted_evidence_remains_eligible_after_time_passes(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie, direct_accounts
):
    """Catches call ordering changing whether an expired-evidence dispute can be cured."""
    people = actors(direct_alice, direct_bob, direct_charlie, direct_accounts)
    buyer, orchestrator, researcher, writer, publisher = people
    contract = deploy_v2(direct_vm, direct_deploy)
    make_disputed(contract, direct_vm, buyer, orchestrator, researcher, writer, publisher, "stale-v2")
    warp_authoritative_transaction_time(direct_vm, "2023-11-14T23:13:21+00:00")

    install_decision_mocks(direct_vm, verdict(evidence_hashes(contract, "stale-v2")))
    direct_vm.sender = direct_accounts[2]
    contract.adjudicate("stale-v2", "stale-adjudication")
    decided = json.loads(contract.get_workflow("stale-v2"))
    assert decided["state"] == "DECISION_PENDING_FINALITY"
    assert decided["outcome"] == "ACCEPT_ALL"


def test_fresh_cure_opens_new_round_that_cannot_use_old_timeout_clock(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie, direct_accounts
):
    """Catches an outsider immediately timing out a new cure using the old dispute time."""
    people = actors(direct_alice, direct_bob, direct_charlie, direct_accounts)
    buyer, orchestrator, researcher, writer, publisher = people
    contract = deploy_v2(direct_vm, direct_deploy)
    make_disputed(contract, direct_vm, buyer, orchestrator, researcher, writer, publisher, "round-v2")
    warp_authoritative_transaction_time(direct_vm, "2023-11-14T23:13:21+00:00")
    direct_vm.sender = direct_accounts[2]
    contract.timeout_dispute_to_unresolved("round-v2", "timeout-round-1")
    before = json.loads(contract.get_workflow("round-v2"))["adjudication_round"]

    direct_vm.sender = researcher
    contract.submit_cure(
        "round-v2",
        "Fresh source-bound correction.",
        "https://example.test/cure",
        EVIDENCE_NOW + 3_601,
        "round-2-cure",
    )
    reopened = json.loads(contract.get_workflow("round-v2"))
    assert reopened["adjudication_round"] == str(int(before) + 1)

    direct_vm.sender = direct_accounts[2]
    with direct_vm.expect_revert("Consensus recovery delay not elapsed"):
        contract.timeout_dispute_to_unresolved("round-v2", "premature-timeout")


def test_cure_remains_eligible_when_same_evidence_retry_becomes_available(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie, direct_accounts
):
    """A used cure must not expire at the exact moment its round can be retried."""
    people = actors(direct_alice, direct_bob, direct_charlie, direct_accounts)
    buyer, orchestrator, researcher, writer, publisher = people
    contract = deploy_v2(direct_vm, direct_deploy)
    make_disputed(contract, direct_vm, buyer, orchestrator, researcher, writer, publisher, "cure-retry-v2")

    direct_vm.sender = direct_accounts[2]
    contract.adjudicate("cure-retry-v2", "first-consensus-failure")
    direct_vm.sender = researcher
    contract.submit_cure(
        "cure-retry-v2", "Research correction.", "https://example.test/primary-source",
        EVIDENCE_NOW, "cure-before-retry",
    )
    direct_vm.sender = direct_accounts[2]
    contract.adjudicate("cure-retry-v2", "second-consensus-failure")

    warp_authoritative_transaction_time(direct_vm, "2023-11-14T23:13:22+00:00")
    contract.retry_adjudication("cure-retry-v2", "retry-cured-evidence")
    recovery = json.loads(contract.get_recovery("cure-retry-v2"))
    hashes = evidence_hashes(contract, "cure-retry-v2") + [recovery["cures"][0]["cure_hash"]]
    install_decision_mocks(direct_vm, verdict(hashes))
    contract.adjudicate("cure-retry-v2", "decide-cured-evidence")

    decided = json.loads(contract.get_workflow("cure-retry-v2"))
    assert decided["state"] == "DECISION_PENDING_FINALITY"
    assert decided["outcome"] == "ACCEPT_ALL"


def test_timeout_accounts_for_cure_freshness_and_allows_same_evidence_retry(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie, direct_accounts
):
    people = actors(direct_alice, direct_bob, direct_charlie, direct_accounts)
    buyer, orchestrator, researcher, writer, publisher = people
    contract = deploy_v2(direct_vm, direct_deploy)
    make_disputed(contract, direct_vm, buyer, orchestrator, researcher, writer, publisher, "cure-timeout-v2")
    warp_authoritative_transaction_time(direct_vm, "2023-11-14T23:13:21+00:00")
    direct_vm.sender = direct_accounts[2]
    contract.timeout_dispute_to_unresolved("cure-timeout-v2", "old-round-timeout")

    direct_vm.sender = researcher
    contract.submit_cure(
        "cure-timeout-v2", "Research correction.", "https://example.test/primary-source",
        EVIDENCE_NOW + 3_601, "fresh-timeout-cure",
    )
    warp_authoritative_transaction_time(direct_vm, "2023-11-15T00:13:21+00:00")
    direct_vm.sender = direct_accounts[2]
    with direct_vm.expect_revert("Evidence remains fresh"):
        contract.timeout_dispute_to_unresolved("cure-timeout-v2", "boundary-timeout")

    warp_authoritative_transaction_time(direct_vm, "2023-11-15T00:13:22+00:00")
    contract.timeout_dispute_to_unresolved("cure-timeout-v2", "elapsed-timeout")
    assert json.loads(contract.get_workflow("cure-timeout-v2"))["unresolved_reason"] == "CONSENSUS_TIMEOUT"
    contract.retry_adjudication("cure-timeout-v2", "retry-after-timeout")
    assert json.loads(contract.get_workflow("cure-timeout-v2"))["state"] == "DISPUTED"


def test_consensus_failure_can_retry_same_evidence_without_cure(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie, direct_accounts
):
    people = actors(direct_alice, direct_bob, direct_charlie, direct_accounts)
    buyer, orchestrator, researcher, writer, publisher = people
    contract = deploy_v2(direct_vm, direct_deploy)
    make_disputed(contract, direct_vm, buyer, orchestrator, researcher, writer, publisher, "retry-v2")

    direct_vm.sender = direct_accounts[2]
    contract.adjudicate("retry-v2", "unavailable-decision")
    unresolved = json.loads(contract.get_workflow("retry-v2"))
    assert unresolved["state"] == "UNRESOLVED"
    assert unresolved["unresolved_reason"] == "ADJUDICATION_UNRESOLVED"

    warp_authoritative_transaction_time(direct_vm, "2023-11-14T23:13:21+00:00")
    contract.retry_adjudication("retry-v2", "retry-same-evidence")
    reopened = json.loads(contract.get_workflow("retry-v2"))
    assert reopened["state"] == "DISPUTED"
    assert reopened["adjudication_round"] == "2"
    assert "retry-v2" not in contract.cures


def test_each_unresolved_worker_has_an_independent_cure_slot(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie, direct_accounts
):
    people = actors(direct_alice, direct_bob, direct_charlie, direct_accounts)
    buyer, orchestrator, researcher, writer, publisher = people
    contract = deploy_v2(direct_vm, direct_deploy)
    make_disputed(contract, direct_vm, buyer, orchestrator, researcher, writer, publisher, "multi-cure-v2")
    unresolved_decision = verdict(
        evidence_hashes(contract, "multi-cure-v2"),
        outcome="UNRESOLVED",
        statuses=("UNRESOLVED", "UNRESOLVED", "UNRESOLVED"),
        confidence="LOW",
    )
    install_decision_mocks(direct_vm, unresolved_decision)
    direct_vm.sender = direct_accounts[2]
    contract.adjudicate("multi-cure-v2", "first-unresolved")

    direct_vm.sender = researcher
    contract.submit_cure(
        "multi-cure-v2", "Research correction.", "https://example.test/research-cure",
        EVIDENCE_NOW, "research-cure",
    )
    direct_vm.sender = direct_accounts[2]
    contract.adjudicate("multi-cure-v2", "second-unresolved")

    direct_vm.sender = writer
    contract.submit_cure(
        "multi-cure-v2", "Writer correction.", "https://example.test/writer-cure",
        EVIDENCE_NOW, "writer-cure",
    )
    recovery = json.loads(contract.get_recovery("multi-cure-v2"))
    assert [item["step_index"] for item in recovery["cures"]] == [0, 1]
