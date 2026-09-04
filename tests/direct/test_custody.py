"""Behavior tests for FirstFault's simulated-Studionet GEN custody scheduling."""

import hashlib
import json

import pytest

from tests.direct.conftest import to_address, to_hex, workflow_terms


TOTAL = 51
EVIDENCE_NOW = 1_700_000_000
EMPTY_ACCOUNTING = {
    "deposited": "0",
    "reserved": "0",
    "payout_scheduled": "0",
    "refund_scheduled": "0",
    "paid": "0",
    "refunded": "0",
}


def create_workflow(
    contract,
    orchestrator,
    researcher,
    writer,
    publisher,
    workflow_id="wf-custody",
    nonce="create-custody",
    terms=None,
):
    """Create fixed terms whose hand-checked hold total is 11 + 17 + 23 = 51."""
    contract.create_workflow(
        workflow_id,
        to_address(orchestrator),
        to_address(researcher),
        to_address(writer),
        to_address(publisher),
        nonce=nonce,
        **(terms or workflow_terms()),
    )


def evidence_terms():
    """Return hand-checked deadlines valid at the fixed direct VM time."""
    terms = workflow_terms()
    terms.update(
        {
            "research_deadline": EVIDENCE_NOW + 100,
            "writer_deadline": EVIDENCE_NOW + 200,
            "publisher_deadline": EVIDENCE_NOW + 300,
        }
    )
    return terms


def sha256(text):
    """Derive dependency hashes independently from the contract implementation."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def submit_required_evidence(contract, direct_vm, researcher, writer, publisher, workflow_id="wf-custody"):
    """Reach the public READY_FOR_REVIEW boundary with all three real submissions."""
    research = "Research output with a primary source."
    writer_output = "Writer output bound to research."
    publisher_output = "Publisher output bound to writer."
    direct_vm.sender = researcher
    contract.submit_step(
        workflow_id,
        0,
        research,
        "",
        "https://example.test/primary-source",
        EVIDENCE_NOW,
        "research-" + workflow_id,
    )
    direct_vm.sender = writer
    contract.submit_step(
        workflow_id,
        1,
        writer_output,
        sha256(research),
        "",
        EVIDENCE_NOW,
        "writer-" + workflow_id,
    )
    direct_vm.sender = publisher
    contract.submit_step(
        workflow_id,
        2,
        publisher_output,
        sha256(writer_output),
        "",
        EVIDENCE_NOW,
        "publisher-" + workflow_id,
    )


def accounting(contract, workflow_id="wf-custody"):
    """Read the public accounting boundary without using contract accounting helpers."""
    return json.loads(contract.get_accounting(workflow_id))


def assert_conserved(values):
    """The gross deposit must equal all active, scheduled, and completed dispositions."""
    deposited = int(values["deposited"])
    reserved = int(values["reserved"])
    payout_scheduled = int(values["payout_scheduled"])
    refund_scheduled = int(values["refund_scheduled"])
    paid = int(values["paid"])
    refunded = int(values["refunded"])
    assert deposited == reserved + payout_scheduled + refund_scheduled + paid + refunded


def schedule_transfers(direct_vm):
    """Capture the direct runner's real native PostMessage boundary, not a balance claim."""
    scheduled = []

    def capture(_vm, request):
        message = request.get("PostMessage")
        if message is not None:
            scheduled.append(message)
            return {"ok": None}
        return None

    direct_vm._gl_call_hook = capture
    return scheduled


def test_buyer_acceptance_rejects_before_all_evidence_without_consuming_nonce(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie, direct_accounts
):
    """Break caught: buyer schedules payouts from IN_PROGRESS before all bound evidence exists."""
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
        workflow_id="wf-premature-accept",
        terms=evidence_terms(),
    )
    direct_vm.value = TOTAL
    contract.fund_workflow("wf-premature-accept", "fund-premature-accept")
    direct_vm.value = 0
    direct_vm.sender = orchestrator
    contract.start_workflow("wf-premature-accept", "start-premature-accept")

    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("Invalid state"):
        contract.accept_workflow("wf-premature-accept", "retry-after-evidence")
    assert accounting(contract, "wf-premature-accept") == {
        **EMPTY_ACCOUNTING,
        "deposited": "51",
        "reserved": "51",
    }

    submit_required_evidence(
        contract,
        direct_vm,
        direct_bob,
        direct_charlie,
        publisher,
        "wf-premature-accept",
    )
    direct_vm.sender = direct_alice
    contract.accept_workflow("wf-premature-accept", "retry-after-evidence")
    assert json.loads(contract.get_workflow("wf-premature-accept"))["state"] == "ACCEPTED_PENDING_FINALITY"


