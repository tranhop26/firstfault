import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

type Transaction = {
  transactionHash: string;
  from: string;
  method: string;
  value: string;
  status: string;
  executionResult: string;
};

type Branch = {
  workflowId: string;
  transactions: Record<string, Transaction>;
  evidence: Array<{ step: number; outputHash: string; evidenceHash: string; upstreamHash: string }>;
  readback: Record<string, string | string[]>;
  transfers: Array<{
    transactionHash: string;
    from: string;
    to: string;
    value: string;
    status: string;
    valueCredited: boolean;
    triggeredBy: string;
  }>;
  productionReadback: Record<string, string | boolean>;
};

type LiveBranchesEvidence = {
  schemaVersion: number;
  network: string;
  chainId: number;
  contractAddress: string;
  actors: Record<string, string>;
  acceptAll: Branch;
  unresolved: Branch;
  conservation: Record<string, string>;
};

const HASH = /^0x[0-9a-f]{64}$/i;
const CONTRACT = "0x2271AE904A97865491e4b24c49532f71B711eD5f";
const BUYER = "0x21b45103dd05c43969daF3CbB4277391777e2eC7";
const WRITER = "0x5d39d3243F7372d08ae83983f1Eb8663d121435A";
const PUBLISHER = "0x35C9979d30992b13EF6dF7036bC745E2e1cD76a2";

function verifyLineage(branch: Branch) {
  expect(branch.evidence.map(({ step }) => step)).toEqual([0, 1, 2]);
  expect(branch.evidence[0].upstreamHash).toBe("");
  expect(branch.evidence[1].upstreamHash).toBe(branch.evidence[0].outputHash);
  expect(branch.evidence[2].upstreamHash).toBe(branch.evidence[1].outputHash);
  expect(branch.evidence[2].outputHash).toBe(branch.evidence[1].outputHash);
  for (const item of branch.evidence) expect(`0x${item.evidenceHash}`).toMatch(HASH);
}

function verifyTransactions(branch: Branch) {
  for (const transaction of Object.values(branch.transactions)) {
    expect(transaction.transactionHash).toMatch(HASH);
    expect(transaction.status).toBe("FINALIZED");
    expect(transaction.executionResult).toBe("SUCCESS");
  }
  expect(new Set(Object.values(branch.transactions).map(({ transactionHash }) => transactionHash))).toHaveLength(
    Object.keys(branch.transactions).length,
  );
}

describe("Studionet live terminal-branch evidence", () => {
  test("proves exact accept-all transfers and safe timed UNRESOLVED custody", async () => {
    const path = resolve(process.cwd(), "../deployments/studionet-live-branches.json");
    const evidence = JSON.parse(await readFile(path, "utf8")) as LiveBranchesEvidence;

    expect(evidence).toMatchObject({ schemaVersion: 1, network: "studionet", chainId: 61999 });
    expect(evidence.contractAddress).toBe(CONTRACT);
    expect(evidence.actors).toMatchObject({ buyer: BUYER, researcher: BUYER, writer: WRITER, publisher: PUBLISHER });
    verifyTransactions(evidence.acceptAll);
    verifyTransactions(evidence.unresolved);
    verifyLineage(evidence.acceptAll);
    verifyLineage(evidence.unresolved);

    expect(evidence.acceptAll.readback).toMatchObject({
      state: "ACCEPTED_PENDING_FINALITY",
      deposited: "3",
      reserved: "0",
      payoutScheduled: "3",
      refundScheduled: "0",
    });
    const acceptHash = evidence.acceptAll.transactions.acceptWorkflow.transactionHash.toLowerCase();
    expect(evidence.acceptAll.transfers.map(({ to, value }) => `${to.toLowerCase()}:${value}`)).toEqual([
      `${BUYER.toLowerCase()}:1`,
      `${WRITER.toLowerCase()}:1`,
      `${PUBLISHER.toLowerCase()}:1`,
    ]);
    for (const transfer of evidence.acceptAll.transfers) {
      expect(transfer.transactionHash).toMatch(HASH);
      expect(transfer.from.toLowerCase()).toBe(CONTRACT.toLowerCase());
      expect(transfer.status).toBe("FINALIZED");
      expect(transfer.valueCredited).toBe(true);
      expect(transfer.triggeredBy.toLowerCase()).toBe(acceptHash);
    }

    expect(evidence.unresolved.transactions.timeout.method).toBe("timeout_dispute_to_unresolved");
    expect(evidence.unresolved.readback).toMatchObject({
      state: "UNRESOLVED",
      outcome: "UNRESOLVED",
      reason: "CONSENSUS_TIMEOUT",
      stepStatuses: ["UNRESOLVED", "UNRESOLVED", "UNRESOLVED"],
      deposited: "3",
      reserved: "3",
      payoutScheduled: "0",
      refundScheduled: "0",
    });
    expect(evidence.unresolved.transfers).toEqual([]);

    const finalized = evidence.acceptAll.transfers.reduce((sum, transfer) => sum + BigInt(transfer.value), 0n);
    expect(evidence.conservation).toEqual({
      totalDeposited: "6",
      finalizedTransfers: finalized.toString(),
      reserved: "3",
      contractBalance: "3",
    });
    expect(BigInt(evidence.conservation.totalDeposited)).toBe(
      BigInt(evidence.conservation.finalizedTransfers) + BigInt(evidence.conservation.reserved),
    );
    expect(evidence.acceptAll.productionReadback.transferProofLabel).toBe("Transfers finalized");
    expect(evidence.acceptAll.productionReadback.readWithoutWallet).toBe(true);
    expect(evidence.unresolved.productionReadback.statusLabel).toBe("Unresolved — funds held");
    expect(evidence.unresolved.productionReadback.readWithoutWallet).toBe(true);
  });
});
