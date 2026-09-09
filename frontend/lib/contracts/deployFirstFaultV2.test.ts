import { describe, expect, test, vi } from "vitest";

import {
  deployFirstFaultV2,
  resumeFirstFaultV2Deployment,
  type DeployFirstFaultV2Input,
  type V2DeploymentClient,
} from "../../../scripts/deployFirstFaultV2";
import { EXPECTED_FIRSTFAULT_V2_METHODS } from "../../../scripts/v2DeploymentEvidence";
import {
  buildV2DeploymentManifest,
  type V2DeploymentManifestInput,
} from "../../../scripts/writeV2DeploymentManifest";

const TRANSACTION_HASH = `0x${"a".repeat(64)}` as `0x${string}`;
const OTHER_TRANSACTION_HASH = `0x${"b".repeat(64)}` as `0x${string}`;
const CONTRACT_ADDRESS = "0x1111111111111111111111111111111111111111" as const;
const DEPLOYER_ADDRESS = "0x2222222222222222222222222222222222222222" as const;
const OTHER_DEPLOYER = "0x3333333333333333333333333333333333333333" as const;
const PREDECESSOR_ADDRESS = "0x2271AE904A97865491e4b24c49532f71B711eD5f";
const SOURCE_COMMIT = "c".repeat(40);
const SOURCE = "class FirstFault: pass\n";

function expectedSchema() {
  return {
    methods: Object.fromEntries(
      EXPECTED_FIRSTFAULT_V2_METHODS.map((name) => [name, { readonly: false }]),
    ),
  };
}

function makeHarness(overrides: Partial<V2DeploymentClient> = {}) {
  const calls: string[] = [];
  const client: V2DeploymentClient = {
    getChainId: vi.fn(async () => {
      calls.push("chain");
      return 61999;
    }),
    deployContract: vi.fn(async () => {
      calls.push("deploy");
      return TRANSACTION_HASH;
    }),
    waitForTransactionReceipt: vi.fn(async () => {
      calls.push("finalized");
      return {
        hash: TRANSACTION_HASH,
        from_address: DEPLOYER_ADDRESS,
        status_name: "FINALIZED",
        txExecutionResultName: "FINISHED_WITH_RETURN",
        to_address: CONTRACT_ADDRESS,
      };
    }),
    getContractCode: vi.fn(async () => {
      calls.push("code");
      return SOURCE;
    }),
    getContractSchema: vi.fn(async () => {
      calls.push("schema");
      return expectedSchema();
    }),
    ...overrides,
  };
  const writeManifest = vi.fn(
    async (_path: string, manifestInput: V2DeploymentManifestInput) => {
      calls.push("manifest");
      return buildV2DeploymentManifest(manifestInput);
    },
  );
  const input: DeployFirstFaultV2Input = {
    client,
    source: SOURCE,
    sourceCommit: SOURCE_COMMIT,
    manifestPath: "C:/firstfault/deployments/studionet-v2.json",
    deployerAddress: DEPLOYER_ADDRESS,
    explorerUrl: "https://explorer-studio.genlayer.com",
    now: () => new Date("2026-09-09T00:00:00.000Z"),
    assertManifestAbsent: vi.fn(async () => {
      calls.push("manifest-absent");
    }),
    writeManifest,
    onSubmitted: vi.fn(() => calls.push("submitted")),
  };
  return { calls, client, input, writeManifest };
}

