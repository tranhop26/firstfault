"""Adversarial recovery tests for FirstFault's frozen V1 contract."""

import json
import re

import pytest

from tests.direct.conftest import to_hex
from tests.direct.test_adjudication import (
    PROMPT_PATTERN,
    SOURCE_URL,
    evidence_hashes,
    install_decision_mocks,
    make_disputed,
    verdict,
    warp_authoritative_transaction_time,
)
from tests.direct.test_custody import (
    EVIDENCE_NOW,
    TOTAL,
    accounting,
    assert_conserved,
    schedule_transfers,
)


CURE_SOURCE = "https://example.test/cure-evidence"
CURE_TEXT = "A fresh primary-source extract resolves the disputed support gap."


@pytest.fixture
def unresolved(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie, direct_accounts
):
    """Create one funded unresolved workflow through the real public lifecycle."""
    direct_vm.warp("2023-11-14T22:13:20+00:00")
    contract = direct_deploy("contracts/firstfault.py")
    orchestrator, publisher, outsider = direct_accounts[:3]
    make_disputed(
        contract,
        direct_vm,
        direct_alice,
        orchestrator,
        direct_bob,
        direct_charlie,
        publisher,
        workflow_id="wf-recovery",
    )
    hashes = evidence_hashes(contract, "wf-recovery")
    unresolved_decision = verdict(
        hashes,
        outcome="UNRESOLVED",
        statuses=("UNRESOLVED", "UNRESOLVED", "UNRESOLVED"),
        confidence="LOW",
    )
    install_decision_mocks(direct_vm, unresolved_decision)
    direct_vm.sender = outsider
    contract.adjudicate("wf-recovery", "adjudicate-unresolved")
    return contract, direct_alice, orchestrator, direct_bob, direct_charlie, publisher, outsider


def submit_cure(contract, workflow_id="wf-recovery", nonce="cure-1", **overrides):
    """Submit literal cure evidence while allowing one field to exercise a guard."""
    values = {
        "evidence_text": CURE_TEXT,
        "source_url": CURE_SOURCE,
        "observed_at": EVIDENCE_NOW,
    }
    values.update(overrides)
    contract.submit_cure(workflow_id, nonce=nonce, **values)


def propose(contract, workflow_id="wf-recovery", nonce="proposal-1", amounts=(11, 17, 13, 10)):
    """Propose a hand-checked 51 GEN allocation."""
    contract.propose_mutual_settlement(workflow_id, *amounts, nonce)


def approve_all(contract, direct_vm, buyer, researcher, writer, publisher, prefix="approve"):
    """Collect the four exact current-version approvals through the public method."""
    proposal = json.loads(contract.get_recovery("wf-recovery"))["settlement"]
    version = int(proposal["version"])
    proposal_hash = proposal["proposal_hash"]
    for label, actor in (
        ("buyer", buyer),
        ("researcher", researcher),
        ("writer", writer),
        ("publisher", publisher),
    ):
        direct_vm.sender = actor
        contract.approve_mutual_settlement(
            "wf-recovery", version, proposal_hash, prefix + "-" + label
        )


def test_unresolved_and_cure_paths_never_schedule_a_transfer(
    unresolved, direct_vm
):
    """Break caught: unresolved or a cure releases held value before a verdict/settlement."""
    contract, _, _, researcher, _, _, _ = unresolved
    scheduled = schedule_transfers(direct_vm)
    before = accounting(contract, "wf-recovery")
    direct_vm.sender = researcher
    submit_cure(contract)

    assert scheduled == []
    assert accounting(contract, "wf-recovery") == before
    assert_conserved(before)
    assert json.loads(contract.get_workflow("wf-recovery"))["state"] == "DISPUTED"


