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
        self._require_state(workflow, "DRAFT")
        self._consume_nonce(nonce)
        workflow.state = "CANCELLED"
        workflow.outcome = "CANCELLED"
        self.workflows[workflow_id] = workflow

    @gl.public.write
    def start_workflow(self, workflow_id: str, nonce: str) -> None:
        workflow = self._workflow(workflow_id)
        self._require_sender(workflow.orchestrator, "Orchestrator only")
        self._require_state(workflow, "DRAFT")
        self._consume_nonce(nonce)
        workflow.state = "IN_PROGRESS"
        self.workflows[workflow_id] = workflow

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
                "refunded": str(workflow.refunded),
                "reserved": str(workflow.reserved),
                "state": workflow.state,
                "workflow_id": workflow.workflow_id,
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
