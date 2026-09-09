"""Regression proofs for consensus-captured V2 source snapshots."""

import hashlib
import json
import re

from tests.direct.conftest import to_address, to_hex
from tests.direct.test_adjudication import PROMPT_PATTERN, evidence_hashes, verdict
from tests.direct.test_custody import EVIDENCE_NOW, TOTAL, create_workflow, evidence_terms, sha256


SOURCE_URL = "https://example.test/primary-source"
RAW_SOURCE = "  Archived primary source.\r\nClaim confirmed.  "
SNAPSHOT = "Archived primary source.\nClaim confirmed."
RESEARCH = "Research output with a primary source."
WRITER = "Writer output bound to research."
PUBLISHER = "Publisher output bound to writer."


def setup_started_v2(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie, direct_accounts, workflow_id):
    direct_vm.warp("2023-11-14T22:13:20+00:00")
    contract = direct_deploy("contracts/firstfault_v2.py")
    buyer, orchestrator, researcher, writer, publisher = (
        direct_alice, direct_accounts[0], direct_bob, direct_charlie, direct_accounts[1]
    )
    direct_vm.sender = buyer
    create_workflow(
        contract, orchestrator, researcher, writer, publisher,
        workflow_id=workflow_id, nonce="create-" + workflow_id, terms=evidence_terms(),
    )
    direct_vm.value = TOTAL
    contract.fund_workflow(workflow_id, "fund-" + workflow_id)
    direct_vm.value = 0
    direct_vm.sender = orchestrator
    contract.start_workflow(workflow_id, "start-" + workflow_id)
    return contract, buyer, researcher, writer, publisher


def submit_research(contract, direct_vm, researcher, workflow_id, nonce="research-snapshot"):
    direct_vm.sender = researcher
    contract.submit_step(workflow_id, 0, RESEARCH, "", SOURCE_URL, EVIDENCE_NOW, nonce)


def test_research_submission_stores_consensus_snapshot_and_binds_its_hash(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie, direct_accounts
):
    contract, _, researcher, _, _ = setup_started_v2(
        direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie, direct_accounts, "snapshot-bound"
    )
    direct_vm.mock_web(re.escape(SOURCE_URL), {"status": 200, "body": RAW_SOURCE})
    submit_research(contract, direct_vm, researcher, "snapshot-bound")
    assert direct_vm.run_validator() is True

    step = json.loads(contract.get_step("snapshot-bound", 0))
    snapshot_hash = hashlib.sha256(SNAPSHOT.encode("utf-8")).hexdigest()
    assert step["source_content"] == SNAPSHOT
    assert step["source_content_hash"] == snapshot_hash
    assert step["source_snapshot_version"] == "firstfault-source-snapshot-v1"
    assert step["schema_version"] == "firstfault-evidence-v2"

    canonical = json.dumps([
        str(direct_vm._chain_id),
        to_hex(direct_vm._contract_address),
        "snapshot-bound", "0", to_hex(researcher),
        hashlib.sha256("Find verifiable primary sources.".encode()).hexdigest(),
        hashlib.sha256(RESEARCH.encode()).hexdigest(), "", SOURCE_URL,
        snapshot_hash, "firstfault-source-snapshot-v1",
        str(EVIDENCE_NOW), str(EVIDENCE_NOW), str(EVIDENCE_NOW + 100),
        "firstfault-evidence-v2", "research-snapshot",
    ], ensure_ascii=False, separators=(",", ":"))
    assert step["evidence_hash"] == hashlib.sha256(canonical.encode()).hexdigest()


def test_source_change_during_submission_consensus_rejects_the_snapshot(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie, direct_accounts
):
    contract, _, researcher, _, _ = setup_started_v2(
        direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie, direct_accounts, "snapshot-race"
    )
    snapshot_id = direct_vm.snapshot()
    direct_vm.mock_web(re.escape(SOURCE_URL), {"status": 200, "body": RAW_SOURCE})
    submit_research(contract, direct_vm, researcher, "snapshot-race", "snapshot-race-nonce")
    direct_vm.clear_mocks()
    direct_vm.mock_web(re.escape(SOURCE_URL), {"status": 200, "body": "Changed during consensus."})
    assert direct_vm.run_validator() is False
    direct_vm.revert(snapshot_id)
    assert json.loads(contract.get_step("snapshot-race", 0))["state"] == "PENDING"