def test_only_an_affected_worker_can_append_one_fresh_cure_without_replacing_evidence(
    unresolved, direct_vm
):
    """Break caught: an outsider cures a dispute or cure overwrites the original evidence."""
    contract, buyer, _, researcher, _, _, outsider = unresolved
    original = json.loads(contract.get_step("wf-recovery", 0))

    for wrong_actor in (outsider, buyer):
        direct_vm.sender = wrong_actor
        with direct_vm.expect_revert("Affected worker only"):
            submit_cure(contract, nonce="retry-cure-auth")

    direct_vm.sender = researcher
    submit_cure(contract, nonce="retry-cure-auth")
    after = json.loads(contract.get_step("wf-recovery", 0))
    recovery = json.loads(contract.get_recovery("wf-recovery"))

    assert after == original
    assert recovery["cure"]["step_index"] == 0
    assert recovery["cure"]["actor"] == to_hex(researcher)
    assert recovery["cure"]["original_evidence_hash"] == original["evidence_hash"]
    assert recovery["cure"]["cure_hash"] != original["evidence_hash"]
    assert recovery["cure"]["submitted_at"] == str(EVIDENCE_NOW)
    assert recovery["cure"]["schema_version"] == "firstfault-cure-v1"
    assert recovery["cure"]["prior_verdict"]["outcome"] == "UNRESOLVED"


@pytest.mark.parametrize(
    ("overrides", "error"),
    [
        ({"evidence_text": ""}, "Cure evidence required"),
        ({"source_url": "http://example.test/cure"}, "Invalid research source URL"),
        ({"observed_at": EVIDENCE_NOW - 3_601}, "Observation is stale"),
        ({"observed_at": EVIDENCE_NOW + 1}, "Observation is in the future"),
    ],
)
def test_invalid_cure_data_is_rejected_without_consuming_nonce(
    unresolved, direct_vm, overrides, error
):
    """Break caught: malformed cure data is stored or burns the worker's retry nonce."""
    contract, _, _, researcher, _, _, _ = unresolved
    direct_vm.sender = researcher
    with direct_vm.expect_revert(error):
        submit_cure(contract, nonce="retry-invalid-cure", **overrides)
    submit_cure(contract, nonce="retry-invalid-cure")


def test_cure_is_global_once_and_replay_cannot_replace_it(unresolved, direct_vm):
    """Break caught: a second worker replaces the one authoritative cure or replays it."""
    contract, _, _, researcher, writer, _, _ = unresolved
    direct_vm.sender = researcher
    submit_cure(contract, nonce="single-cure")
    first = json.loads(contract.get_recovery("wf-recovery"))["cure"]

    direct_vm.sender = writer
    with direct_vm.expect_revert("Invalid state"):
        submit_cure(
            contract,
            nonce="second-cure",
            evidence_text="A conflicting replacement cure.",
        )
    with direct_vm.expect_revert("Invalid state"):
        submit_cure(contract, nonce="single-cure")
    assert json.loads(contract.get_recovery("wf-recovery"))["cure"] == first


def test_cure_reenters_adjudication_and_binds_the_appended_hash(
    unresolved, direct_vm
):
    """Break caught: adjudication ignores the cure or accepts a verdict omitting its hash."""
    contract, _, _, researcher, _, _, outsider = unresolved
    direct_vm.sender = researcher
    submit_cure(contract)
    recovery = json.loads(contract.get_recovery("wf-recovery"))
    all_hashes = evidence_hashes(contract, "wf-recovery") + [recovery["cure"]["cure_hash"]]
    direct_vm.clear_mocks()
    install_decision_mocks(direct_vm, verdict(all_hashes))
    direct_vm.mock_web(re.escape(CURE_SOURCE), {"status": 200, "body": CURE_TEXT})
    direct_vm.sender = outsider
    contract.adjudicate("wf-recovery", "adjudicate-after-cure")

    workflow = json.loads(contract.get_workflow("wf-recovery"))
    assert workflow["outcome"] == "ACCEPT_ALL"
    assert workflow["verdict"]["cited_evidence_hashes"] == all_hashes


