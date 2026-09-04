"""Adversarial behavior tests for FirstFault's bound step evidence.

Each test names the implementation mutation it catches in its docstring.
Expected hashes are derived independently with hashlib over literal values;
they never call the contract's canonicalization helpers.
"""

import hashlib
import json

import pytest

from tests.direct.conftest import to_address, workflow_terms
from tests.direct.test_lifecycle import create_workflow


NOW = 1_700_000_000
STALE = NOW - 3_601
SOURCE = "https://example.test/research/primary-source"
RESEARCH_OUTPUT = "Primary source confirms the claim."
WRITER_OUTPUT = "Draft cites the verified primary source."
PUBLISHER_OUTPUT = "Published the approved draft without changes."


def evidence_terms(**overrides):
    """Return deadline terms valid at the test transaction timestamp."""
    terms = workflow_terms()
    terms.update(
        {
            "research_deadline": NOW + 100,
            "writer_deadline": NOW + 200,
            "publisher_deadline": NOW + 300,
        }
    )
    terms.update(overrides)
    return terms


def create_started_workflow(
    contract,
    direct_vm,
    buyer,
    orchestrator,
    researcher,
    writer,
    publisher,
    workflow_id="wf-evidence",
    terms=None,
):
    """Create, fund, and start one workflow through its public interface."""
    direct_vm.sender = buyer
    contract.create_workflow(
        workflow_id,
        to_address(orchestrator),
        to_address(researcher),
        to_address(writer),
        to_address(publisher),
        nonce="create-" + workflow_id,
        **(terms or evidence_terms()),
    )
    direct_vm.value = 51
    contract.fund_workflow(workflow_id, "fund-" + workflow_id)
    direct_vm.value = 0
    direct_vm.sender = orchestrator
    contract.start_workflow(workflow_id, "start-" + workflow_id)


def submit(contract, workflow_id, step_index, output, upstream, source, observed_at, nonce):
    """Use the public evidence boundary exactly as a worker does."""
    contract.submit_step(
        workflow_id,
        step_index,
        output,
        upstream,
        source,
        observed_at,
        nonce,
    )


