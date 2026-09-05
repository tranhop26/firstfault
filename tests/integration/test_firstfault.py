"""Real Localnet lifecycle proof for FirstFault."""

import pytest

from .fixtures import SCENARIOS, STEP_AMOUNTS, TOTAL_HOLD, firstfault_localnet


pytestmark = pytest.mark.integration


@pytest.mark.parametrize("scenario_name", ["all_compliant", "writer_breach", "unresolved"])
def test_localnet_lifecycle_uses_distinct_roles_and_contract_readback(
    firstfault_localnet, scenario_name
):
    """Break caught: a mocked/off-chain workflow is presented as a contract lifecycle."""
    proof = firstfault_localnet.run(SCENARIOS[scenario_name])

    assert len(set(proof.role_addresses.values())) == 5
    assert proof.workflow["state"] == (
        "UNRESOLVED" if scenario_name == "unresolved" else "DECISION_PENDING_FINALITY"
    )
    assert proof.workflow["outcome"] == SCENARIOS[scenario_name].outcome
    assert proof.workflow["verdict"]["first_breach_step"] == SCENARIOS[scenario_name].first_breach_step
    assert tuple(item["status"] for item in proof.workflow["verdict"]["step_statuses"]) == (
        SCENARIOS[scenario_name].step_statuses
    )
    assert proof.parent_receipt["status_name"] == "FINALIZED"
    assert proof.parent_execution == "SUCCESS"
    assert proof.readback_after_children == proof.workflow


def test_all_compliant_tracks_every_triggered_transfer_and_recipient_balance(firstfault_localnet):
    """Break caught: parent finality is mistaken for three successful worker transfers."""
    proof = firstfault_localnet.run(SCENARIOS["all_compliant"])

    assert len(proof.triggered_transaction_ids) == 3
    assert all(receipt["status_name"] == "FINALIZED" for receipt in proof.triggered_receipts)
    assert all(receipt["type"] == 0 for receipt in proof.triggered_receipts)
    assert all(receipt["from_address"].lower() == proof.contract_address.lower() for receipt in proof.triggered_receipts)
    assert {
        (receipt["to_address"].lower(), int(receipt["value"]))
        for receipt in proof.triggered_receipts
    } == {
        (proof.role_addresses["researcher"].lower(), STEP_AMOUNTS[0]),
        (proof.role_addresses["writer"].lower(), STEP_AMOUNTS[1]),
        (proof.role_addresses["publisher"].lower(), STEP_AMOUNTS[2]),
    }
    assert tuple(proof.balance_deltas[role] for role in ("researcher", "writer", "publisher")) == STEP_AMOUNTS
    assert proof.contract_balance_before_funding == 0
    assert proof.contract_balance_after_funding == TOTAL_HOLD
    assert proof.contract_balance_before_adjudication == TOTAL_HOLD
    assert proof.contract_balance_after_children == 0
    assert proof.accounting == {
        "deposited": str(TOTAL_HOLD),
        "reserved": "0",
        "payout_scheduled": str(TOTAL_HOLD),
        "refund_scheduled": "0",
        "paid": "0",
        "refunded": "0",
    }


def test_writer_breach_refunds_writer_hold_while_publisher_formatting_is_compliant(firstfault_localnet):
    """Break caught: a downstream formatter is blamed or the breached hold is paid."""
    proof = firstfault_localnet.run(SCENARIOS["writer_breach"])

    assert all(receipt["status_name"] == "FINALIZED" for receipt in proof.triggered_receipts)
    assert all(receipt["type"] == 0 for receipt in proof.triggered_receipts)
    assert all(receipt["from_address"].lower() == proof.contract_address.lower() for receipt in proof.triggered_receipts)
    assert {
        (receipt["to_address"].lower(), int(receipt["value"]))
        for receipt in proof.triggered_receipts
    } == {
        (proof.role_addresses["researcher"].lower(), STEP_AMOUNTS[0]),
        (proof.role_addresses["buyer"].lower(), STEP_AMOUNTS[1]),
        (proof.role_addresses["publisher"].lower(), STEP_AMOUNTS[2]),
    }
    assert proof.balance_deltas["researcher"] == STEP_AMOUNTS[0]
    assert proof.balance_deltas["writer"] == 0
    assert proof.balance_deltas["publisher"] == STEP_AMOUNTS[2]
    assert proof.balance_deltas["buyer"] == STEP_AMOUNTS[1]
    assert proof.contract_balance_before_funding == 0
    assert proof.contract_balance_after_funding == TOTAL_HOLD
    assert proof.contract_balance_before_adjudication == TOTAL_HOLD
    assert proof.contract_balance_after_children == 0
    assert proof.accounting["payout_scheduled"] == str(STEP_AMOUNTS[0] + STEP_AMOUNTS[2])
    assert proof.accounting["refund_scheduled"] == str(STEP_AMOUNTS[1])


def test_unresolved_preserves_the_hold_and_emits_no_transfer(firstfault_localnet):
    """Break caught: contradictory evidence defaults to a payout or refund."""
    proof = firstfault_localnet.run(SCENARIOS["unresolved"])

    assert proof.triggered_transaction_ids == []
    assert all(delta == 0 for delta in proof.balance_deltas.values())
    assert proof.contract_balance_before_funding == 0
    assert proof.contract_balance_after_funding == TOTAL_HOLD
    assert proof.contract_balance_before_adjudication == TOTAL_HOLD
    assert proof.contract_balance_after_children == TOTAL_HOLD
    assert proof.accounting["reserved"] == str(TOTAL_HOLD)
    assert proof.accounting["payout_scheduled"] == "0"
    assert proof.accounting["refund_scheduled"] == "0"
