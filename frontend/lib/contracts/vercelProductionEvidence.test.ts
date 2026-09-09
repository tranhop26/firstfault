import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

describe("V3 Vercel Production evidence", () => {
  test("binds production to V3 while preserving the verified V1 rollback point", async () => {
    const path = resolve(process.cwd(), "../deployments/vercel.json");
    const evidence = JSON.parse(await readFile(path, "utf8"));

    expect(evidence).toMatchObject({
      deploymentCommit: "ab67a2b7e5d4da1b315179c0ea5dd4523bea5f2f",
      deploymentId: "6S85eiff8Dwk634YTZbmzNk5pxaR",
      url: "https://firstfault.vercel.app",
      environment: {
        NEXT_PUBLIC_GENLAYER_RPC_URL: "https://studio.genlayer.com/api",
        NEXT_PUBLIC_GENLAYER_CHAIN_ID: "61999",
        NEXT_PUBLIC_CONTRACT_ADDRESS: "0x9236A835741DF7f891613B5578753647C140124E",
        NEXT_PUBLIC_CONTRACT_VERSION: "v3",
      },
      http: { status: 200, containsProjectTitle: true },
      liveChecks: {
        v3TerminalReadback: {
          workflowId: "firstfault-v3-funded-20260909-1",
          state: "ACCEPTED_PENDING_FINALITY",
          deposited: "3000000000000000000",
          reserved: "0",
          payoutScheduled: "3000000000000000000",
          transferProof: "Transfers finalized",
          finalizedTransferCount: 3,
          readWithoutWallet: true,
        },
      },
      predecessor: {
        contractAddress: "0x2271AE904A97865491e4b24c49532f71B711eD5f",
        contractVersion: "v1",
        deploymentCommit: "f38ea60c3a3a3fde38126c5116c53b88c970518b",
      },
    });
    expect(Number.isNaN(Date.parse(evidence.verifiedAt))).toBe(false);
  });
});
