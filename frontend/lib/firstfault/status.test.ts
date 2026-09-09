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
        receipt: { hash: "0xparent", statusName: "FINALIZED", executionSucceeded: true, value: "0" },
        triggeredReceipts: [{ hash: "0xchild", statusName: "PENDING", executionSucceeded: false, value: "30" }],
        readback: { state: "DECISION_PENDING_FINALITY", reserved: "0", payout_scheduled: "30", refund_scheduled: "0" },
      }),
    ).toMatchObject({ phase: "TRANSFER_PENDING", label: "Transfer pending" });
  });

  it("does not call an already-scheduled workflow ready when local receipt proof is absent", () => {
    expect(projectTransactionStatus({
      ...base,
      readback: { state: "DECISION_PENDING_FINALITY", reserved: "0", payout_scheduled: "30", refund_scheduled: "0" },
    })).toMatchObject({ phase: "TRANSFER_PENDING", label: "Transfer proof unavailable" });
  });

  it("reports success only when finalized children equal the scheduled value", () => {
    const receipt = { hash: "0xparent", statusName: "FINALIZED", executionSucceeded: true, value: "0" };
    const readback = { state: "DECISION_PENDING_FINALITY", reserved: "0", payout_scheduled: "30", refund_scheduled: "0" };
    expect(projectTransactionStatus({
      ...base,
      receipt,
      triggeredReceipts: [
        { hash: "0xone", statusName: "FINALIZED", executionSucceeded: true, value: "11" },
        { hash: "0xtwo", statusName: "FINALIZED", executionSucceeded: true, value: "19" },
      ],
      readback,
    })).toMatchObject({ phase: "SUCCESS", label: "Transfers finalized" });

    expect(projectTransactionStatus({
      ...base,
      receipt,
      triggeredReceipts: [{ hash: "0xpartial", statusName: "FINALIZED", executionSucceeded: true, value: "11" }],
      readback,
    })).toMatchObject({ phase: "TRANSFER_PENDING" });
  });

  it("shows reconstructed transfer finality to a read-only visitor", () => {
    expect(projectTransactionStatus({
      ...base,
      connected: false,
      receipt: { hash: "0xparent", statusName: "FINALIZED", executionSucceeded: true, value: "0" },
      triggeredReceipts: [
        { hash: "0xone", statusName: "FINALIZED", executionSucceeded: true, value: "10" },
        { hash: "0xtwo", statusName: "FINALIZED", executionSucceeded: true, value: "20" },
      ],
      readback: { state: "ACCEPTED_PENDING_FINALITY", reserved: "0", payout_scheduled: "30", refund_scheduled: "0" },
    })).toMatchObject({ phase: "SUCCESS", label: "Transfers finalized" });
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

  it("distinguishes a finalized parent from a pre-finality rejection when reconciliation fails", () => {
    expect(projectTransactionStatus({
      ...base,
      receipt: { hash: "0xparent", statusName: "FINALIZED", executionSucceeded: true, value: "0" },
      error: "Unable to retrieve triggered receipts",
    })).toEqual({
      phase: "FINALIZED",
      label: "Finalized — reconciliation needed",
      detail: "The parent transaction finalized, but readback or child-transfer proof could not be reconstructed: Unable to retrieve triggered receipts",
    });
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
