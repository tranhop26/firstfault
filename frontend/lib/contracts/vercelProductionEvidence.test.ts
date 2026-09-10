import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

describe("V3 Vercel Production evidence", () => {
  test("binds production to the receipt fix while preserving verified rollback evidence", async () => {
    const path = resolve(process.cwd(), "../deployments/vercel.json");
    const evidence = JSON.parse(await readFile(path, "utf8"));

    expect(evidence).toMatchObject({
      deploymentCommit: "68d9b89a708daf7ae547a9b998f58e981d3a0b3a",
      deploymentId: "Gkfi7PGacCy18n6PeeY1WV97nfRu",
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
        v3DisputeReadback: {
          workflowId: "firstfault-v3-writer-breach-20260910-1",
          state: "DECISION_PENDING_FINALITY",
          outcome: "FIRST_BREACH",
          firstBreachStep: 1,
          stepStatuses: ["COMPLIANT", "MATERIAL_BREACH", "COMPLIANT"],
          deposited: "3000000000000000000",
          reserved: "0",
          payoutScheduled: "2000000000000000000",
          refundScheduled: "1000000000000000000",
          transferProof: "Transfers finalized",
          parentTransactionHash: "0xd3fecdeafbb30c7382a32dced6f8eab2438aa90e4eba25565cc24047def4f512",
          childTransactionHashes: [
            "0xa7dc45c69507f18dbec622493ca81b57b6831d71d09934c223bef4b8489db671",
            "0xc0c607bcccff569ac847a95817477956b513fd3d1456357d606ce28f0dc8bbb1",
            "0x689368c746f8afe06c637a7e47cd64fe0c0d026392f038bde5711c81a9f4949a",
          ],
          finalizedTransferCount: 3,
          transferValueEach: "1000000000000000000",
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