def test_completed_evidence_allows_buyer_to_schedule_pending_payouts(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie, direct_accounts
):
    """Break caught: valid READY_FOR_REVIEW evidence cannot reach buyer-only pending-finality payout scheduling."""
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
        workflow_id="wf-ready-accept",
        terms=evidence_terms(),
    )
    direct_vm.value = TOTAL
    contract.fund_workflow("wf-ready-accept", "fund-ready-accept")
    direct_vm.value = 0
    direct_vm.sender = orchestrator
    contract.start_workflow("wf-ready-accept", "start-ready-accept")
    submit_required_evidence(contract, direct_vm, direct_bob, direct_charlie, publisher, "wf-ready-accept")

    direct_vm.sender = direct_alice
    contract.accept_workflow("wf-ready-accept", "accept-ready")
    assert json.loads(contract.get_workflow("wf-ready-accept"))["state"] == "ACCEPTED_PENDING_FINALITY"
    scheduled = accounting(contract, "wf-ready-accept")
    assert scheduled == {**EMPTY_ACCOUNTING, "deposited": "51", "payout_scheduled": "51"}
    assert_conserved(scheduled)


@pytest.mark.parametrize(("invalid_value", "retry_nonce"), [(0, "retry-zero"), (50, "retry-partial"), (52, "retry-excess")])
def test_rejected_funding_amount_does_not_consume_the_retry_nonce(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie, direct_accounts, invalid_value, retry_nonce
):
    """Break caught: zero, partial, or excess value burns a nonce needed for exact funding."""
    contract = direct_deploy("contracts/firstfault.py")
    orchestrator, publisher = direct_accounts[:2]
    direct_vm.sender = direct_alice
    create_workflow(contract, orchestrator, direct_bob, direct_charlie, publisher)

    direct_vm.value = invalid_value
    with direct_vm.expect_revert("Exact funding required"):
        contract.fund_workflow("wf-custody", retry_nonce)
    assert accounting(contract) == EMPTY_ACCOUNTING

    direct_vm.value = TOTAL
    contract.fund_workflow("wf-custody", retry_nonce)
    funded = accounting(contract)
    assert funded == {**EMPTY_ACCOUNTING, "deposited": "51", "reserved": "51"}
    assert_conserved(funded)


def test_only_the_buyer_can_fund_once_and_a_duplicate_rejection_preserves_its_nonce(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie, direct_accounts
):
    """Break caught: another actor funds, a duplicate adds custody, or its rejected nonce is burned."""
    contract = direct_deploy("contracts/firstfault.py")
    orchestrator, publisher = direct_accounts[:2]
    direct_vm.sender = direct_alice
    create_workflow(contract, orchestrator, direct_bob, direct_charlie, publisher)

    direct_vm.sender = direct_bob
    direct_vm.value = TOTAL
    with direct_vm.expect_revert("Buyer only"):
        contract.fund_workflow("wf-custody", "retry-unauthorized-fund")
    assert accounting(contract) == EMPTY_ACCOUNTING

    direct_vm.sender = direct_alice
    contract.fund_workflow("wf-custody", "retry-unauthorized-fund")
    first_funding = accounting(contract)
    assert first_funding == {**EMPTY_ACCOUNTING, "deposited": "51", "reserved": "51"}

    with direct_vm.expect_revert("Invalid state"):
        contract.fund_workflow("wf-custody", "retry-duplicate-fund")
    assert accounting(contract) == first_funding

    create_workflow(
        contract,
        orchestrator,
        direct_bob,
        direct_charlie,
        publisher,
        workflow_id="wf-duplicate-retry",
        nonce="create-duplicate-retry",
    )
    contract.fund_workflow("wf-duplicate-retry", "retry-duplicate-fund")
    assert_conserved(accounting(contract, "wf-duplicate-retry"))


def test_buyer_cancellation_schedules_the_whole_unstarted_refund_without_claiming_completion(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie, direct_accounts
):
    """Break caught: cancellation calls a refund completed before child-transfer finality exists."""
    contract = direct_deploy("contracts/firstfault.py")
    orchestrator, publisher = direct_accounts[:2]
    direct_vm.sender = direct_alice
    create_workflow(contract, orchestrator, direct_bob, direct_charlie, publisher)
    direct_vm.value = TOTAL
    contract.fund_workflow("wf-custody", "fund-refund")

    scheduled = schedule_transfers(direct_vm)
    direct_vm.value = 0
    contract.cancel_workflow("wf-custody", "cancel-refund")
    refund_pending = accounting(contract)
    assert refund_pending == {**EMPTY_ACCOUNTING, "deposited": "51", "refund_scheduled": "51"}
    assert_conserved(refund_pending)
    assert json.loads(contract.get_workflow("wf-custody"))["state"] == "CANCELED_PENDING_FINALITY"
    for step_index in (0, 1, 2):
        assert json.loads(contract.get_step("wf-custody", step_index))["state"] == "REFUND_SCHEDULED"
    assert [(transfer["address"].as_hex, int(transfer["value"]), transfer["on"]) for transfer in scheduled] == [
        (to_hex(direct_alice), 51, "finalized"),
    ]