def output_hash(text):
    """Independent literal-fixture SHA-256 expectation."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


@pytest.fixture
def started_workflow(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie, direct_accounts
):
    """A started workflow plus its four distinct role accounts."""
    direct_vm.warp("2023-11-14T22:13:20+00:00")
    contract = direct_deploy("contracts/firstfault.py")
    orchestrator, publisher = direct_accounts[:2]
    create_started_workflow(
        contract,
        direct_vm,
        direct_alice,
        orchestrator,
        direct_bob,
        direct_charlie,
        publisher,
    )
    return contract, orchestrator, publisher


def test_only_the_assigned_worker_can_submit_and_rejected_nonce_remains_usable(
    started_workflow, direct_vm, direct_bob, direct_charlie
):
    """Break caught: accepting another actor or burning a nonce on authorization rejection."""
    contract, _, _ = started_workflow

    direct_vm.sender = direct_charlie
    with direct_vm.expect_revert("Assigned worker only"):
        submit(contract, "wf-evidence", 0, RESEARCH_OUTPUT, "", SOURCE, NOW, "retry-worker")

    direct_vm.sender = direct_bob
    submit(contract, "wf-evidence", 0, RESEARCH_OUTPUT, "", SOURCE, NOW, "retry-worker")
    assert json.loads(contract.get_step("wf-evidence", 0))["state"] == "SUBMITTED"


def test_step_sequence_rejects_writer_before_research_without_consuming_nonce(
    started_workflow, direct_vm, direct_bob, direct_charlie
):
    """Break caught: accepting an out-of-order dependency or burning its rejected nonce."""
    contract, _, _ = started_workflow

    direct_vm.sender = direct_charlie
    with direct_vm.expect_revert("Upstream step not submitted"):
        submit(contract, "wf-evidence", 1, WRITER_OUTPUT, output_hash(RESEARCH_OUTPUT), "", NOW, "retry-order")

    direct_vm.sender = direct_bob
    submit(contract, "wf-evidence", 0, RESEARCH_OUTPUT, "", SOURCE, NOW, "research-order")
    direct_vm.sender = direct_charlie
    submit(contract, "wf-evidence", 1, WRITER_OUTPUT, output_hash(RESEARCH_OUTPUT), "", NOW, "retry-order")
    assert json.loads(contract.get_step("wf-evidence", 1))["state"] == "SUBMITTED"


def test_submission_binds_contract_derived_hashes_and_transaction_timestamp(
    started_workflow, direct_vm, direct_bob
):
    """Break caught: ignoring pinned gl.message_raw['datetime'] or trusting caller hashes/timestamps."""
    contract, _, _ = started_workflow
    direct_vm.sender = direct_bob
    submit(contract, "wf-evidence", 0, RESEARCH_OUTPUT, "", SOURCE, NOW, "research-bound")

    step = json.loads(contract.get_step("wf-evidence", 0))
    assert step["brief_hash"] == output_hash("Find verifiable primary sources.")
    assert step["output_text"] == RESEARCH_OUTPUT
    assert step["output_hash"] == output_hash(RESEARCH_OUTPUT)
    assert step["upstream_hash"] == ""
    assert step["source_url"] == SOURCE
    assert step["observed_at"] == str(NOW)
    assert step["submitted_at"] == str(NOW)
    assert step["schema_version"] == "firstfault-evidence-v1"
    assert len(step["evidence_hash"]) == 64
    assert step["evidence_hash"] != step["output_hash"]


def test_rejects_duplicate_step_submission_and_reused_nonce(
    started_workflow, direct_vm, direct_bob, direct_charlie
):
    """Break caught: overwriting evidence or accepting a replayed successful submission nonce."""
    contract, _, _ = started_workflow
    direct_vm.sender = direct_bob
    submit(contract, "wf-evidence", 0, RESEARCH_OUTPUT, "", SOURCE, NOW, "research-once")

    with direct_vm.expect_revert("Step already submitted"):
        submit(contract, "wf-evidence", 0, "replacement", "", SOURCE, NOW, "new-duplicate")
    direct_vm.sender = direct_charlie
    with direct_vm.expect_revert("Nonce already used"):
        submit(
            contract,
            "wf-evidence",
            1,
            WRITER_OUTPUT,
            output_hash(RESEARCH_OUTPUT),
            "",
            NOW,
            "research-once",
        )


def test_rejects_wrong_upstream_hash_and_accepts_the_stored_research_output_hash(
    started_workflow, direct_vm, direct_bob, direct_charlie
):
    """Break caught: Writer can choose any dependency hash instead of Research's stored output hash."""
    contract, _, _ = started_workflow
    direct_vm.sender = direct_bob
    submit(contract, "wf-evidence", 0, RESEARCH_OUTPUT, "", SOURCE, NOW, "research-upstream")

    direct_vm.sender = direct_charlie
    with direct_vm.expect_revert("Upstream hash mismatch"):
        submit(contract, "wf-evidence", 1, WRITER_OUTPUT, output_hash("substituted research"), "", NOW, "retry-upstream")
    submit(contract, "wf-evidence", 1, WRITER_OUTPUT, output_hash(RESEARCH_OUTPUT), "", NOW, "retry-upstream")
    assert json.loads(contract.get_step("wf-evidence", 1))["upstream_hash"] == output_hash(RESEARCH_OUTPUT)


@pytest.mark.parametrize(
    ("observed_at", "expected_error"),
    [
        (STALE, "Observation is stale"),
        (NOW + 1, "Observation is in the future"),
    ],
)
def test_rejects_stale_or_future_observation_timestamps(
    started_workflow, direct_vm, direct_bob, observed_at, expected_error
):
    """Break caught: accepting an observation outside the bounded transaction-time freshness window."""
    contract, _, _ = started_workflow
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert(expected_error):
        submit(contract, "wf-evidence", 0, RESEARCH_OUTPUT, "", SOURCE, observed_at, "bad-observed-" + str(observed_at))


