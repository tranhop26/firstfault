import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const HASH = /^0x[0-9a-f]{64}$/i;
const CONTRACT = "0x9236A835741DF7f891613B5578753647C140124E";
const BUYER = "0x21b45103dd05c43969daF3CbB4277391777e2eC7";
const WRITER = "0x5d39d3243F7372d08ae83983f1Eb8663d121435A";
const PUBLISHER = "0x35C9979d30992b13EF6dF7036bC745E2e1cD76a2";

describe("Studionet V3 live custody evidence", () => {
  test("proves wrong-unit refund and terminal payout conservation", async () => {
    const path = resolve(process.cwd(), "../deployments/studionet-v3-live-evidence.json");
    const evidence = JSON.parse(await readFile(path, "utf8"));

    expect(evidence).toMatchObject({
      schemaVersion: 1,
      contractVersion: "v3",
      network: "studionet",
      chainId: 61999,
      contractAddress: CONTRACT,
    });
    expect(evidence.actors).toMatchObject({ buyer: BUYER, researcher: BUYER, writer: WRITER });

    const rejected = evidence.rejectedFunding;
    expect(rejected.fundingOutcome).toMatchObject({
      result: "REFUND_SCHEDULED",
      reason: "WRONG_AMOUNT",
      received: "3000000000000000000",
      retained: "0",
      refundScheduled: "3000000000000000000",
    });
    expect(rejected.transactions.refundTransfer).toMatchObject({
      from: CONTRACT,
      to: BUYER,
      value: "3000000000000000000",
      status: "FINALIZED",
      valueCredited: true,
      triggeredBy: rejected.transactions.fundWorkflow.transactionHash,
    });

    const active = evidence.acceptedFundingInProgress;
    expect(active.fundingOutcome).toMatchObject({
      result: "FUNDED",
      retained: "3000000000000000000",
      refundScheduled: "0",
    });
    expect(active.readback).toMatchObject({
      state: "ACCEPTED_PENDING_FINALITY",
      outcome: "ACCEPTED_PENDING_FINALITY",
      deposited: "3000000000000000000",
      reserved: "0",
      payoutScheduled: "3000000000000000000",
      refundScheduled: "0",
    });
    expect(active.researchEvidence).toMatchObject({
      stepIndex: 0,
      worker: BUYER,
      state: "SUBMITTED",
      upstreamHash: "",
      sourceUrl: "https://www.iana.org/help/example-domains",
      sourceSnapshotVersion: "firstfault-source-snapshot-v1",
      schemaVersion: "firstfault-evidence-v2",
    });
    expect(`0x${active.researchEvidence.outputHash}`).toMatch(HASH);
    expect(`0x${active.researchEvidence.sourceContentHash}`).toMatch(HASH);
    expect(`0x${active.researchEvidence.evidenceHash}`).toMatch(HASH);
    expect(active.writerEvidence).toMatchObject({
      stepIndex: 1,
      worker: WRITER,
      state: "SUBMITTED",
      upstreamHash: active.researchEvidence.outputHash,
      sourceUrl: "",
      sourceContentHash: "",
      sourceSnapshotVersion: "",
      schemaVersion: "firstfault-evidence-v2",
    });
    expect(`0x${active.writerEvidence.outputHash}`).toMatch(HASH);
    expect(`0x${active.writerEvidence.evidenceHash}`).toMatch(HASH);
    expect(active.publisherEvidence).toMatchObject({
      stepIndex: 2,
      worker: PUBLISHER,
      state: "SUBMITTED",
      outputHash: active.writerEvidence.outputHash,
      upstreamHash: active.writerEvidence.outputHash,
      sourceUrl: "",
      sourceContentHash: "",
      sourceSnapshotVersion: "",
      schemaVersion: "firstfault-evidence-v2",
    });
    expect(`0x${active.publisherEvidence.evidenceHash}`).toMatch(HASH);
    expect(active.completion).toMatchObject({
      status: "COMPLETE",
      remainingSteps: [],
    });
    const acceptHash = active.transactions.acceptWorkflow.transactionHash;
    expect(active.payoutTransfers.map(({ to, value }: { to: string; value: string }) => `${to}:${value}`)).toEqual([
      `${BUYER}:1000000000000000000`,
      `${WRITER}:1000000000000000000`,
      `${PUBLISHER}:1000000000000000000`,
    ]);
    for (const transfer of active.payoutTransfers) {
      expect(transfer.transactionHash).toMatch(HASH);
      expect(transfer).toMatchObject({
        from: CONTRACT,
        value: "1000000000000000000",
        status: "FINALIZED",
        valueCredited: true,
        triggeredBy: acceptHash,
      });
    }

    for (const branch of [rejected, active]) {
      for (const transaction of Object.values(branch.transactions) as Array<Record<string, unknown>>) {
        expect(transaction.transactionHash).toMatch(HASH);
        expect(transaction.status).toBe("FINALIZED");
      }
    }

    expect(evidence.conservation).toEqual({
      acceptedFunding: "3000000000000000000",
      acceptedPayoutFinalized: "3000000000000000000",
      rejectedReceived: "3000000000000000000",
      rejectedRefundFinalized: "3000000000000000000",
      contractBalance: "0",
      unaccounted: "0",
    });
    expect(BigInt(evidence.conservation.acceptedFunding) + BigInt(evidence.conservation.rejectedReceived)).toBe(
      BigInt(evidence.conservation.acceptedPayoutFinalized) + BigInt(evidence.conservation.rejectedRefundFinalized),
    );
  });
});