def test_cure_rejects_after_original_evidence_expiry_instead_of_reopening_an_invalid_dispute(
    unresolved, direct_vm
):
    """Break caught: a fresh cure reopens adjudication around expired original evidence."""
    contract, _, _, researcher, _, _, _ = unresolved
    warp_authoritative_transaction_time(direct_vm, "2023-11-14T23:13:21+00:00")
    direct_vm.sender = researcher
    with direct_vm.expect_revert("Original evidence expired"):
        submit_cure(
            contract,
            nonce="expired-cure",
            observed_at=EVIDENCE_NOW + 3_601,
        )
    assert json.loads(contract.get_workflow("wf-recovery"))["state"] == "UNRESOLVED"
    assert accounting(contract, "wf-recovery")["reserved"] == "51"


@pytest.mark.parametrize(
    ("amounts", "error"),
    [
        ((11, 17, 13, 9), "Allocation must equal reserved value"),
        ((11, 17, 13, 11), "Allocation must equal reserved value"),
    ],
)
def test_settlement_allocation_must_equal_current_reserved_without_burning_nonce(
    unresolved, direct_vm, amounts, error
):
    """Break caught: mutual settlement creates a deficit/surplus or burns its retry nonce."""
    contract, buyer, _, _, _, _, _ = unresolved
    direct_vm.sender = buyer
    with direct_vm.expect_revert(error):
        propose(contract, nonce="retry-allocation", amounts=amounts)
    propose(contract, nonce="retry-allocation")
    proposal = json.loads(contract.get_recovery("wf-recovery"))["settlement"]
    assert proposal["version"] == "1"
    assert proposal["proposal_hash"] != ""


def test_only_a_workflow_party_can_propose_or_approve(
    unresolved, direct_vm
):
    """Break caught: an outsider authors/approves allocation or settlement starts outside UNRESOLVED."""
    contract, buyer, _, researcher, _, _, outsider = unresolved
    direct_vm.sender = outsider
    with direct_vm.expect_revert("Workflow party only"):
        propose(contract, nonce="retry-party-propose")

    direct_vm.sender = buyer
    propose(contract, nonce="retry-party-propose")
    direct_vm.sender = outsider
    with direct_vm.expect_revert("Workflow party only"):
        proposal = json.loads(contract.get_recovery("wf-recovery"))["settlement"]
        contract.approve_mutual_settlement(
            "wf-recovery", int(proposal["version"]), proposal["proposal_hash"], "retry-party-approve"
        )

    direct_vm.sender = researcher
    submit_cure(contract, nonce="cure-after-proposal")
    assert "settlement" not in json.loads(contract.get_recovery("wf-recovery"))


def test_mutual_settlement_cannot_be_proposed_after_cure_reopens_adjudication(
    unresolved, direct_vm
):
    """Break caught: settlement negotiation starts while the cured dispute is active."""
    contract, buyer, _, researcher, _, _, _ = unresolved
    direct_vm.sender = researcher
    submit_cure(contract)
    direct_vm.sender = buyer
    with direct_vm.expect_revert("Invalid state"):
        propose(contract, nonce="proposal-after-cure")


def test_pending_proposal_does_not_block_one_cure_and_clears_stale_approvals(
    unresolved, direct_vm
):
    """Break caught: one hostile proposal permanently locks the cure route."""
    contract, buyer, _, researcher, _, _, _ = unresolved
    direct_vm.sender = buyer
    propose(contract)
    proposal = json.loads(contract.get_recovery("wf-recovery"))["settlement"]
    contract.approve_mutual_settlement(
        "wf-recovery", int(proposal["version"]), proposal["proposal_hash"], "proposal-approval-buyer"
    )
    direct_vm.sender = researcher
    contract.approve_mutual_settlement(
        "wf-recovery", int(proposal["version"]), proposal["proposal_hash"], "proposal-approval-researcher"
    )

    submit_cure(contract, nonce="cure-after-pending-proposal")

    recovery = json.loads(contract.get_recovery("wf-recovery"))
    assert "settlement" not in recovery
    assert json.loads(contract.get_workflow("wf-recovery"))["state"] == "DISPUTED"