def test_rejects_late_output_without_consuming_its_nonce(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie, direct_accounts
):
    """Break caught: accepting output after deadline or burning a rejected late-submission nonce."""
    direct_vm.warp("2023-11-14T22:13:20+00:00")
    contract = direct_deploy("contracts/firstfault.py")
    orchestrator, publisher = direct_accounts[:2]
    create_started_workflow(
        contract,
        direct_vm,
        direct_alice,
        orchestrator,
        direct_bob,
        direct_charlie,
        publisher,
        workflow_id="wf-late",
        terms=evidence_terms(research_deadline=NOW - 1),
    )

    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("Step deadline passed"):
        submit(contract, "wf-late", 0, RESEARCH_OUTPUT, "", SOURCE, NOW, "retry-late")

    create_started_workflow(
        contract,
        direct_vm,
        direct_alice,
        orchestrator,
        direct_bob,
        direct_charlie,
        publisher,
        workflow_id="wf-not-late",
    )
    direct_vm.sender = direct_bob
    submit(contract, "wf-not-late", 0, RESEARCH_OUTPUT, "", SOURCE, NOW, "retry-late")


def test_research_requires_source_and_rejected_nonce_remains_usable(
    started_workflow, direct_vm, direct_bob
):
    """Break caught: missing Research provenance or burning its rejected submission nonce."""
    contract, _, _ = started_workflow
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("Research source required"):
        submit(contract, "wf-evidence", 0, RESEARCH_OUTPUT, "", "", NOW, "retry-source")
    submit(contract, "wf-evidence", 0, RESEARCH_OUTPUT, "", SOURCE, NOW, "retry-source")


def test_rejects_oversized_output_and_unknown_workflow(
    started_workflow, direct_vm, direct_bob
):
    """Break caught: unbounded artifact storage or creating evidence for a nonexistent workflow."""
    contract, _, _ = started_workflow
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("Output too large"):
        submit(contract, "wf-evidence", 0, "x" * 16_385, "", SOURCE, NOW, "too-large")
    with direct_vm.expect_revert("Workflow not found"):
        submit(contract, "missing-workflow", 0, RESEARCH_OUTPUT, "", SOURCE, NOW, "missing-workflow")


def test_same_output_is_domain_bound_to_changed_brief_and_another_workflow(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie, direct_accounts
):
    """Break caught: omitting the brief or workflow identity from the evidence replay domain."""
    direct_vm.warp("2023-11-14T22:13:20+00:00")
    contract = direct_deploy("contracts/firstfault.py")
    orchestrator, publisher = direct_accounts[:2]
    create_started_workflow(
        contract, direct_vm, direct_alice, orchestrator, direct_bob, direct_charlie, publisher, "wf-original"
    )
    changed_terms = evidence_terms(research_brief="Find two independently verifiable primary sources.")
    create_started_workflow(
        contract,
        direct_vm,
        direct_alice,
        orchestrator,
        direct_bob,
        direct_charlie,
        publisher,
        "wf-changed-brief",
        changed_terms,
    )

    direct_vm.sender = direct_bob
    submit(contract, "wf-original", 0, RESEARCH_OUTPUT, "", SOURCE, NOW, "original-artifact")
    submit(contract, "wf-changed-brief", 0, RESEARCH_OUTPUT, "", SOURCE, NOW, "changed-artifact")
    original = json.loads(contract.get_step("wf-original", 0))
    changed = json.loads(contract.get_step("wf-changed-brief", 0))
    assert original["output_hash"] == changed["output_hash"] == output_hash(RESEARCH_OUTPUT)
    assert original["brief_hash"] != changed["brief_hash"]
    assert original["evidence_hash"] != changed["evidence_hash"]