describe("FirstFault V2 Studionet deployment orchestration", () => {
  test("records V2 evidence only after finalized source and schema readback", async () => {
    const { calls, client, input, writeManifest } = makeHarness();

    const result = await deployFirstFaultV2(input);

    expect(client.deployContract).toHaveBeenCalledWith({ code: SOURCE, args: [] });
    expect(client.waitForTransactionReceipt).toHaveBeenCalledWith({
      hash: TRANSACTION_HASH,
      status: "FINALIZED",
      interval: 5_000,
      retries: 120,
    });
    expect(calls).toEqual([
      "manifest-absent",
      "chain",
      "deploy",
      "submitted",
      "finalized",
      "code",
      "schema",
      "manifest",
    ]);
    expect(writeManifest).toHaveBeenCalledWith(
      input.manifestPath,
      expect.objectContaining({
        sourceCommit: SOURCE_COMMIT,
        predecessor: PREDECESSOR_ADDRESS,
        expectedMethods: EXPECTED_FIRSTFAULT_V2_METHODS,
      }),
    );
    expect(result).toMatchObject({
      contractVersion: "v2",
      contractAddress: CONTRACT_ADDRESS,
      deploymentTransactionHash: TRANSACTION_HASH,
      sourceCommit: SOURCE_COMMIT,
      receiptStatus: "FINALIZED",
      executionResult: "FINISHED_WITH_RETURN",
    });
  });

  test("refuses an existing V2 manifest before network access", async () => {
    const { client, input, writeManifest } = makeHarness();
    input.assertManifestAbsent = vi.fn(async () => {
      throw new Error("V2 deployment manifest already exists");
    });

    await expect(deployFirstFaultV2(input)).rejects.toThrow("already exists");
    expect(client.getChainId).not.toHaveBeenCalled();
    expect(client.deployContract).not.toHaveBeenCalled();
    expect(writeManifest).not.toHaveBeenCalled();
  });

  test("rejects a non-Studionet chain before deployment", async () => {
    const { client, input, writeManifest } = makeHarness({
      getChainId: vi.fn(async () => 61127),
    });

    await expect(deployFirstFaultV2(input)).rejects.toThrow(
      "Expected Studionet chain ID 61999",
    );
    expect(client.deployContract).not.toHaveBeenCalled();
    expect(writeManifest).not.toHaveBeenCalled();
  });

  test.each([
    [{ source: "" }, "V2 contract source"],
    [{ sourceCommit: "A".repeat(40) }, "source commit"],
    [{ deployerAddress: "0x0" }, "deployer address"],
    [{ explorerUrl: "https://example.com" }, "Studionet explorer"],
  ])("rejects invalid V2 static preflight input %#", async (override, message) => {
    const { client, input, writeManifest } = makeHarness();
    Object.assign(input, override);

    await expect(deployFirstFaultV2(input)).rejects.toThrow(message);
    expect(client.getChainId).not.toHaveBeenCalled();
    expect(client.deployContract).not.toHaveBeenCalled();
    expect(writeManifest).not.toHaveBeenCalled();
  });

  test("records no manifest when finalized execution fails", async () => {
    const { input, writeManifest } = makeHarness({
      waitForTransactionReceipt: vi.fn(async () => ({
        hash: TRANSACTION_HASH,
        from_address: DEPLOYER_ADDRESS,
        statusName: "FINALIZED",
        txExecutionResultName: "FINISHED_WITH_ERROR",
        to_address: CONTRACT_ADDRESS,
      })),
    });

    await expect(deployFirstFaultV2(input)).rejects.toThrow("execution failed");
    expect(writeManifest).not.toHaveBeenCalled();
  });

  test("records no manifest when the receipt belongs to another transaction", async () => {
    const { input, writeManifest } = makeHarness({
      waitForTransactionReceipt: vi.fn(async () => ({
        hash: OTHER_TRANSACTION_HASH,
        from_address: DEPLOYER_ADDRESS,
        statusName: "FINALIZED",
        txExecutionResultName: "FINISHED_WITH_RETURN",
        to_address: CONTRACT_ADDRESS,
      })),
    });

    await expect(deployFirstFaultV2(input)).rejects.toThrow("transaction hash mismatch");
    expect(writeManifest).not.toHaveBeenCalled();
  });

  test("records no manifest when the receipt belongs to another wallet", async () => {
    const { input, writeManifest } = makeHarness({
      waitForTransactionReceipt: vi.fn(async () => ({
        hash: TRANSACTION_HASH,
        from_address: OTHER_DEPLOYER,
        statusName: "FINALIZED",
        txExecutionResultName: "FINISHED_WITH_RETURN",
        to_address: CONTRACT_ADDRESS,
      })),
    });

    await expect(deployFirstFaultV2(input)).rejects.toThrow("deployer address mismatch");
    expect(writeManifest).not.toHaveBeenCalled();
  });

  test("records no manifest when deployed source differs", async () => {
    const { input, writeManifest } = makeHarness({
      getContractCode: vi.fn(async () => "class Other: pass\n"),
    });

    await expect(deployFirstFaultV2(input)).rejects.toThrow("V2 source mismatch");
    expect(writeManifest).not.toHaveBeenCalled();
  });

  test("records no manifest when deployed schema differs", async () => {
    const { input, writeManifest } = makeHarness({
      getContractSchema: vi.fn(async () => ({ methods: {} })),
    });

    await expect(deployFirstFaultV2(input)).rejects.toThrow("V2 schema mismatch");
    expect(writeManifest).not.toHaveBeenCalled();
  });

  test("records no manifest when live readback is unavailable", async () => {
    const { input, writeManifest } = makeHarness({
      getContractCode: vi.fn(async () => {
        throw new Error("RPC unavailable");
      }),
    });

    await expect(deployFirstFaultV2(input)).rejects.toThrow("RPC unavailable");
    expect(writeManifest).not.toHaveBeenCalled();
  });

  test("resumes the exact submitted hash without deploying again", async () => {
    const { calls, client, input } = makeHarness();

    const result = await resumeFirstFaultV2Deployment(input, TRANSACTION_HASH);

    expect(client.deployContract).not.toHaveBeenCalled();
    expect(input.onSubmitted).not.toHaveBeenCalled();
    expect(calls).toEqual([
      "manifest-absent",
      "chain",
      "finalized",
      "code",
      "schema",
      "manifest",
    ]);
    expect(result.deploymentTransactionHash).toBe(TRANSACTION_HASH);
  });

  test("rejects a malformed resume hash before receipt polling", async () => {
    const { client, input, writeManifest } = makeHarness();

    await expect(
      resumeFirstFaultV2Deployment(input, "0x12" as `0x${string}`),
    ).rejects.toThrow("Invalid deployment transaction hash");
    expect(client.waitForTransactionReceipt).not.toHaveBeenCalled();
    expect(client.deployContract).not.toHaveBeenCalled();
    expect(writeManifest).not.toHaveBeenCalled();
  });
});
