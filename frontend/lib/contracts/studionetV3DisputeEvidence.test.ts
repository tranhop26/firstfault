import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const HASH = /^0x[0-9a-f]{64}$/i;
const CONTRACT = "0x9236A835741DF7f891613B5578753647C140124E";
const BUYER = "0x21b45103dd05c43969daF3CbB4277391777e2eC7";
const WRITER = "0x5d39d3243F7372d08ae83983f1Eb8663d121435A";
const PUBLISHER = "0x35C9979d30992b13EF6dF7036bC745E2e1cD76a2";
const PARENT = "0xd3fecdeafbb30c7382a32dced6f8eab2438aa90e4eba25565cc24047def4f512";

describe("Studionet V3 first-breach dispute evidence", () => {
  test("proves the verdict and exact finalized allocation", async () => {
    const path = resolve(process.cwd(), "../deployments/studionet-v3-dispute-evidence.json");
    const evidence = JSON.parse(await readFile(path, "utf8"));

    expect(evidence).toMatchObject({
      schemaVersion: 1,
      project: "FirstFault",
      contractVersion: "v3",
      network: "studionet",
      chainId: 61999,
      contractAddress: CONTRACT,
      workflowId: "firstfault-v3-writer-breach-20260910-1",
      actors: {
        buyer: BUYER,
        orchestrator: BUYER,
        researcher: BUYER,
        writer: WRITER,
        publisher: PUBLISHER,
      },
      readback: {
        state: "DECISION_PENDING_FINALITY",
        outcome: "FIRST_BREACH",
        deposited: "3000000000000000000",
        reserved: "0",
        payoutScheduled: "2000000000000000000",
        refundScheduled: "1000000000000000000",
        paid: "0",
        refunded: "0",
      },
      verdict: {
        outcome: "FIRST_BREACH",
        firstBreachStep: 1,
        stepStatuses: ["COMPLIANT", "MATERIAL_BREACH", "COMPLIANT"],
        evidenceCited: 3,
      },
      adjudication: {
        transactionHash: PARENT,
        method: "adjudicate",
        status: "FINALIZED",
        result: 6,
        resultName: "MAJORITY_AGREE",
        votes: { agree: 3, disagree: 2 },
      },
    });

    expect(evidence.verdict.reasons).toEqual([
      {
        stepIndex: 0,
        confidence: "HIGH",
        material: false,
        causal: false,
        reason: "Research correctly summarized the source and stated that no audience metrics were reported.",
      },
      {
        stepIndex: 1,
        confidence: "HIGH",
        material: true,
        causal: true,
        reason: "Writer violated the MUST NOT requirement by inventing a 250,000 weekly-user metric not supported by the Research output, which directly caused the buyer's rejection.",
      },
      {
        stepIndex: 2,
        confidence: "HIGH",
        material: false,
        causal: false,
        reason: "Publisher exactly reproduced the Writer artifact as required.",
      },
    ]);
    expect(evidence.verdict.citedEvidenceHashes).toEqual([
      "2f8cb49d58f3c82ea606e12e4557d6f9e4534a701d2beebc1ac5d06a331de05a",
      "82770d7abda5d0a5942dee324dc33c831375771195f02d97e16392930752783e",
      "73558c449f9bb4f5753a837e2f5b6fc383d34b27acbbbd1a75f91c32e49fee45",
    ]);

    const [research, writer, publisher] = evidence.steps;
    expect(research).toMatchObject({
      stepIndex: 0,
      role: "researcher",
      worker: BUYER,
      state: "PAYOUT_SCHEDULED",
      upstreamHash: "",
      sourceUrl: "https://www.iana.org/help/example-domains",
      sourceSnapshotVersion: "firstfault-source-snapshot-v1",
    });
    expect(writer).toMatchObject({
      stepIndex: 1,
      role: "writer",
      worker: WRITER,
      state: "REFUND_SCHEDULED",
      outputText: "Example domains reached 250,000 users in one week.",
      upstreamHash: research.outputHash,
    });
    expect(publisher).toMatchObject({
      stepIndex: 2,
      role: "publisher",
      worker: PUBLISHER,
      state: "PAYOUT_SCHEDULED",
      outputText: writer.outputText,
      outputHash: writer.outputHash,
      upstreamHash: writer.outputHash,
    });
    for (const step of evidence.steps) {
      expect(`0x${step.briefHash}`).toMatch(HASH);
      expect(`0x${step.outputHash}`).toMatch(HASH);
      expect(`0x${step.evidenceHash}`).toMatch(HASH);
      expect(step.schemaVersion).toBe("firstfault-evidence-v2");
    }

    const lifecycleHashes = Object.values(evidence.lifecycleTransactions) as string[];
    expect(lifecycleHashes).toHaveLength(9);
    expect(new Set(lifecycleHashes).size).toBe(9);
    expect(evidence.lifecycleTransactions.adjudicate).toBe(PARENT);
    lifecycleHashes.forEach((hash) => expect(hash).toMatch(HASH));

    const transfers = evidence.settlementTransfers as Array<Record<string, unknown>>;
    expect(transfers.map(({ allocation, to, value }) => `${allocation}:${to}:${value}`)).toEqual([
      `researchPayout:${BUYER}:1000000000000000000`,
      `publisherPayout:${PUBLISHER}:1000000000000000000`,
      `writerRefund:${BUYER}:1000000000000000000`,
    ]);
    expect(new Set(transfers.map(({ transactionHash }) => transactionHash)).size).toBe(3);
    for (const transfer of transfers) {
      expect(transfer.transactionHash).toMatch(HASH);
      expect(transfer).toMatchObject({
        from: CONTRACT,
        origin: CONTRACT,
        value: "1000000000000000000",
        status: "FINALIZED",
        valueCredited: true,
        triggeredBy: PARENT,
      });
    }
    expect(transfers.reduce((sum, transfer) => sum + BigInt(String(transfer.value)), 0n)).toBe(3000000000000000000n);
    expect(evidence.conservation).toEqual({
      deposited: "3000000000000000000",
      finalizedSettlementTransfers: "3000000000000000000",
      contractBalance: "0",
      unaccounted: "0",
    });
    expect(evidence.previewVerification).toMatchObject({
      branch: "fix/studionet-execution-readback",
      commit: "99b930088ae912cb2a63a729180c189403dc5e75",
      statusLabel: "Transfers finalized",
      parentTransactionHash: PARENT,
      childTransactionHashes: transfers.map(({ transactionHash }) => transactionHash),
    });
  });
});
