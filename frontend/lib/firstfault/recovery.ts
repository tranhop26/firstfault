import type { FirstFaultCure, FirstFaultStep, FirstFaultWorkflow } from "@/lib/contracts/FirstFault";

const CONSENSUS_WINDOW_SECONDS = 3_600;

function isStrictlyStale(timestamp: string | undefined, nowSeconds: number) {
  if (!timestamp) return false;
  const value = Number(timestamp);
  return Number.isFinite(value) && value > 0 && nowSeconds >= value
    && nowSeconds - value > CONSENSUS_WINDOW_SECONDS;
}

export function isDisputeTimeoutReady(
  workflow: FirstFaultWorkflow,
  steps: FirstFaultStep[],
  cures: FirstFaultCure[],
  nowSeconds: number,
) {
  const openedAt = Number(workflow.dispute_opened_at ?? 0);
  if (!Number.isFinite(openedAt) || openedAt <= 0 || nowSeconds < openedAt
    || nowSeconds - openedAt < CONSENSUS_WINDOW_SECONDS) return false;
  if (steps.length !== 3 || !steps.every((step) => isStrictlyStale(step.observed_at, nowSeconds))) return false;
  return cures.every((cure) => isStrictlyStale(cure.observed_at, nowSeconds)
    && isStrictlyStale(cure.submitted_at, nowSeconds));
}
