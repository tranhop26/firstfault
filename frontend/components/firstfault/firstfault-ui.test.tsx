// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AgentTankBadge, AgentTankEntryLabel } from "../AgentTankBadge";
import { TransactionStatus } from "./TransactionStatus";
import { WorkflowComposer } from "./WorkflowComposer";
import { WorkflowTimeline } from "./WorkflowTimeline";

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

  it("disables contract actions when the wallet cannot write", () => {
    render(<WorkflowTimeline steps={steps} activeAddress={steps[1].worker} canAct={false} onSubmit={() => undefined} />);
    expect((screen.getByRole("button", { name: /submit writer output/i }) as HTMLButtonElement).disabled).toBe(true);
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
    fireEvent.change(screen.getByRole("textbox", { name: "Workflow ID" }), {
      target: { value: "duplicate-workflow" },
    });
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
    fireEvent.click(screen.getByRole("button", { name: "Create on Studionet" }));

    await waitFor(() => expect(onCreate).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /create a three-agent workflow/i })).toBeNull());
  });
});