def test_unanimously_approved_settlement_cannot_be_overwritten_by_cure(
    unresolved, direct_vm
):
    """Break caught: a cure can race a fully approved terminal settlement."""
    contract, buyer, _, researcher, writer, publisher, _ = unresolved
    direct_vm.sender = buyer
    propose(contract)
    approve_all(contract, direct_vm, buyer, researcher, writer, publisher)
    direct_vm.sender = researcher
    with direct_vm.expect_revert("Settlement unanimously approved"):
        submit_cure(contract, nonce="cure-after-unanimous")
    assert json.loads(contract.get_workflow("wf-recovery"))["state"] == "UNRESOLVED"


def test_cure_source_unavailable_keeps_unresolved_hold_without_transfer(
    unresolved, direct_vm
):
    """Break caught: a worker assertion settles despite an unavailable cited source."""
    contract, _, _, researcher, _, _, outsider = unresolved
    direct_vm.sender = researcher
    submit_cure(contract)
    all_hashes = evidence_hashes(contract, "wf-recovery") + [
        json.loads(contract.get_recovery("wf-recovery"))["cure"]["cure_hash"]
    ]
    install_decision_mocks(direct_vm, verdict(all_hashes))
    direct_vm.mock_web(re.escape(CURE_SOURCE), {"status": 503, "body": "unavailable"})
    scheduled = schedule_transfers(direct_vm)
    direct_vm.sender = outsider
    contract.adjudicate("wf-recovery", "cure-source-unavailable")

    workflow = json.loads(contract.get_workflow("wf-recovery"))
    assert workflow["state"] == "UNRESOLVED"
    assert scheduled == []
    assert accounting(contract, "wf-recovery")["reserved"] == "51"


def test_cure_source_contradiction_keeps_unresolved_hold_without_transfer(
    unresolved, direct_vm
):
    """Break caught: a source contradicting the cure assertion still authorizes payout."""
    contract, _, _, researcher, _, _, outsider = unresolved
    direct_vm.sender = researcher
    submit_cure(contract)
    all_hashes = evidence_hashes(contract, "wf-recovery") + [
        json.loads(contract.get_recovery("wf-recovery"))["cure"]["cure_hash"]
    ]
    install_decision_mocks(direct_vm, verdict(all_hashes))
    direct_vm.mock_web(
        re.escape(CURE_SOURCE),
        {"status": 200, "body": "The source says the opposite and rejects the claim."},
    )
    scheduled = schedule_transfers(direct_vm)
    direct_vm.sender = outsider
    contract.adjudicate("wf-recovery", "cure-source-contradiction")

    workflow = json.loads(contract.get_workflow("wf-recovery"))
    assert workflow["state"] == "UNRESOLVED"
    assert scheduled == []
    assert accounting(contract, "wf-recovery")["reserved"] == "51"


def test_cured_prompt_requires_all_four_authoritative_hashes(unresolved):
    """Break caught: the frozen prompt still asks a cured dispute for three citations."""
    contract, *_ = unresolved
    evidence = [
        {"step_index": 0, "evidence_hash": "h-research"},
        {"step_index": 1, "evidence_hash": "h-writer"},
        {
            "step_index": 2,
            "evidence_hash": "h-publisher",
            "cure": {"cure_hash": "h-cure"},
        },
    ]
    prompt = contract._adjudication_prompt(
        "rubric", "v1", "rejection", evidence, "research-render", "cure-render"
    )
    assert "exactly 4" in prompt
    assert "h-cure" in prompt
    assert "rendered_cure_source" in prompt


