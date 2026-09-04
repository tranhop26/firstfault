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


class FirstFault(gl.Contract):
    """The intentionally frozen source of truth for workflow lifecycle state."""

    workflows: TreeMap[str, Workflow]
    steps: TreeMap[str, Step]
    used_nonces: TreeMap[str, u8]

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
        )
        self.steps[workflow_id + ":1"] = Step(
            workflow_id=workflow_id,
            step_index=1,
            worker=writer,
            brief=writer_brief,
            amount=writer_amount,
            deadline=writer_deadline,
            state="PENDING",
        )
        self.steps[workflow_id + ":2"] = Step(
            workflow_id=workflow_id,
            step_index=2,
            worker=publisher,
            brief=publisher_brief,
            amount=publisher_amount,
            deadline=publisher_deadline,
            state="PENDING",
        )

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
        return self._canonical_json(
            {
                "amount": str(step.amount),
                "brief": step.brief,
                "deadline": str(step.deadline),
                "state": step.state,
                "step_index": step.step_index,
                "worker": step.worker.as_hex,
                "workflow_id": step.workflow_id,
            }
        )
