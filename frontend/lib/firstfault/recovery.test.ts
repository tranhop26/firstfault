import { describe, expect, it } from "vitest";
import { isDisputeTimeoutReady } from "./recovery";
import type { FirstFaultStep, FirstFaultWorkflow } from "@/lib/contracts/FirstFault";

const workflow = { workflow_id: "wf", state: "DISPUTED", dispute_opened_at: "1000" } as FirstFaultWorkflow;
const steps = [0, 1, 2].map((step_index) => ({
  workflow_id: "wf", step_index, state: "SUBMITTED", observed_at: "1000",
})) as FirstFaultStep[];

describe("dispute timeout eligibility", () => {
  it("stays unavailable while any original or cure remains fresh", () => {
    expect(isDisputeTimeoutReady(workflow, steps, [], 4_600)).toBe(false);
    expect(isDisputeTimeoutReady(workflow, steps, [{ step_index: 0, observed_at: "2000", submitted_at: "2000" }], 4_601)).toBe(false);
  });

  it("becomes available only after every accepted observation is strictly stale", () => {
    expect(isDisputeTimeoutReady(workflow, steps, [{ step_index: 0, observed_at: "1000", submitted_at: "1000" }], 4_601)).toBe(true);
  });

  it("does not offer timeout for an incomplete evidence set", () => {
    expect(isDisputeTimeoutReady(workflow, steps.slice(0, 2), [], 4_601)).toBe(false);
  });
});
