import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const ADDRESS = "0x9236A835741DF7f891613B5578753647C140124E";

describe("V3 Vercel Preview evidence", () => {
  test("binds the Preview to the verified V3 contract and terminal workflow", async () => {
    const path = resolve(process.cwd(), "../deployments/vercel-v3-preview.json");
    const evidence = JSON.parse(await readFile(path, "utf8"));

    expect(evidence).toMatchObject({
      schemaVersion: 1,
      project: "firstfault",
      teamSlug: "tdh-s-projects",
      environment: "preview",
      branch: "chore/promote-v3-production",
      deploymentCommit: "a66a99569504327e0c9f6b9e22e55098c2e59b7d",
      configuration: {
        rpcUrl: "https://studio.genlayer.com/api",
        chainId: 61999,
        contractAddress: ADDRESS,
        contractVersion: "v3",
      },
      http: { status: 200 },
      readback: {
        workflowId: "firstfault-v3-funded-20260909-1",
        state: "ACCEPTED_PENDING_FINALITY",
        deposited: "3000000000000000000",
        reserved: "0",
        payoutScheduled: "3000000000000000000",
        readWithoutWallet: true,
        transferProofLabel: "Transfers finalized",
        finalizedTransferCount: 3,
        transferValueEach: "1000000000000000000",
      },
    });
    expect(new URL(evidence.url).protocol).toBe("https:");
    expect(Number.isNaN(Date.parse(evidence.verifiedAt))).toBe(false);
  });
});
