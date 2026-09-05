import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

type GoldenEvidence = {
  schemaVersion: number;
  network: string;
  chainId: number;
  contractAddress: string;
  workflowId: string;
  actors: Record<string, string>;
  transactions: Record<string, {
    transactionHash: string;
    from: string;
    method: string;
    value: string;
    status: string;
    executionResult: string;
  }>;
  evidence: Array<{
    step: number;
    outputHash: string;
    evidenceHash: string;
    upstreamHash: string;
  }>;
  consensus: { result: string; validators: number; agree: number; disagree: number; idle: number };
  readback: {
    state: string;
    outcome: string;
    firstBreachStep: number;
    stepStatuses: string[];
    citedEvidenceHashes: string[];
    accounting: Record<string, string>;
  };
  transfers: Array<{
    transactionHash: string;
    from: string;
    to: string;
    value: string;
    status: string;
    valueCredited: boolean;
    triggeredBy: string;
  }>;
  conservation: {
    deposited: string;
    scheduled: string;
    finalizedTransfers: string;
    contractBalanceAfterFinalization: string;
  };
  snapshots: Record<string, {
    anchoredAfterTransaction: string;
    finalizedChildAnchors?: string[];
    workflowState: string;
    stepStates: string[];
    deposited: string;
    reserved: string;
    payoutScheduled: string;
    refundScheduled: string;
    contractBalance: string;
  }>;
  productionReadback: {
    url: string;
    deploymentCommit: string;
    walletRequired: boolean;
    workflowState: string;
    outcome: string;
    transferProofLabel: string;
    parentTransactionHash: string;
    childTransactionHashes: string[];
  };
};

const HASH = /^0x[0-9a-f]{64}$/i;
const ADDRESS = /^0x[0-9a-f]{40}$/i;
const CONTRACT = "0x2271AE904A97865491e4b24c49532f71B711eD5f";
const BUYER = "0x21b45103dd05c43969daF3CbB4277391777e2eC7";
const WRITER = "0x5d39d3243F7372d08ae83983f1Eb8663d121435A";
const PUBLISHER = "0x35C9979d30992b13EF6dF7036bC745E2e1cD76a2";

const expectedActions = {
  createWorkflow: [BUYER, "create_workflow", "0"],
  fundWorkflow: [BUYER, "fund_workflow", "51"],
  startWorkflow: [BUYER, "start_workflow", "0"],
  submitResearch: [BUYER, "submit_step", "0"],
  submitWriter: [WRITER, "submit_step", "0"],
  submitPublisher: [PUBLISHER, "submit_step", "0"],
  openDispute: [BUYER, "open_dispute", "0"],
  adjudicate: [BUYER, "adjudicate", "0"],
} as const;