def test_uncured_prompt_omits_cure_policy_and_absent_cure_source(unresolved):
    """Break caught: a first-pass dispute is told an absent cure source is unsafe."""
    contract, *_ = unresolved
    evidence = [
        {"step_index": 0, "evidence_hash": "h-research"},
        {"step_index": 1, "evidence_hash": "h-writer"},
        {"step_index": 2, "evidence_hash": "h-publisher"},
    ]
    prompt = contract._adjudication_prompt(
        "rubric", "v1", "rejection", evidence, "research-render"
    )
    assert "rendered_cure_source" not in prompt
    assert "semantically support the submitted cure claim" not in prompt
    assert "quoted negation" not in prompt


def test_timeout_unresolved_accepts_one_fresh_cure_as_new_evidence_anchor(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie, direct_accounts
):
    """Break caught: consensus-timeout UNRESOLVED can never be safely re-adjudicated."""
    direct_vm.warp("2023-11-14T22:13:20+00:00")
    contract = direct_deploy("contracts/firstfault.py")
    orchestrator, publisher, outsider = direct_accounts[:3]
    make_disputed(
        contract,
        direct_vm,
        direct_alice,
        orchestrator,
        direct_bob,
        direct_charlie,
        publisher,
        workflow_id="wf-timeout-cure",
    )
    warp_authoritative_transaction_time(direct_vm, "2023-11-14T23:13:21+00:00")
    direct_vm.sender = outsider
    contract.timeout_dispute_to_unresolved("wf-timeout-cure", "timeout-before-cure")

    direct_vm.sender = direct_bob
    contract.submit_cure(
        "wf-timeout-cure",
        CURE_TEXT,
        CURE_SOURCE,
        EVIDENCE_NOW + 3_601,
        "timeout-cure",
    )
    recovery = json.loads(contract.get_recovery("wf-timeout-cure"))
    all_hashes = evidence_hashes(contract, "wf-timeout-cure") + [
        recovery["cure"]["cure_hash"]
    ]
    install_decision_mocks(direct_vm, verdict(all_hashes))
    direct_vm.mock_web(re.escape(CURE_SOURCE), {"status": 200, "body": CURE_TEXT})
    direct_vm.sender = outsider
    contract.adjudicate("wf-timeout-cure", "timeout-cure-adjudicate")

    assert json.loads(contract.get_workflow("wf-timeout-cure"))["state"] == "DECISION_PENDING_FINALITY"


def test_replacement_binds_new_amounts_and_invalidates_every_prior_approval(
    unresolved, direct_vm
):
    """Break caught: approvals for an old allocation authorize a replacement proposal."""
    contract, buyer, _, researcher, writer, publisher, _ = unresolved
    direct_vm.sender = buyer
    propose(contract)
    for label, actor in (("buyer", buyer), ("researcher", researcher)):
        direct_vm.sender = actor
        proposal = json.loads(contract.get_recovery("wf-recovery"))["settlement"]
        contract.approve_mutual_settlement(
            "wf-recovery", int(proposal["version"]), proposal["proposal_hash"], "approve-v1-" + label
        )
    first = json.loads(contract.get_recovery("wf-recovery"))["settlement"]

    direct_vm.sender = writer
    propose(contract, nonce="proposal-2", amounts=(10, 16, 15, 10))
    second = json.loads(contract.get_recovery("wf-recovery"))["settlement"]

    assert second["version"] == "2"
    assert second["proposal_hash"] != first["proposal_hash"]
    assert second["approvals"] == {
        "buyer": False,
        "researcher": False,
        "writer": False,
        "publisher": False,
    }
    direct_vm.sender = publisher
    with direct_vm.expect_revert("Unanimous approval required"):
        contract.execute_mutual_settlement("wf-recovery", "execute-before-reapproval")


