// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { TransactionStatus } from "./TransactionStatus";
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
});
