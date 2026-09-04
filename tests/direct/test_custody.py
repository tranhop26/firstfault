"""Behavior tests for FirstFault's simulated-Studionet GEN custody accounting."""

import json

from tests.direct.conftest import to_address, to_hex, workflow_terms


TOTAL = 51


def create_workflow(
    contract, orchestrator, researcher, writer, publisher, workflow_id="wf-custody", nonce="create-custody"
):
    """Create valid fixed terms whose hand-checked total is 11 + 17 + 23 = 51."""
    contract.create_workflow(
        workflow_id,
        to_address(orchestrator),
        to_address(researcher),
        to_address(writer),
        to_address(publisher),
        nonce=nonce,
        **workflow_terms(),
    )


def accounting(contract, workflow_id="wf-custody"):
    """Read the public accounting boundary without using contract accounting helpers."""
    return json.loads(contract.get_accounting(workflow_id))


def assert_conserved(values):
    """Conservation must hold for each externally observable disposition."""
    deposited = int(values["deposited"])
    reserved = int(values["reserved"])
    paid = int(values["paid"])
    refunded = int(values["refunded"])
    assert deposited == reserved + paid + refunded


def test_funding_requires_the_buyer_to_supply_the_exact_three_step_total_once(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie, direct_accounts
):
    """Break caught: zero/partial/excess, a non-buyer, or a duplicate can create a hold."""
    contract = direct_deploy("contracts/firstfault.py")
    orchestrator, publisher = direct_accounts[:2]
    direct_vm.sender = direct_alice
    create_workflow(contract, orchestrator, direct_bob, direct_charlie, publisher)

    for value, nonce in ((0, "zero"), (50, "partial"), (52, "excess")):
        direct_vm.value = value
        with direct_vm.expect_revert("Exact funding required"):
            contract.fund_workflow("wf-custody", nonce)
        assert accounting(contract) == {"deposited": "0", "reserved": "0", "paid": "0", "refunded": "0"}

    direct_vm.sender = direct_bob
    direct_vm.value = TOTAL
    with direct_vm.expect_revert("Buyer only"):
        contract.fund_workflow("wf-custody", "fund-after-unauthorized")
    assert accounting(contract) == {"deposited": "0", "reserved": "0", "paid": "0", "refunded": "0"}

    direct_vm.sender = direct_alice
    contract.fund_workflow("wf-custody", "fund-after-unauthorized")
    funded = accounting(contract)
    assert funded == {"deposited": "51", "reserved": "51", "paid": "0", "refunded": "0"}
    assert_conserved(funded)

    direct_vm.value = TOTAL
    with direct_vm.expect_revert("Invalid state"):
        contract.fund_workflow("wf-custody", "fund-duplicate")
    assert accounting(contract) == funded


def test_cancellation_returns_the_whole_unstarted_hold_exactly_once(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie, direct_accounts
):
    """Break caught: cancellation loses, partially returns, or leaves a hold after refund."""
    contract = direct_deploy("contracts/firstfault.py")
    orchestrator, publisher = direct_accounts[:2]
    direct_vm.sender = direct_alice
    create_workflow(contract, orchestrator, direct_bob, direct_charlie, publisher)
    direct_vm.value = TOTAL
    contract.fund_workflow("wf-custody", "fund-refund")

    scheduled_transfers = []

    def capture_scheduled_refund(_vm, request):
        """Observe the refund's native PostMessage boundary in direct mode."""
        message = request.get("PostMessage")
        if message is not None:
            scheduled_transfers.append(message)
            return {"ok": None}
        return None

    direct_vm._gl_call_hook = capture_scheduled_refund
    direct_vm.value = 0
    contract.cancel_workflow("wf-custody", "cancel-refund")
    refunded = accounting(contract)
    assert refunded == {"deposited": "51", "reserved": "0", "paid": "0", "refunded": "51"}
    assert_conserved(refunded)
    for step_index in (0, 1, 2):
        assert json.loads(contract.get_step("wf-custody", step_index))["state"] == "REFUNDED"
    assert [(transfer["address"].as_hex, int(transfer["value"]), transfer["on"]) for transfer in scheduled_transfers] == [
        (to_hex(direct_alice), 51, "finalized"),
    ]

    direct_vm.sender = orchestrator
    with direct_vm.expect_revert("Invalid state"):
        contract.accept_workflow("wf-custody", "accept-after-refund")
    assert accounting(contract) == refunded


def test_acceptance_pays_each_started_hold_once_and_preserves_conservation(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie, direct_accounts
):
    """Break caught: acceptance pays twice, omits a worker, or permits a second disposition."""
    contract = direct_deploy("contracts/firstfault.py")
    orchestrator, publisher = direct_accounts[:2]
    direct_vm.sender = direct_alice
    create_workflow(contract, orchestrator, direct_bob, direct_charlie, publisher)
    direct_vm.value = TOTAL
    contract.fund_workflow("wf-custody", "fund-pay")

    direct_vm.value = 0
    direct_vm.sender = orchestrator
    contract.start_workflow("wf-custody", "start-pay")

    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("Orchestrator only"):
        contract.accept_workflow("wf-custody", "accept-after-unauthorized")

    scheduled_transfers = []

    def capture_scheduled_transfer(_vm, request):
        """Observe the real contract-to-account PostMessage boundary in direct mode."""
        message = request.get("PostMessage")
        if message is not None:
            scheduled_transfers.append(message)
            return {"ok": None}
        return None

    direct_vm._gl_call_hook = capture_scheduled_transfer
    direct_vm.sender = orchestrator
    contract.accept_workflow("wf-custody", "accept-after-unauthorized")
    paid = accounting(contract)
    assert paid == {"deposited": "51", "reserved": "0", "paid": "51", "refunded": "0"}
    assert_conserved(paid)
    for step_index in (0, 1, 2):
        assert json.loads(contract.get_step("wf-custody", step_index))["state"] == "PAID"
    assert [(transfer["address"].as_hex, int(transfer["value"]), transfer["on"]) for transfer in scheduled_transfers] == [
        (to_hex(direct_bob), 11, "finalized"),
        (to_hex(direct_charlie), 17, "finalized"),
        (to_hex(publisher), 23, "finalized"),
    ]

    with direct_vm.expect_revert("Invalid state"):
        contract.accept_workflow("wf-custody", "accept-again")
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("Invalid state"):
        contract.cancel_workflow("wf-custody", "cancel-after-pay")
    assert accounting(contract) == paid


def test_cancellation_is_rejected_after_the_orchestrator_starts_the_funded_workflow(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie, direct_accounts
):
    """Break caught: a buyer can refund a reserved workflow after worker execution begins."""
    contract = direct_deploy("contracts/firstfault.py")
    orchestrator, publisher = direct_accounts[:2]
    direct_vm.sender = direct_alice
    create_workflow(contract, orchestrator, direct_bob, direct_charlie, publisher)
    direct_vm.value = TOTAL
    contract.fund_workflow("wf-custody", "fund-started")

    direct_vm.value = 0
    direct_vm.sender = orchestrator
    contract.start_workflow("wf-custody", "start-started")
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("Invalid state"):
        contract.cancel_workflow("wf-custody", "cancel-started")

    reserved = accounting(contract)
    assert reserved == {"deposited": "51", "reserved": "51", "paid": "0", "refunded": "0"}
    assert_conserved(reserved)


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