describe("Studionet golden-demo evidence", () => {
  test("proves Writer first breach and exact finalized custody conservation", async () => {
    const path = resolve(process.cwd(), "../deployments/studionet-golden-demo.json");
    const evidence = JSON.parse(await readFile(path, "utf8")) as GoldenEvidence;

    expect(evidence.schemaVersion).toBe(1);
    expect(evidence.network).toBe("studionet");
    expect(evidence.chainId).toBe(61999);
    expect(evidence.contractAddress).toBe(CONTRACT);
    expect(evidence.workflowId).toBe("firstfault-golden-writer-breach-20260905-1");
    expect([evidence.actors.researcher, evidence.actors.writer, evidence.actors.publisher]).toEqual([
      BUYER,
      WRITER,
      PUBLISHER,
    ]);
    expect(new Set([evidence.actors.researcher, evidence.actors.writer, evidence.actors.publisher].map((value) => value.toLowerCase())).size).toBe(3);

    expect(Object.keys(evidence.transactions)).toEqual(Object.keys(expectedActions));
    for (const [action, expected] of Object.entries(expectedActions)) {
      const transaction = evidence.transactions[action];
      expect(transaction.transactionHash).toMatch(HASH);
      expect(transaction.from.toLowerCase()).toBe(expected[0].toLowerCase());
      expect(transaction.method).toBe(expected[1]);
      expect(transaction.value).toBe(expected[2]);
      expect(transaction.status).toBe("FINALIZED");
      expect(transaction.executionResult).toBe("SUCCESS");
    }
    expect(new Set(Object.values(evidence.transactions).map(({ transactionHash }) => transactionHash.toLowerCase())).size).toBe(8);

    expect(evidence.evidence.map(({ step }) => step)).toEqual([0, 1, 2]);
    expect(evidence.evidence[0].upstreamHash).toBe("");
    expect(evidence.evidence[1].upstreamHash).toBe(evidence.evidence[0].outputHash);
    expect(evidence.evidence[2].upstreamHash).toBe(evidence.evidence[1].outputHash);
    expect(evidence.evidence[2].outputHash).toBe(evidence.evidence[1].outputHash);
    expect(evidence.readback.citedEvidenceHashes).toEqual(evidence.evidence.map(({ evidenceHash }) => evidenceHash));
    expect(evidence.consensus).toEqual({ result: "MAJORITY_AGREE", validators: 5, agree: 3, disagree: 1, idle: 1 });

    expect(evidence.readback).toMatchObject({
      state: "DECISION_PENDING_FINALITY",
      outcome: "FIRST_BREACH",
      firstBreachStep: 1,
      stepStatuses: ["COMPLIANT", "MATERIAL_BREACH", "COMPLIANT"],
      accounting: {
        deposited: "51",
        reserved: "0",
        payoutScheduled: "34",
        refundScheduled: "17",
      },
    });

    const parentHash = evidence.transactions.adjudicate.transactionHash.toLowerCase();
    expect(evidence.transfers).toHaveLength(3);
    for (const transfer of evidence.transfers) {
      expect(transfer.transactionHash).toMatch(HASH);
      expect(transfer.from.toLowerCase()).toBe(evidence.contractAddress.toLowerCase());
      expect(transfer.to).toMatch(ADDRESS);
      expect(transfer.status).toBe("FINALIZED");
      expect(transfer.valueCredited).toBe(true);
      expect(transfer.triggeredBy.toLowerCase()).toBe(parentHash);
    }
    expect(evidence.transfers.map(({ to, value }) => `${to.toLowerCase()}:${value}`)).toEqual([
      `${evidence.actors.buyer.toLowerCase()}:17`,
      `${evidence.actors.researcher.toLowerCase()}:11`,
      `${evidence.actors.publisher.toLowerCase()}:23`,
    ]);

    const transferred = evidence.transfers.reduce((sum, item) => sum + BigInt(item.value), 0n);
    expect(evidence.conservation).toEqual({
      deposited: "51",
      scheduled: "51",
      finalizedTransfers: transferred.toString(),
      contractBalanceAfterFinalization: "0",
    });

    expect(evidence.snapshots.beforeFunding).toMatchObject({
      anchoredAfterTransaction: evidence.transactions.createWorkflow.transactionHash,
      workflowState: "DRAFT",
      stepStates: ["PENDING", "PENDING", "PENDING"],
      deposited: "0",
      reserved: "0",
      contractBalance: "0",
    });
    expect(evidence.snapshots.beforeAdjudication).toEqual({
      anchoredAfterTransaction: evidence.transactions.openDispute.transactionHash,
      workflowState: "DISPUTED",
      stepStates: ["SUBMITTED", "SUBMITTED", "SUBMITTED"],
      deposited: "51",
      reserved: "51",
      payoutScheduled: "0",
      refundScheduled: "0",
      contractBalance: "51",
    });
    expect(evidence.snapshots.afterChildFinality).toEqual({
      anchoredAfterTransaction: evidence.transactions.adjudicate.transactionHash,
      finalizedChildAnchors: evidence.transfers.map(({ transactionHash }) => transactionHash),
      workflowState: "DECISION_PENDING_FINALITY",
      stepStates: ["PAYOUT_SCHEDULED", "REFUND_SCHEDULED", "PAYOUT_SCHEDULED"],
      deposited: "51",
      reserved: "0",
      payoutScheduled: "34",
      refundScheduled: "17",
      contractBalance: "0",
    });

    expect(evidence.productionReadback).toMatchObject({
      url: "https://firstfault.vercel.app",
      deploymentCommit: "35b65b5cf852791779bbcedd2ca0231c82ee14f9",
      walletRequired: false,
      workflowState: "DECISION_PENDING_FINALITY",
      outcome: "FIRST_BREACH",
      transferProofLabel: "Transfers finalized",
      parentTransactionHash: evidence.transactions.adjudicate.transactionHash,
      childTransactionHashes: evidence.transfers.map(({ transactionHash }) => transactionHash),
    });
  });
});