def test_only_the_buyer_can_schedule_payouts_and_pending_states_do_not_claim_completion(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie, direct_accounts
):
    """Break caught: an orchestrator releases buyer GEN or scheduled messages are called paid."""
    direct_vm.warp("2023-11-14T22:13:20+00:00")
    contract = direct_deploy("contracts/firstfault.py")
    orchestrator, publisher = direct_accounts[:2]
    direct_vm.sender = direct_alice
    create_workflow(contract, orchestrator, direct_bob, direct_charlie, publisher, terms=evidence_terms())
    direct_vm.value = TOTAL
    contract.fund_workflow("wf-custody", "fund-pay")
    direct_vm.value = 0
    direct_vm.sender = orchestrator
    contract.start_workflow("wf-custody", "start-pay")

    for rejected_sender in (orchestrator, direct_bob):
        direct_vm.sender = rejected_sender
        with direct_vm.expect_revert("Buyer only"):
            contract.accept_workflow("wf-custody", "retry-unauthorized-accept")

    submit_required_evidence(contract, direct_vm, direct_bob, direct_charlie, publisher)
    scheduled = schedule_transfers(direct_vm)
    direct_vm.sender = direct_alice
    contract.accept_workflow("wf-custody", "retry-unauthorized-accept")
    payout_pending = accounting(contract)
    assert payout_pending == {**EMPTY_ACCOUNTING, "deposited": "51", "payout_scheduled": "51"}
    assert_conserved(payout_pending)
    assert json.loads(contract.get_workflow("wf-custody"))["state"] == "ACCEPTED_PENDING_FINALITY"
    for step_index in (0, 1, 2):
        assert json.loads(contract.get_step("wf-custody", step_index))["state"] == "PAYOUT_SCHEDULED"
    assert [(transfer["address"].as_hex, int(transfer["value"]), transfer["on"]) for transfer in scheduled] == [
        (to_hex(direct_bob), 11, "finalized"),
        (to_hex(direct_charlie), 17, "finalized"),
        (to_hex(publisher), 23, "finalized"),
    ]


def test_repeated_acceptance_and_post_start_cancellation_preserve_their_rejected_nonces(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie, direct_accounts
):
    """Break caught: rejected terminal decisions burn nonces that must remain usable elsewhere."""
    direct_vm.warp("2023-11-14T22:13:20+00:00")
    contract = direct_deploy("contracts/firstfault.py")
    orchestrator, publisher = direct_accounts[:2]
    direct_vm.sender = direct_alice
    create_workflow(contract, orchestrator, direct_bob, direct_charlie, publisher, terms=evidence_terms())
    direct_vm.value = TOTAL
    contract.fund_workflow("wf-custody", "fund-first")
    direct_vm.value = 0
    direct_vm.sender = orchestrator
    contract.start_workflow("wf-custody", "start-first")
    submit_required_evidence(contract, direct_vm, direct_bob, direct_charlie, publisher)
    direct_vm.sender = direct_alice
    contract.accept_workflow("wf-custody", "accept-first")

    with direct_vm.expect_revert("Invalid state"):
        contract.accept_workflow("wf-custody", "retry-accept")
    with direct_vm.expect_revert("Invalid state"):
        contract.cancel_workflow("wf-custody", "retry-post-start-cancel")

    create_workflow(
        contract,
        orchestrator,
        direct_bob,
        direct_charlie,
        publisher,
        workflow_id="wf-nonce-retry",
        nonce="create-nonce-retry",
        terms=evidence_terms(),
    )
    direct_vm.value = TOTAL
    contract.fund_workflow("wf-nonce-retry", "fund-nonce-retry")
    direct_vm.value = 0
    direct_vm.sender = orchestrator
    contract.start_workflow("wf-nonce-retry", "start-nonce-retry")
    submit_required_evidence(contract, direct_vm, direct_bob, direct_charlie, publisher, "wf-nonce-retry")
    direct_vm.sender = direct_alice
    contract.accept_workflow("wf-nonce-retry", "retry-accept")

    create_workflow(
        contract,
        orchestrator,
        direct_bob,
        direct_charlie,
        publisher,
        workflow_id="wf-cancel-retry",
        nonce="create-cancel-retry",
    )
    direct_vm.value = TOTAL
    contract.fund_workflow("wf-cancel-retry", "fund-cancel-retry")
    direct_vm.value = 0
    contract.cancel_workflow("wf-cancel-retry", "retry-post-start-cancel")
    assert_conserved(accounting(contract, "wf-nonce-retry"))
    assert_conserved(accounting(contract, "wf-cancel-retry"))


def test_workers_cannot_start_until_their_three_holds_are_funded(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie, direct_accounts
):
    """Break caught: workers begin a workflow before its promised GEN is held in custody."""
    contract = direct_deploy("contracts/firstfault.py")
    orchestrator, publisher = direct_accounts[:2]
    direct_vm.sender = direct_alice
    create_workflow(contract, orchestrator, direct_bob, direct_charlie, publisher)

    direct_vm.sender = orchestrator
    with direct_vm.expect_revert("Invalid state"):
        contract.start_workflow("wf-custody", "start-after-funding")

    direct_vm.sender = direct_alice
    direct_vm.value = TOTAL
    contract.fund_workflow("wf-custody", "fund-before-start")
    direct_vm.value = 0
    direct_vm.sender = orchestrator
    contract.start_workflow("wf-custody", "start-after-funding")
