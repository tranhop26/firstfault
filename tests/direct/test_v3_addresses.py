"""Studio-safe address-boundary tests for the frozen FirstFault V3 contract."""

import json

import pytest

from tests.direct.conftest import to_hex, workflow_terms


def create_v3(contract, direct_vm, buyer, orchestrator, researcher, writer, publisher, workflow_id="v3-addresses"):
    direct_vm.sender = buyer
    contract.create_workflow(
        workflow_id,
        orchestrator,
        researcher,
        writer,
        publisher,
        nonce="create-" + workflow_id,
        **workflow_terms(),
    )


def test_v3_create_accepts_plain_hex_actor_strings(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie, direct_accounts
):
    contract = direct_deploy("contracts/firstfault_v3.py")
    orchestrator, publisher = direct_accounts[:2]

    create_v3(
        contract,
        direct_vm,
        direct_alice,
        to_hex(orchestrator),
        to_hex(direct_bob),
        to_hex(direct_charlie),
        to_hex(publisher),
    )

    workflow = json.loads(contract.get_workflow("v3-addresses"))
    assert workflow["orchestrator"] == to_hex(orchestrator)
    assert json.loads(contract.get_step("v3-addresses", 0))["worker"] == to_hex(direct_bob)


@pytest.mark.parametrize("bad", ["", "0x0", "0x" + "0" * 40, "0x" + "g" * 40])
def test_v3_rejects_invalid_orchestrator_strings(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie, direct_accounts, bad
):
    contract = direct_deploy("contracts/firstfault_v3.py")
    publisher = direct_accounts[0]

    with direct_vm.expect_revert("Invalid orchestrator address"):
        create_v3(
            contract,
            direct_vm,
            direct_alice,
            bad,
            to_hex(direct_bob),
            to_hex(direct_charlie),
            to_hex(publisher),
            workflow_id="v3-invalid-orchestrator",
        )


def test_v3_rejects_duplicate_workers_after_parsing(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_accounts
):
    contract = direct_deploy("contracts/firstfault_v3.py")
    orchestrator, publisher = direct_accounts[:2]

    with direct_vm.expect_revert("Workers must be distinct"):
        create_v3(
            contract,
            direct_vm,
            direct_alice,
            to_hex(orchestrator),
            to_hex(direct_bob),
            to_hex(direct_bob).lower(),
            to_hex(publisher),
            workflow_id="v3-duplicate-workers",
        )
