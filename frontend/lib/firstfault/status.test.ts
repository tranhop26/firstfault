import { describe, expect, it } from "vitest";

import {
  canWrite,
  projectTransactionStatus,
  type TransactionProjectionInput,
} from "./status";

const base: TransactionProjectionInput = {
  connected: true,
  correctNetwork: true,
  receipt: null,
  triggeredReceipts: [],
  readback: null,
  error: null,
  submitted: false,
};

describe("FirstFault transaction status projection", () => {
  it("never describes a submitted transaction as paid", () => {
    expect(projectTransactionStatus({ ...base, submitted: true })).toMatchObject({
      phase: "SUBMITTED",
      label: "Submitted",
    });
  });

  it("shows transfer pending after finality until every child transfer succeeds", () => {
    expect(
      projectTransactionStatus({
        ...base,
        receipt: { hash: "0xparent", statusName: "FINALIZED", executionSucceeded: true },
        triggeredReceipts: [{ hash: "0xchild", statusName: "PENDING", executionSucceeded: false }],
        readback: { state: "DECISION_PENDING_FINALITY", reserved: "0", payout_scheduled: "30", refund_scheduled: "0" },
      }),
    ).toMatchObject({ phase: "TRANSFER_PENDING", label: "Transfer pending" });
  });

  it("keeps errors visible even when stale readback exists", () => {
    expect(
      projectTransactionStatus({
        ...base,
        error: "Wallet rejected the request",
        readback: { state: "FUNDED", reserved: "30", payout_scheduled: "0", refund_scheduled: "0" },
      }),
    ).toMatchObject({ phase: "ERROR", detail: "Wallet rejected the request" });
  });

  it("shows unresolved funds as held rather than refunded or paid", () => {
    expect(
      projectTransactionStatus({
        ...base,
        readback: { state: "UNRESOLVED", reserved: "30", payout_scheduled: "0", refund_scheduled: "0" },
      }),
    ).toMatchObject({ phase: "UNRESOLVED", label: "Unresolved — funds held" });
  });

  it("disables writes while disconnected or on the wrong network", () => {
    expect(canWrite({ connected: false, correctNetwork: true, configured: true })).toBe(false);
    expect(canWrite({ connected: true, correctNetwork: false, configured: true })).toBe(false);
    expect(canWrite({ connected: true, correctNetwork: true, configured: false })).toBe(false);
    expect(canWrite({ connected: true, correctNetwork: true, configured: true })).toBe(true);
  });

  it("reconstructs finalized success from authoritative readback after refresh", () => {
    expect(
      projectTransactionStatus({
        ...base,
        readback: { state: "SETTLED_SUCCESS", reserved: "0", payout_scheduled: "0", refund_scheduled: "0" },
      }),
    ).toMatchObject({ phase: "SUCCESS", label: "Settlement confirmed" });
  });
});