def test_approval_must_bind_expected_version_and_hash_before_nonce_consumption(
    unresolved, direct_vm
):
    """Break caught: a delayed approval silently approves a replacement proposal."""
    contract, buyer, _, _, writer, _, _ = unresolved
    direct_vm.sender = buyer
    propose(contract, nonce="proposal-a")
    first = json.loads(contract.get_recovery("wf-recovery"))["settlement"]
    direct_vm.sender = writer
    propose(contract, nonce="proposal-b", amounts=(10, 16, 15, 10))
    second = json.loads(contract.get_recovery("wf-recovery"))["settlement"]

    direct_vm.sender = buyer
    with direct_vm.expect_revert("Proposal binding mismatch"):
        contract.approve_mutual_settlement(
            "wf-recovery", int(first["version"]), first["proposal_hash"], "delayed-approval"
        )
    contract.approve_mutual_settlement(
        "wf-recovery", int(second["version"]), second["proposal_hash"], "delayed-approval"
    )


def test_unanimous_proposal_cannot_be_replaced_before_cure_or_execution(
    unresolved, direct_vm
):
    """Break caught: one party replaces a fully approved proposal before execution."""
    contract, buyer, _, researcher, writer, publisher, _ = unresolved
    direct_vm.sender = buyer
    propose(contract, nonce="locked-proposal")
    approve_all(contract, direct_vm, buyer, researcher, writer, publisher, prefix="locked-approve")
    locked = json.loads(contract.get_recovery("wf-recovery"))["settlement"]
    direct_vm.sender = writer
    with direct_vm.expect_revert("Proposal already unanimously approved"):
        propose(contract, nonce="replace-locked", amounts=(10, 16, 15, 10))
    assert json.loads(contract.get_recovery("wf-recovery"))["settlement"] == locked


def test_cure_invalidation_advances_proposal_generation_after_re_adjudication(
    unresolved, direct_vm
):
    """Break caught: clearing proposal A lets proposal B reuse version 1/hash."""
    contract, buyer, _, researcher, _, _, outsider = unresolved
    direct_vm.sender = buyer
    propose(contract, nonce="generation-proposal-a")
    first = json.loads(contract.get_recovery("wf-recovery"))["settlement"]
    direct_vm.sender = researcher
    submit_cure(contract, nonce="generation-cure")
    recovery = json.loads(contract.get_recovery("wf-recovery"))
    all_hashes = evidence_hashes(contract, "wf-recovery") + [recovery["cure"]["cure_hash"]]
    direct_vm.clear_mocks()
    install_decision_mocks(
        direct_vm,
        verdict(
            all_hashes,
            outcome="UNRESOLVED",
            statuses=("UNRESOLVED", "UNRESOLVED", "UNRESOLVED"),
            confidence="LOW",
        ),
    )
    direct_vm.mock_web(re.escape(CURE_SOURCE), {"status": 200, "body": CURE_TEXT})
    direct_vm.sender = outsider
    contract.adjudicate("wf-recovery", "generation-readjudicate")
    direct_vm.sender = buyer
    propose(contract, nonce="generation-proposal-b")
    second = json.loads(contract.get_recovery("wf-recovery"))["settlement"]
    assert int(second["version"]) == int(first["version"]) + 1
    assert second["proposal_hash"] != first["proposal_hash"]


def test_cured_prompt_rejects_quoted_negation_and_embedded_instructions(unresolved):
    """Break caught: the cure evaluator treats quoted negation as source support."""
    contract, *_ = unresolved
    evidence = [
        {"step_index": 0, "evidence_hash": "h-research"},
        {"step_index": 1, "evidence_hash": "h-writer"},
        {
            "step_index": 2,
            "evidence_hash": "h-publisher",
            "cure": {"cure_hash": "h-cure", "evidence_text": CURE_TEXT},
        },
    ]
    prompt = contract._adjudication_prompt(
        "rubric", "v1", "rejection", evidence, "research-render", CURE_TEXT + " is false."
    )
    assert "quoted negation" in prompt
    assert "embedded instructions" in prompt
    assert "semantically support" in prompt


