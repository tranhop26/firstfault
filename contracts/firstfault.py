# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

"""Authoritative deterministic lifecycle storage for FirstFault workflows."""

import json
from dataclasses import dataclass

from genlayer import *


@allow_storage
@dataclass
class Workflow:
    workflow_id: str
    buyer: Address
    orchestrator: Address
    state: str
    outcome: str
    deposited: bigint
    reserved: bigint
    payout_scheduled: bigint
    refund_scheduled: bigint
    paid: bigint
    refunded: bigint


@allow_storage
@dataclass
class Step:
    workflow_id: str
    step_index: u8
    worker: Address
    brief: str
    amount: bigint
    deadline: u256
    state: str
    brief_hash: str
    output_text: str
    output_hash: str
    upstream_hash: str
    source_url: str
    observed_at: u256
    submitted_at: u256
    evidence_actor: Address
    evidence_hash: str
    schema_version: str


class FirstFault(gl.Contract):
    """The intentionally frozen source of truth for workflow lifecycle state."""

    workflows: TreeMap[str, Workflow]
    steps: TreeMap[str, Step]
    used_nonces: TreeMap[str, u8]

    EVIDENCE_SCHEMA_VERSION = "firstfault-evidence-v1"
    MAX_OUTPUT_BYTES = 16_384
    MAX_SOURCE_URL_BYTES = 2_048
    MAX_OBSERVATION_AGE_SECONDS = 3_600

    def __init__(self) -> None:
        """Storage maps are declared above and initialized by the GenLayer runtime."""
        pass

    def _workflow(self, workflow_id: str) -> Workflow:
        if workflow_id not in self.workflows:
            raise gl.vm.UserError("Workflow not found")
        return self.workflows[workflow_id]

    def _step(self, workflow_id: str, step_index: u8) -> Step:
        if step_index > 2:
            raise gl.vm.UserError("Step not found")
        key = workflow_id + ":" + str(step_index)
        if key not in self.steps:
            raise gl.vm.UserError("Step not found")
        return self.steps[key]

    def _require_sender(self, expected: Address, error: str) -> None:
        if gl.message.sender_address != expected:
            raise gl.vm.UserError(error)

    def _consume_nonce(self, nonce: str) -> None:
        if nonce == "":
            raise gl.vm.UserError("Nonce required")
        if nonce in self.used_nonces:
            raise gl.vm.UserError("Nonce already used")
        self.used_nonces[nonce] = 1

    def _require_state(self, workflow: Workflow, expected: str) -> None:
        if workflow.state != expected:
            raise gl.vm.UserError("Invalid state")

    def _canonical_json(self, value: dict) -> str:
        return json.dumps(value, sort_keys=True, separators=(",", ":"))

    def _sha256_hex(self, value: str) -> str:
        """Return the UTF-8 SHA-256 digest used by the evidence domain."""
        from hashlib import sha256

        return sha256(value.encode("utf-8")).hexdigest()

    def _submission_timestamp(self) -> u256:
        """Return whole UTC seconds from the pinned runtime's transaction message."""
        from datetime import datetime

        runtime_datetime = gl.message_raw.get("datetime", "")
        if not isinstance(runtime_datetime, str) or runtime_datetime == "":
            raise gl.vm.UserError("Runtime timestamp unavailable")
        try:
            parsed = datetime.fromisoformat(runtime_datetime)
        except ValueError:
            raise gl.vm.UserError("Invalid runtime timestamp")
        if parsed.tzinfo is None:
            raise gl.vm.UserError("Invalid runtime timestamp")
        return u256(int(parsed.timestamp()))

    def _canonical_evidence(
        self,
        workflow_id: str,
        step: Step,
        actor: Address,
        brief_hash: str,
        output_hash: str,
        upstream_hash: str,
        source_url: str,
        observed_at: u256,
        submitted_at: u256,
        nonce: str,
    ) -> str:
        """Encode the complete replay domain in a fixed ordered JSON array."""
        return json.dumps(
            [
                str(gl.message.chain_id),
                gl.message.contract_address.as_hex,
                workflow_id,
                str(step.step_index),
                actor.as_hex,
                brief_hash,
                output_hash,
                upstream_hash,
                source_url,
                str(observed_at),
                str(submitted_at),
                str(step.deadline),
                self.EVIDENCE_SCHEMA_VERSION,
                nonce,
            ],
            ensure_ascii=False,
            separators=(",", ":"),
        )

    @gl.public.write
    def create_workflow(
        self,
        workflow_id: str,
        orchestrator: Address,
        researcher: Address,
        writer: Address,
        publisher: Address,
        research_brief: str,
        writer_brief: str,
        publisher_brief: str,
        research_amount: u256,
        writer_amount: u256,
        publisher_amount: u256,
        research_deadline: u256,
        writer_deadline: u256,
        publisher_deadline: u256,
        nonce: str,
    ) -> None:
        if workflow_id == "":
            raise gl.vm.UserError("Workflow ID required")
        if workflow_id in self.workflows:
            raise gl.vm.UserError("Workflow already exists")
        if researcher == writer or researcher == publisher or writer == publisher:
            raise gl.vm.UserError("Workers must be distinct")
        if research_amount == 0 or writer_amount == 0 or publisher_amount == 0:
            raise gl.vm.UserError("Amounts must be positive")
        if not research_deadline < writer_deadline or not writer_deadline < publisher_deadline:
            raise gl.vm.UserError("Deadlines must increase")

        self._consume_nonce(nonce)
        buyer = gl.message.sender_address
        self.workflows[workflow_id] = Workflow(
            workflow_id=workflow_id,
            buyer=buyer,
            orchestrator=orchestrator,
            state="DRAFT",
            outcome="",
            deposited=0,
            reserved=0,
            payout_scheduled=0,
            refund_scheduled=0,
            paid=0,
            refunded=0,
        )
        self.steps[workflow_id + ":0"] = Step(
            workflow_id=workflow_id,
            step_index=0,
            worker=researcher,
            brief=research_brief,
            amount=research_amount,
            deadline=research_deadline,
            state="PENDING",
            brief_hash="",
            output_text="",
            output_hash="",
            upstream_hash="",
            source_url="",
            observed_at=0,
            submitted_at=0,
            evidence_actor=Address("0x0000000000000000000000000000000000000000"),
            evidence_hash="",
            schema_version="",
        )
        self.steps[workflow_id + ":1"] = Step(
            workflow_id=workflow_id,
            step_index=1,
            worker=writer,
            brief=writer_brief,
            amount=writer_amount,
            deadline=writer_deadline,
            state="PENDING",
            brief_hash="",
            output_text="",
            output_hash="",
            upstream_hash="",
            source_url="",
            observed_at=0,
            submitted_at=0,
            evidence_actor=Address("0x0000000000000000000000000000000000000000"),
            evidence_hash="",
            schema_version="",
        )
        self.steps[workflow_id + ":2"] = Step(
            workflow_id=workflow_id,
            step_index=2,
            worker=publisher,
            brief=publisher_brief,
            amount=publisher_amount,
            deadline=publisher_deadline,
            state="PENDING",
            brief_hash="",
            output_text="",
            output_hash="",
            upstream_hash="",
            source_url="",
            observed_at=0,
            submitted_at=0,
            evidence_actor=Address("0x0000000000000000000000000000000000000000"),
            evidence_hash="",
            schema_version="",
        )

    @gl.public.write
    def submit_step(
        self,
        workflow_id: str,
        step_index: u8,
        output_text: str,
        upstream_hash: str,
        source_url: str,
        observed_at: u256,
        nonce: str,
    ) -> None:
        """Store one worker's source-bound artifact in the canonical replay domain."""
        workflow = self._workflow(workflow_id)
        self._require_state(workflow, "IN_PROGRESS")
        step = self._step(workflow_id, step_index)
        self._require_sender(step.worker, "Assigned worker only")
        if step.state != "PENDING":
            raise gl.vm.UserError("Step already submitted")
        if output_text == "":
            raise gl.vm.UserError("Output required")
        if len(output_text.encode("utf-8")) > self.MAX_OUTPUT_BYTES:
            raise gl.vm.UserError("Output too large")
        if len(source_url.encode("utf-8")) > self.MAX_SOURCE_URL_BYTES:
            raise gl.vm.UserError("Source URL too large")

        submitted_at = self._submission_timestamp()
        if submitted_at > step.deadline:
            raise gl.vm.UserError("Step deadline passed")
        if observed_at > submitted_at:
            raise gl.vm.UserError("Observation is in the future")
        if submitted_at - observed_at > self.MAX_OBSERVATION_AGE_SECONDS:
            raise gl.vm.UserError("Observation is stale")

        if step_index == 0:
            if upstream_hash != "":
                raise gl.vm.UserError("Research upstream hash must be empty")
            if source_url == "":
                raise gl.vm.UserError("Research source required")
        else:
            upstream = self._step(workflow_id, step_index - 1)
            if upstream.state != "SUBMITTED":
                raise gl.vm.UserError("Upstream step not submitted")
            if upstream_hash != upstream.output_hash:
                raise gl.vm.UserError("Upstream hash mismatch")

        brief_hash = self._sha256_hex(step.brief)
        output_hash = self._sha256_hex(output_text)
        actor = gl.message.sender_address
        evidence_hash = self._sha256_hex(
            self._canonical_evidence(
                workflow_id,
                step,
                actor,
                brief_hash,
                output_hash,
                upstream_hash,
                source_url,
                observed_at,
                submitted_at,
                nonce,
            )
        )
        self._consume_nonce(nonce)
        step.brief_hash = brief_hash
        step.output_text = output_text
        step.output_hash = output_hash
        step.upstream_hash = upstream_hash
        step.source_url = source_url
        step.observed_at = observed_at
        step.submitted_at = submitted_at
        step.evidence_actor = actor
        step.evidence_hash = evidence_hash
        step.schema_version = self.EVIDENCE_SCHEMA_VERSION
        step.state = "SUBMITTED"
        self.steps[workflow_id + ":" + str(step_index)] = step
        if step_index == 2:
            workflow.state = "READY_FOR_REVIEW"
            self.workflows[workflow_id] = workflow

    @gl.public.write
    def cancel_workflow(self, workflow_id: str, nonce: str) -> None:
        workflow = self._workflow(workflow_id)
        self._require_sender(workflow.buyer, "Buyer only")
        if workflow.state != "DRAFT" and workflow.state != "FUNDED":
            raise gl.vm.UserError("Invalid state")
        self._consume_nonce(nonce)
        refund_amount = workflow.reserved
        workflow.reserved = 0
        workflow.refund_scheduled += refund_amount
        if refund_amount > 0:
            workflow.state = "CANCELED_PENDING_FINALITY"
            workflow.outcome = "CANCELED_PENDING_FINALITY"
        else:
            workflow.state = "CANCELED"
            workflow.outcome = "CANCELED"
        self.workflows[workflow_id] = workflow
        for step_index in range(3):
            step = self._step(workflow_id, step_index)
            step.state = "REFUND_SCHEDULED" if refund_amount > 0 else "CANCELED"
            self.steps[workflow_id + ":" + str(step_index)] = step
        if refund_amount > 0:
            gl.get_contract_at(workflow.buyer).emit_transfer(value=u256(refund_amount))

    @gl.public.write.payable
    def fund_workflow(self, workflow_id: str, nonce: str) -> None:
        workflow = self._workflow(workflow_id)
        self._require_sender(workflow.buyer, "Buyer only")
        self._require_state(workflow, "DRAFT")
        expected_amount = (
            self._step(workflow_id, 0).amount
            + self._step(workflow_id, 1).amount
            + self._step(workflow_id, 2).amount
        )
        if gl.message.value != expected_amount:
            raise gl.vm.UserError("Exact funding required")
        self._consume_nonce(nonce)
        workflow.deposited += gl.message.value
        workflow.reserved += gl.message.value
        workflow.state = "FUNDED"
        self.workflows[workflow_id] = workflow

    @gl.public.write
    def start_workflow(self, workflow_id: str, nonce: str) -> None:
        workflow = self._workflow(workflow_id)
        self._require_sender(workflow.orchestrator, "Orchestrator only")
        self._require_state(workflow, "FUNDED")
        self._consume_nonce(nonce)
        workflow.state = "IN_PROGRESS"
        self.workflows[workflow_id] = workflow

    @gl.public.write
    def accept_workflow(self, workflow_id: str, nonce: str) -> None:
        workflow = self._workflow(workflow_id)
        self._require_sender(workflow.buyer, "Buyer only")
        self._require_state(workflow, "IN_PROGRESS")
        if workflow.reserved == 0:
            raise gl.vm.UserError("Reserved funds required")
        self._consume_nonce(nonce)
        payout_amount = workflow.reserved
        workflow.reserved = 0
        workflow.payout_scheduled += payout_amount
        workflow.state = "ACCEPTED_PENDING_FINALITY"
        workflow.outcome = "ACCEPTED_PENDING_FINALITY"
        self.workflows[workflow_id] = workflow
        for step_index in range(3):
            step = self._step(workflow_id, step_index)
            step.state = "PAYOUT_SCHEDULED"
            self.steps[workflow_id + ":" + str(step_index)] = step
            gl.get_contract_at(step.worker).emit_transfer(value=u256(step.amount))

    @gl.public.view
    def get_workflow(self, workflow_id: str) -> str:
        workflow = self._workflow(workflow_id)
        return self._canonical_json(
            {
                "buyer": workflow.buyer.as_hex,
                "deposited": str(workflow.deposited),
                "orchestrator": workflow.orchestrator.as_hex,
                "outcome": workflow.outcome,
                "paid": str(workflow.paid),
                "payout_scheduled": str(workflow.payout_scheduled),
                "refunded": str(workflow.refunded),
                "refund_scheduled": str(workflow.refund_scheduled),
                "reserved": str(workflow.reserved),
                "state": workflow.state,
                "workflow_id": workflow.workflow_id,
            }
        )

    @gl.public.view
    def get_accounting(self, workflow_id: str) -> str:
        workflow = self._workflow(workflow_id)
        return self._canonical_json(
            {
                "deposited": str(workflow.deposited),
                "paid": str(workflow.paid),
                "payout_scheduled": str(workflow.payout_scheduled),
                "refunded": str(workflow.refunded),
                "refund_scheduled": str(workflow.refund_scheduled),
                "reserved": str(workflow.reserved),
            }
        )

    @gl.public.view
    def get_step(self, workflow_id: str, step_index: u8) -> str:
        step = self._step(workflow_id, step_index)
        result = {
            "amount": str(step.amount),
            "brief": step.brief,
            "deadline": str(step.deadline),
            "state": step.state,
            "step_index": step.step_index,
            "worker": step.worker.as_hex,
            "workflow_id": step.workflow_id,
        }
        if step.evidence_hash != "":
            result.update(
                {
                    "brief_hash": step.brief_hash,
                    "evidence_actor": step.evidence_actor.as_hex,
                    "evidence_hash": step.evidence_hash,
                    "observed_at": str(step.observed_at),
                    "output_hash": step.output_hash,
                    "output_text": step.output_text,
                    "schema_version": step.schema_version,
                    "source_url": step.source_url,
                    "submitted_at": str(step.submitted_at),
                    "upstream_hash": step.upstream_hash,
                }
            )
        return self._canonical_json(result)
