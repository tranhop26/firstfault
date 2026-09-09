// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AgentTankBadge, AgentTankEntryLabel } from "../AgentTankBadge";
import { TransactionStatus } from "./TransactionStatus";
import { WorkflowComposer } from "./WorkflowComposer";
import { WorkflowTimeline } from "./WorkflowTimeline";
import { VerdictPanel } from "./VerdictPanel";
import { RecoveryPanel } from "./RecoveryPanel";

afterEach(cleanup);

const steps = [0, 1, 2].map((stepIndex) => ({
  workflow_id: "demo-42",
  step_index: stepIndex,
  worker: `0x${String(stepIndex + 1).padStart(40, "0")}`,
  brief: ["Verify sources", "Write supported copy", "Publish unchanged"][stepIndex],
  amount: String((stepIndex + 1) * 10),
  deadline: "1788534000",
  state: stepIndex === 0 ? "SUBMITTED" : "PENDING",
  output_hash: stepIndex === 0 ? "0xresearch" : undefined,
  evidence_hash: stepIndex === 0 ? "0xevidence" : undefined,
}));

function fillValidWorkflowForm(workflowId = "workflow-42") {
  const fields: Record<string, string> = {
    "Workflow ID": workflowId,
    "Orchestrator address": "0x0000000000000000000000000000000000000010",
    "Researcher address": "0x0000000000000000000000000000000000000011",
    "Writer address": "0x0000000000000000000000000000000000000012",
    "Publisher address": "0x0000000000000000000000000000000000000013",
    "Research brief": "Verify the primary source.",
    "Writing brief": "Write only supported claims.",
    "Publishing brief": "Publish the approved artifact.",
  };
  for (const [label, value] of Object.entries(fields)) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  }
}

