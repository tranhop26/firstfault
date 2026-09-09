"""Shared setup for FirstFault V3 contract regressions."""

from tests.direct.conftest import to_hex
from tests.direct.test_custody import EVIDENCE_NOW, TOTAL, evidence_terms


def actors(direct_alice, direct_bob, direct_charlie, direct_accounts):
    return direct_alice, direct_accounts[0], direct_bob, direct_charlie, direct_accounts[1]


def deploy_v3(direct_vm, direct_deploy):
    direct_vm.warp("2023-11-14T22:13:20+00:00")
    contract = direct_deploy("contracts/firstfault_v3.py")
    direct_vm.mock_web(
        r"https://example\.test/",
        {"status": 200, "body": "Primary source confirms the one supported claim."},
    )
    return contract


def create_and_fund_v3(contract, vm, people, workflow_id):
    buyer, orchestrator, researcher, writer, publisher = people
    vm.sender = buyer
    contract.create_workflow(
        workflow_id,
        to_hex(orchestrator),
        to_hex(researcher),
        to_hex(writer),
        to_hex(publisher),
        nonce="create-" + workflow_id,
        **evidence_terms(),
    )
    contract.prepare_funding(
        workflow_id,
        "intent-" + workflow_id,
        EVIDENCE_NOW + 60,
        "prepare-" + workflow_id,
    )
    vm.value = TOTAL
    contract.fund_workflow(workflow_id, "intent-" + workflow_id)
    vm.value = 0


def start_funded_v3(contract, vm, people, workflow_id):
    create_and_fund_v3(contract, vm, people, workflow_id)
    vm.sender = people[1]
    contract.start_workflow(workflow_id, "start-" + workflow_id)
