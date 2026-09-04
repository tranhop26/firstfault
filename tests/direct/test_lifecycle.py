"""Behavior tests for the authoritative FirstFault workflow lifecycle."""

import json

import pytest

from tests.direct.conftest import to_address, to_hex, workflow_terms


def create_workflow(contract, orchestrator, researcher, writer, publisher, workflow_id="wf-1", nonce="create-1"):
    """Create one valid workflow with literal terms shared by lifecycle tests."""
    contract.create_workflow(
        workflow_id,
        to_address(orchestrator),
        to_address(researcher),
        to_address(writer),
        to_address(publisher),
        nonce=nonce,
        **workflow_terms(),
    )


def test_creation_binds_caller_as_buyer_and_creates_three_assigned_steps(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie, direct_accounts
):
    """Break caught: accepting a supplied buyer or omitting/reordering a worker step."""
    contract = direct_deploy("contracts/firstfault.py")
    orchestrator, publisher = direct_accounts[:2]

    direct_vm.sender = direct_alice
    create_workflow(
        contract,
        orchestrator,
        direct_bob,
        direct_charlie,
        publisher,
    )

    workflow = json.loads(contract.get_workflow("wf-1"))
    assert workflow["buyer"] == to_hex(direct_alice)
    assert workflow["orchestrator"] == to_hex(orchestrator)
    assert workflow["state"] == "DRAFT"
    assert workflow["outcome"] == ""
    assert workflow["deposited"] == "0"
    assert workflow["reserved"] == "0"
    assert workflow["paid"] == "0"
    assert workflow["refunded"] == "0"

    expected = [
        (0, direct_bob, "Find verifiable primary sources.", "11", "100"),
        (1, direct_charlie, "Write only claims supported by research.", "17", "200"),
        (2, publisher, "Publish the approved draft without changes.", "23", "300"),
    ]
    for index, worker, brief, amount, deadline in expected:
        step = json.loads(contract.get_step("wf-1", index))
        assert step == {
            "amount": amount,
            "brief": brief,
            "deadline": deadline,
            "state": "PENDING",
            "step_index": index,
            "worker": to_hex(worker),
            "workflow_id": "wf-1",
        }


def test_creation_rejects_duplicate_workflow_id_and_reused_nonce(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie, direct_accounts
):
    """Break caught: overwriting a workflow or replaying an accepted create action."""
    contract = direct_deploy("contracts/firstfault.py")
    orchestrator, publisher = direct_accounts[:2]
    direct_vm.sender = direct_alice
    create_workflow(contract, orchestrator, direct_bob, direct_charlie, publisher)

    with direct_vm.expect_revert("Workflow already exists"):
        create_workflow(contract, orchestrator, direct_bob, direct_charlie, publisher)

    with direct_vm.expect_revert("Nonce already used"):
        create_workflow(
            contract,
            orchestrator,
            direct_bob,
            direct_charlie,
            publisher,
            workflow_id="wf-2",
            nonce="create-1",
        )


@pytest.mark.parametrize(
    ("researcher", "writer", "publisher", "terms", "error"),
    [
        ("same", "same", "publisher", {}, "Workers must be distinct"),
        ("researcher", "writer", "publisher", {"writer_amount": 0}, "Amounts must be positive"),
        ("researcher", "writer", "publisher", {"writer_deadline": 100}, "Deadlines must increase"),
    ],
)
def test_creation_rejects_invalid_worker_assignments_or_terms(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie, direct_accounts,
    researcher, writer, publisher, terms, error,
):
    """Break caught: a malformed three-step assignment or unsafe economic schedule is stored."""
    contract = direct_deploy("contracts/firstfault.py")
    orchestrator, fourth_worker = direct_accounts[:2]
    addresses = {
        "same": direct_bob,
        "researcher": direct_bob,
        "writer": direct_charlie,
        "publisher": fourth_worker,
    }
    valid_terms = workflow_terms()
    valid_terms.update(terms)
    direct_vm.sender = direct_alice

    with direct_vm.expect_revert(error):
        contract.create_workflow(
            "wf-invalid",
            to_address(orchestrator),
            to_address(addresses[researcher]),
            to_address(addresses[writer]),
            to_address(addresses[publisher]),
            nonce="invalid-create",
            **valid_terms,
        )


def test_only_buyer_can_cancel_before_the_workflow_starts(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie, direct_accounts
):
    """Break caught: another role can cancel a buyer's unstarted workflow."""
    contract = direct_deploy("contracts/firstfault.py")
    orchestrator, publisher = direct_accounts[:2]
    direct_vm.sender = direct_alice
    create_workflow(contract, orchestrator, direct_bob, direct_charlie, publisher)

    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("Buyer only"):
        contract.cancel_workflow("wf-1", "cancel-worker")

    direct_vm.sender = direct_alice
    contract.cancel_workflow("wf-1", "cancel-buyer")
    assert json.loads(contract.get_workflow("wf-1"))["state"] == "CANCELLED"

    direct_vm.sender = orchestrator
    with direct_vm.expect_revert("Invalid state"):
        contract.start_workflow("wf-1", "start-cancelled")


def test_only_orchestrator_can_start_and_terminal_state_is_immutable(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie, direct_accounts
):
    """Break caught: unauthorized starts, repeated starts, or post-cancellation mutation."""
    contract = direct_deploy("contracts/firstfault.py")
    orchestrator, publisher = direct_accounts[:2]
    direct_vm.sender = direct_alice
    create_workflow(contract, orchestrator, direct_bob, direct_charlie, publisher)

    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("Orchestrator only"):
        contract.start_workflow("wf-1", "start-worker")

    direct_vm.sender = orchestrator
    contract.start_workflow("wf-1", "start-orchestrator")
    assert json.loads(contract.get_workflow("wf-1"))["state"] == "IN_PROGRESS"

    with direct_vm.expect_revert("Invalid state"):
        contract.start_workflow("wf-1", "start-again")

    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("Invalid state"):
        contract.cancel_workflow("wf-1", "cancel-after-start")
