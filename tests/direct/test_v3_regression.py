"""V3 parity tests for settlement and permissionless recovery branches."""

import json

from tests.direct.test_adjudication import warp_authoritative_transaction_time
from tests.direct.test_custody import EVIDENCE_NOW, TOTAL, schedule_transfers, submit_required_evidence
from tests.direct.v3_helpers import actors, create_and_fund_v3, deploy_v3, start_funded_v3


def global_accounting(contract):
    return json.loads(contract.get_global_accounting())


def assert_global_conserved(contract):
    totals = global_accounting(contract)
    assert int(totals["total_accepted_funding"]) == (
        int(totals["total_workflow_payout_scheduled"])
        + int(totals["total_workflow_refund_scheduled"])
        + sum(
            int(json.loads(contract.get_workflow(workflow_id))["reserved"])
            for workflow_id in ("cancel-v3", "accept-v3")
            if workflow_id in contract.workflows
        )
    )


def test_v3_cancellation_updates_contract_wide_refund_total(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie, direct_accounts
):
    people = actors(direct_alice, direct_bob, direct_charlie, direct_accounts)
    contract = deploy_v3(direct_vm, direct_deploy)
    create_and_fund_v3(contract, direct_vm, people, "cancel-v3")
    schedule_transfers(direct_vm)

    contract.cancel_workflow("cancel-v3", "cancel-v3-nonce")

    totals = global_accounting(contract)
    assert totals["total_accepted_funding"] == str(TOTAL)
    assert totals["total_workflow_refund_scheduled"] == str(TOTAL)
    assert totals["total_workflow_payout_scheduled"] == "0"
    assert_global_conserved(contract)


def test_v3_acceptance_preserves_evidence_flow_and_updates_global_payout_total(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie, direct_accounts
):
    people = actors(direct_alice, direct_bob, direct_charlie, direct_accounts)
    buyer, _, researcher, writer, publisher = people
    contract = deploy_v3(direct_vm, direct_deploy)
    start_funded_v3(contract, direct_vm, people, "accept-v3")
    submit_required_evidence(contract, direct_vm, researcher, writer, publisher, "accept-v3")
    schedule_transfers(direct_vm)

    direct_vm.sender = buyer
    contract.accept_workflow("accept-v3", "accept-v3-nonce")

    workflow = json.loads(contract.get_workflow("accept-v3"))
    totals = global_accounting(contract)
    assert workflow["state"] == "ACCEPTED_PENDING_FINALITY"
    assert totals["total_workflow_payout_scheduled"] == str(TOTAL)
    assert totals["total_workflow_refund_scheduled"] == "0"
    assert_global_conserved(contract)


def test_v3_outsider_can_move_missed_worker_into_adjudication(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie, direct_accounts
):
    people = actors(direct_alice, direct_bob, direct_charlie, direct_accounts)
    contract = deploy_v3(direct_vm, direct_deploy)
    start_funded_v3(contract, direct_vm, people, "missed-v3")
    warp_authoritative_transaction_time(direct_vm, "2023-11-14T22:15:01+00:00")

    direct_vm.sender = direct_accounts[2]
    contract.timeout_incomplete_to_unresolved("missed-v3", "timeout-missed-v3")

    workflow = json.loads(contract.get_workflow("missed-v3"))
    assert workflow["state"] == "DISPUTED"
    assert workflow["reserved"] == str(TOTAL)
    assert int(workflow["round_opened_at"]) > EVIDENCE_NOW