describe("FirstFault truthful interface", () => {
  it("identifies the project as a GenLayer Agent Tank 2026 entry", () => {
    render(<><AgentTankBadge /><AgentTankEntryLabel /></>);
    expect(screen.getByText("Built for GenLayer")).toBeTruthy();
    expect(screen.getByText("AGENT TANK 2026")).toBeTruthy();
    expect(screen.getByText("Agent Tank Hackathon Entry")).toBeTruthy();
  });

  it("renders all three immutable workflow steps and simulated holds", () => {
    render(<WorkflowTimeline steps={steps} activeAddress={null} canAct={false} onSubmit={() => undefined} />);
    expect(screen.getAllByRole("article")).toHaveLength(3);
    expect(screen.getByText("Verify sources")).toBeTruthy();
    expect(screen.getAllByText(/simulated GEN/i)).toHaveLength(3);
  });

  it("shows semantic reasons and confidence for every adjudicated step", () => {
    render(<VerdictPanel workflow={{
      buyer: steps[0].worker, orchestrator: steps[0].worker, deposited: "0", paid: "0",
      payout_scheduled: "0", refunded: "0", refund_scheduled: "0", reserved: "0",
      state: "UNRESOLVED", outcome: "UNRESOLVED", workflow_id: "demo-42",
      verdict: {
        outcome: "UNRESOLVED", first_breach_step: -1,
        step_statuses: [0, 1, 2].map((step_index) => ({ step_index, status: "UNRESOLVED" })),
        reasons: [0, 1, 2].map((step_index) => ({ step_index, confidence: "LOW", material: false, causal: false, reason: `Reason ${step_index + 1}` })),
        cited_evidence_hashes: [],
      },
    }} />);
    expect(screen.getByText("Reason 1")).toBeTruthy();
    expect(screen.getAllByText("LOW")).toHaveLength(3);
  });

  it("exposes cure and unanimous settlement controls for unresolved contract state", () => {
    render(<RecoveryPanel
      workflowId="demo-42"
      reserved="10000000000000000000"
      canCure={true}
      canSettle={true}
      canExecute={true}
      recovery={{ workflow_id: "demo-42" }}
      onSubmitCure={() => undefined}
      onPropose={() => undefined}
      onApprove={() => undefined}
      onExecute={() => undefined}
    />);
    expect(screen.getByRole("button", { name: /submit cure/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /propose exact allocation/i })).toBeTruthy();
  });

  it("does not offer a cure when a worker missed delivery entirely", () => {
    render(<RecoveryPanel
      workflowId="missed-42"
      reserved="10000000000000000000"
      unresolvedReason="WORKER_DEADLINE_EXPIRED"
      canCure={true}
      canSettle={true}
      canExecute={true}
      recovery={{ workflow_id: "missed-42" }}
      onSubmitCure={() => undefined}
      onPropose={() => undefined}
      onApprove={() => undefined}
      onExecute={() => undefined}
    />);
    expect(screen.queryByRole("button", { name: /submit cure/i })).toBeNull();
    expect(screen.getByText(/no complete evidence set to cure/i)).toBeTruthy();
  });

  it("allows any connected writer to execute a fully approved settlement", () => {
    const onExecute = vi.fn();
    render(<RecoveryPanel
      workflowId="settled-42"
      reserved="10000000000000000000"
      canCure={false}
      canSettle={false}
      canExecute={true}
      recovery={{ workflow_id: "settled-42", settlement: {
        buyer_refund: "10000000000000000000", research_amount: "0", writer_amount: "0", publisher_amount: "0",
        version: "1", proposal_hash: `0x${"a".repeat(64)}`, approvals: { buyer: true, researcher: true, writer: true, publisher: true },
      } }}
      onSubmitCure={() => undefined}
      onPropose={() => undefined}
      onApprove={() => undefined}
      onExecute={onExecute}
    />);
    fireEvent.click(screen.getByRole("button", { name: /execute approved settlement/i }));
    expect(onExecute).toHaveBeenCalledOnce();
  });

  it("disables contract actions when the wallet cannot write", () => {
    render(<WorkflowTimeline steps={steps} activeAddress={steps[1].worker} canAct={false} onSubmit={() => undefined} />);
    expect((screen.getByRole("button", { name: /submit writer output/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("does not invite a worker to submit outside the contract IN_PROGRESS state", () => {
    render(<WorkflowTimeline steps={steps} workflowState="READY_FOR_REVIEW" activeAddress={steps[1].worker} canAct={true} onSubmit={() => undefined} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Writer agent output" }), { target: { value: "complete draft" } });
    expect((screen.getByRole("button", { name: /submit writer output/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows all three deadlines before the immutable create transaction", () => {
    render(<WorkflowComposer disabled={false} onCreate={() => Promise.resolve()} status={{ phase: "READY", label: "Ready", detail: "Ready" }} parentHash={null} childHashes={[]} />);
    fireEvent.click(screen.getByRole("button", { name: /create workflow/i }));
    expect(screen.getByLabelText("Research deadline hours")).toBeTruthy();
    expect(screen.getByLabelText("Writer deadline hours")).toBeTruthy();
    expect(screen.getByLabelText("Publisher deadline hours")).toBeTruthy();
  });

  it("blocks an incomplete create form before any contract write", () => {
    const onCreate = vi.fn();
    render(<WorkflowComposer disabled={false} onCreate={onCreate} status={{ phase: "READY", label: "Ready", detail: "Ready" }} parentHash={null} childHashes={[]} />);
    fireEvent.click(screen.getByRole("button", { name: /create workflow/i }));
    fireEvent.click(screen.getByRole("button", { name: /create on studionet/i }));
    expect(onCreate).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toMatch(/required/i);
  });

  it("labels unresolved value as held", () => {
    render(
      <TransactionStatus
        status={{ phase: "UNRESOLVED", label: "Unresolved — funds held", detail: "30 simulated GEN remains reserved by the contract." }}
        parentHash={null}
        childHashes={[]}
      />,
    );
    expect(screen.getByText("Unresolved — funds held")).toBeTruthy();
    expect(screen.getByText(/remains reserved/i)).toBeTruthy();
  });

  it("links transaction evidence to the canonical Studionet explorer", () => {
    const parentHash = `0x${"a".repeat(64)}`;
    const childHash = `0x${"b".repeat(64)}`;
    render(
      <TransactionStatus
        status={{ phase: "SUCCESS", label: "Finalized", detail: "Contract readback confirmed." }}
        parentHash={parentHash}
        childHashes={[childHash]}
      />,
    );
    expect(screen.getByRole("link", { name: /parent transaction/i }).getAttribute("href"))
      .toBe(`https://explorer-studio.genlayer.com/tx/${parentHash}`);
    expect(screen.getByRole("link", { name: /transfer 1/i }).getAttribute("href"))
      .toBe(`https://explorer-studio.genlayer.com/tx/${childHash}`);
  });

  it("keeps a rejected create action handled inside the workflow dialog", async () => {
    const onCreate = vi.fn().mockRejectedValue(new Error("Workflow already exists"));
    render(<WorkflowComposer disabled={false} onCreate={onCreate} status={{ phase: "ERROR", label: "Action failed", detail: "Workflow already exists" }} parentHash={null} childHashes={[]} />);

    fireEvent.click(screen.getByRole("button", { name: /create workflow/i }));
    fillValidWorkflowForm("duplicate-workflow");
    fireEvent.click(screen.getByRole("button", { name: "Create on Studionet" }));

    await waitFor(() => expect(onCreate).toHaveBeenCalledOnce());
    expect(screen.getByRole("dialog", { name: /create a three-agent workflow/i })).toBeTruthy();
    expect(screen.getByText("Action failed")).toBeTruthy();
    expect(screen.getByText("Workflow already exists")).toBeTruthy();
  });

  it("closes the workflow dialog after a successful create action", async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(<WorkflowComposer disabled={false} onCreate={onCreate} status={{ phase: "READY", label: "Ready", detail: "Contract state is loaded from Studionet." }} parentHash={null} childHashes={[]} />);

    fireEvent.click(screen.getByRole("button", { name: /create workflow/i }));
    fillValidWorkflowForm();
    fireEvent.click(screen.getByRole("button", { name: "Create on Studionet" }));

    await waitFor(() => expect(onCreate).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /create a three-agent workflow/i })).toBeNull());
  });

  it("disables create submission when a contract action becomes pending", () => {
    const props = { onCreate: vi.fn(), status: { phase: "READY", label: "Ready", detail: "Ready" } as const, parentHash: null, childHashes: [] };
    const view = render(<WorkflowComposer disabled={false} {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /create workflow/i }));
    view.rerender(<WorkflowComposer disabled={true} {...props} />);
    expect((screen.getByRole("button", { name: /create on studionet/i }) as HTMLButtonElement).disabled).toBe(true);
  });
});