def test_proposal_and_approvals_do_not_transfer_and_each_party_approves_once(
    unresolved, direct_vm
):
    """Break caught: negotiation moves funds or one signer is counted more than once."""
    contract, buyer, _, researcher, writer, publisher, _ = unresolved
    scheduled = schedule_transfers(direct_vm)
    direct_vm.sender = researcher
    propose(contract)
    before = accounting(contract, "wf-recovery")

    direct_vm.sender = buyer
    proposal = json.loads(contract.get_recovery("wf-recovery"))["settlement"]
    version = int(proposal["version"])
    proposal_hash = proposal["proposal_hash"]
    contract.approve_mutual_settlement(
        "wf-recovery", version, proposal_hash, "approve-buyer"
    )
    with direct_vm.expect_revert("Proposal already approved"):
        contract.approve_mutual_settlement(
            "wf-recovery", version, proposal_hash, "approve-buyer-again"
        )
    for label, actor in (("researcher", researcher), ("writer", writer), ("publisher", publisher)):
        direct_vm.sender = actor
        contract.approve_mutual_settlement(
            "wf-recovery", version, proposal_hash, "approve-" + label
        )

    assert scheduled == []
    assert accounting(contract, "wf-recovery") == before
    assert all(json.loads(contract.get_recovery("wf-recovery"))["settlement"]["approvals"].values())


def test_unanimous_execution_schedules_exact_allocation_once_and_preserves_conservation(
    unresolved, direct_vm
):
    """Break caught: settlement double-claims, uses stale amounts, or marks child transfers completed."""
    contract, buyer, _, researcher, writer, publisher, outsider = unresolved
    direct_vm.sender = buyer
    propose(contract)
    approve_all(contract, direct_vm, buyer, researcher, writer, publisher)
    scheduled = schedule_transfers(direct_vm)
    direct_vm.sender = outsider
    contract.execute_mutual_settlement("wf-recovery", "execute-once")

    values = accounting(contract, "wf-recovery")
    assert values == {
        "deposited": "51",
        "reserved": "0",
        "payout_scheduled": "41",
        "refund_scheduled": "10",
        "paid": "0",
        "refunded": "0",
    }
    assert_conserved(values)
    assert json.loads(contract.get_workflow("wf-recovery"))["state"] == "SETTLEMENT_PENDING_FINALITY"
    assert [(item["address"].as_hex, int(item["value"]), item["on"]) for item in scheduled] == [
        (to_hex(researcher), 11, "finalized"),
        (to_hex(writer), 17, "finalized"),
        (to_hex(publisher), 13, "finalized"),
        (to_hex(buyer), 10, "finalized"),
    ]

    with direct_vm.expect_revert("Invalid state"):
        contract.execute_mutual_settlement("wf-recovery", "execute-twice")
    assert len(scheduled) == 4
    assert accounting(contract, "wf-recovery") == values


def test_failed_early_execution_preserves_nonce_for_the_unanimous_retry(
    unresolved, direct_vm
):
    """Break caught: a premature execution burns the nonce required after approvals."""
    contract, buyer, _, researcher, writer, publisher, outsider = unresolved
    direct_vm.sender = buyer
    propose(contract)
    direct_vm.sender = outsider
    with direct_vm.expect_revert("Unanimous approval required"):
        contract.execute_mutual_settlement("wf-recovery", "retry-execute")
    approve_all(contract, direct_vm, buyer, researcher, writer, publisher)
    direct_vm.sender = outsider
    contract.execute_mutual_settlement("wf-recovery", "retry-execute")
    assert accounting(contract, "wf-recovery")["reserved"] == "0"