def test_adjudication_uses_stored_snapshot_after_live_source_changes(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie, direct_accounts
):
    contract, buyer, researcher, writer, publisher = setup_started_v2(
        direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie, direct_accounts, "snapshot-history"
    )
    direct_vm.mock_web(re.escape(SOURCE_URL), {"status": 200, "body": RAW_SOURCE})
    submit_research(contract, direct_vm, researcher, "snapshot-history")
    direct_vm.sender = writer
    contract.submit_step("snapshot-history", 1, WRITER, sha256(RESEARCH), "", EVIDENCE_NOW, "writer-snapshot")
    direct_vm.sender = publisher
    contract.submit_step("snapshot-history", 2, PUBLISHER, sha256(WRITER), "", EVIDENCE_NOW, "publisher-snapshot")
    direct_vm.sender = buyer
    contract.open_dispute("snapshot-history", "Verify the historical source.", "dispute-snapshot")

    expected = verdict(evidence_hashes(contract, "snapshot-history"))
    direct_vm.clear_mocks()
    direct_vm.mock_web(re.escape(SOURCE_URL), {"status": 200, "body": "The live page was replaced."})
    direct_vm.mock_llm(PROMPT_PATTERN + r".*Archived primary source", json.dumps(expected))
    direct_vm.sender = direct_accounts[2]
    contract.adjudicate("snapshot-history", "adjudicate-snapshot")

    decided = json.loads(contract.get_workflow("snapshot-history"))
    assert decided["state"] == "DECISION_PENDING_FINALITY"
    assert decided["outcome"] == "ACCEPT_ALL"


def test_empty_source_snapshot_rejects_without_consuming_nonce(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie, direct_accounts
):
    contract, _, researcher, _, _ = setup_started_v2(
        direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie, direct_accounts, "snapshot-empty"
    )
    direct_vm.mock_web(re.escape(SOURCE_URL), {"status": 200, "body": "   "})
    direct_vm.sender = researcher
    with direct_vm.expect_revert("Research source unavailable"):
        contract.submit_step("snapshot-empty", 0, RESEARCH, "", SOURCE_URL, EVIDENCE_NOW, "snapshot-retry")
    direct_vm.clear_mocks()
    direct_vm.mock_web(re.escape(SOURCE_URL), {"status": 200, "body": RAW_SOURCE})
    contract.submit_step("snapshot-empty", 0, RESEARCH, "", SOURCE_URL, EVIDENCE_NOW, "snapshot-retry")
    assert json.loads(contract.get_step("snapshot-empty", 0))["state"] == "SUBMITTED"


def test_cure_snapshot_is_bound_and_reused_after_its_live_page_changes(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie, direct_accounts
):
    contract, buyer, researcher, writer, publisher = setup_started_v2(
        direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie, direct_accounts, "cure-snapshot"
    )
    direct_vm.mock_web(re.escape(SOURCE_URL), {"status": 200, "body": RAW_SOURCE})
    submit_research(contract, direct_vm, researcher, "cure-snapshot")
    direct_vm.sender = writer
    contract.submit_step("cure-snapshot", 1, WRITER, sha256(RESEARCH), "", EVIDENCE_NOW, "writer-cure-snapshot")
    direct_vm.sender = publisher
    contract.submit_step("cure-snapshot", 2, PUBLISHER, sha256(WRITER), "", EVIDENCE_NOW, "publisher-cure-snapshot")
    direct_vm.sender = buyer
    contract.open_dispute("cure-snapshot", "Verify correction.", "dispute-cure-snapshot")
    direct_vm.clear_mocks()
    direct_vm.sender = direct_accounts[2]
    contract.adjudicate("cure-snapshot", "unresolved-before-cure")

    cure_url = "https://example.test/cure"
    cure_snapshot = "Archived cure evidence."
    direct_vm.mock_web(re.escape(cure_url), {"status": 200, "body": cure_snapshot})
    direct_vm.sender = researcher
    contract.submit_cure(
        "cure-snapshot", "Correction supported by the archived cure.", cure_url,
        EVIDENCE_NOW, "submit-cure-snapshot",
    )
    recovery = json.loads(contract.get_recovery("cure-snapshot"))
    cure = recovery["cures"][0]
    assert cure["source_content"] == cure_snapshot
    assert cure["source_content_hash"] == hashlib.sha256(cure_snapshot.encode()).hexdigest()
    assert cure["source_snapshot_version"] == "firstfault-source-snapshot-v1"
    assert cure["schema_version"] == "firstfault-cure-v2"

    hashes = evidence_hashes(contract, "cure-snapshot") + [cure["cure_hash"]]
    direct_vm.clear_mocks()
    direct_vm.mock_web(re.escape(cure_url), {"status": 200, "body": "Live cure page replaced."})
    direct_vm.mock_llm(PROMPT_PATTERN + r".*Archived cure evidence", json.dumps(verdict(hashes)))
    direct_vm.sender = direct_accounts[2]
    contract.adjudicate("cure-snapshot", "adjudicate-cure-snapshot")
    assert json.loads(contract.get_workflow("cure-snapshot"))["outcome"] == "ACCEPT_ALL"