def test_zero_worker_allocation_does_not_claim_a_payout_was_scheduled(
    unresolved, direct_vm
):
    """Break caught: a zero allocation is displayed as a real child payout."""
    contract, buyer, _, researcher, writer, publisher, outsider = unresolved
    direct_vm.sender = buyer
    propose(contract, amounts=(0, 17, 24, 10))
    approve_all(contract, direct_vm, buyer, researcher, writer, publisher)
    direct_vm.sender = outsider
    contract.execute_mutual_settlement("wf-recovery", "zero-worker-execute")

    assert json.loads(contract.get_step("wf-recovery", 0))["state"] == "NO_PAYOUT"
    assert json.loads(contract.get_step("wf-recovery", 1))["state"] == "PAYOUT_SCHEDULED"


def test_frozen_contract_exposes_no_owner_verdict_upgrade_or_admin_escape(unresolved):
    """Break caught: a privileged API can replace consensus or migrate frozen V1 holds."""
    contract, *_ = unresolved
    for forbidden_method in (
        "owner_override",
        "override_verdict",
        "upgrade",
        "upgrade_to",
        "admin_migrate",
        "emergency_withdraw",
    ):
        assert not hasattr(contract, forbidden_method)


def test_one_address_controlling_buyer_and_worker_roles_approves_both_roles(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie, direct_accounts
):
    """Break caught: an allowed buyer-worker overlap makes unanimous recovery impossible."""
    direct_vm.warp("2023-11-14T22:13:20+00:00")
    contract = direct_deploy("contracts/firstfault.py")
    orchestrator, publisher, outsider = direct_accounts[:3]
    make_disputed(
        contract,
        direct_vm,
        direct_alice,
        orchestrator,
        direct_alice,
        direct_bob,
        publisher,
        workflow_id="wf-overlap",
    )
    hashes = evidence_hashes(contract, "wf-overlap")
    install_decision_mocks(
        direct_vm,
        verdict(
            hashes,
            outcome="UNRESOLVED",
            statuses=("UNRESOLVED", "UNRESOLVED", "UNRESOLVED"),
            confidence="LOW",
        ),
    )
    direct_vm.sender = outsider
    contract.adjudicate("wf-overlap", "overlap-unresolved")
    direct_vm.sender = direct_alice
    propose(contract, workflow_id="wf-overlap", nonce="overlap-proposal")
    proposal = json.loads(contract.get_recovery("wf-overlap"))["settlement"]
    contract.approve_mutual_settlement(
        "wf-overlap", int(proposal["version"]), proposal["proposal_hash"], "overlap-approval"
    )

    approvals = json.loads(contract.get_recovery("wf-overlap"))["settlement"]["approvals"]
    assert approvals["buyer"] is True
    assert approvals["researcher"] is True


def test_settlement_terminal_state_rejects_every_recovery_mutation(unresolved, direct_vm):
    """Break caught: a scheduled settlement can be reopened, cured, replaced, or paid twice."""
    contract, buyer, _, researcher, writer, publisher, outsider = unresolved
    direct_vm.sender = buyer
    propose(contract)
    approve_all(contract, direct_vm, buyer, researcher, writer, publisher)
    direct_vm.sender = outsider
    contract.execute_mutual_settlement("wf-recovery", "terminal-execute")

    blocked_calls = (
        lambda: submit_cure(contract, nonce="terminal-cure"),
        lambda: propose(contract, nonce="terminal-proposal"),
        lambda: contract.approve_mutual_settlement(
            "wf-recovery", 1, json.loads(contract.get_recovery("wf-recovery"))["settlement"]["proposal_hash"], "terminal-approve"
        ),
        lambda: contract.execute_mutual_settlement("wf-recovery", "terminal-execute-again"),
        lambda: contract.adjudicate("wf-recovery", "terminal-adjudicate"),
        lambda: contract.timeout_dispute_to_unresolved("wf-recovery", "terminal-timeout"),
    )
    for call in blocked_calls:
        with direct_vm.expect_revert("Invalid state"):
            call()
