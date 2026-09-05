import { describe, expect, test, vi } from "vitest";

import { EXPECTED_FIRSTFAULT_METHODS } from "../../../scripts/deploymentEvidence";
import {
  deployFirstFault,
  type DeploymentClient,
  type DeployFirstFaultInput,
} from "../../../scripts/deployFirstFault";
import {
  buildDeploymentManifest,
  type DeploymentManifestInput,
} from "../../../scripts/writeDeploymentManifest";

const TRANSACTION_HASH = `0x${"a".repeat(64)}` as `0x${string}`;
const CONTRACT_ADDRESS = "0x1111111111111111111111111111111111111111" as const;
const DEPLOYER_ADDRESS = "0x2222222222222222222222222222222222222222" as const;
const SOURCE = "class FirstFault: pass\n";

function expectedSchema() {
  return {
    methods: Object.fromEntries(
      EXPECTED_FIRSTFAULT_METHODS.map((name) => [name, { readonly: false }]),
    ),
  };
}

function makeHarness(overrides: Partial<DeploymentClient> = {}) {
  const calls: string[] = [];
  const client: DeploymentClient = {
    getChainId: vi.fn(async () => 61999),
    deployContract: vi.fn(async () => {
      calls.push("deploy");
      return TRANSACTION_HASH;
    }),
    waitForTransactionReceipt: vi.fn(async () => {
      calls.push("finalized");
      return {
        hash: TRANSACTION_HASH,
        statusName: "FINALIZED",
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
    async (_path: string, manifestInput: DeploymentManifestInput) => {
      calls.push("manifest");
      return buildDeploymentManifest(manifestInput);
    },
  );
  const input: DeployFirstFaultInput = {
    client,
    source: SOURCE,
    manifestPath: "C:/firstfault/deployments/studionet.json",
    deployerAddress: DEPLOYER_ADDRESS,
    explorerUrl: "https://explorer-studio.genlayer.com",
    now: () => new Date("2026-09-05T00:00:00.000Z"),
    assertManifestAbsent: vi.fn(async () => {
      calls.push("manifest-absent");
    }),
    writeManifest,
  };
  return { calls, client, input, writeManifest };
}

describe("FirstFault Studionet deployment orchestration", () => {
  test("verifies chain and finalized readback before recording evidence", async () => {
    const { calls, client, input } = makeHarness();

    const result = await deployFirstFault(input);

    expect(client.deployContract).toHaveBeenCalledTimes(1);
    expect(client.deployContract).toHaveBeenCalledWith({ code: SOURCE, args: [] });
    expect(client.waitForTransactionReceipt).toHaveBeenCalledWith({
      hash: TRANSACTION_HASH,
      status: "FINALIZED",
      interval: 5_000,
      retries: 120,
    });
    expect(calls).toEqual([
      "manifest-absent",
      "deploy",
      "finalized",
      "code",
      "schema",
      "manifest",
    ]);
    expect(result).toMatchObject({
      contractAddress: CONTRACT_ADDRESS,
      deploymentTransactionHash: TRANSACTION_HASH,
      receiptStatus: "FINALIZED",
      executionResult: "FINISHED_WITH_RETURN",
    });
  });

  test("refuses an existing manifest before network access or deployment", async () => {
    const { client, input, writeManifest } = makeHarness();
    input.assertManifestAbsent = vi.fn(async () => {
      throw new Error("Deployment manifest already exists");
    });

    await expect(deployFirstFault(input)).rejects.toThrow("already exists");
    expect(client.getChainId).not.toHaveBeenCalled();
    expect(client.deployContract).not.toHaveBeenCalled();
    expect(writeManifest).not.toHaveBeenCalled();
  });

  test("rejects a non-Studionet endpoint before deployment", async () => {
    const { client, input, writeManifest } = makeHarness({
      getChainId: vi.fn(async () => 61127),
    });

    await expect(deployFirstFault(input)).rejects.toThrow(
      "Expected Studionet chain ID 61999",
    );
    expect(client.deployContract).not.toHaveBeenCalled();
    expect(writeManifest).not.toHaveBeenCalled();
  });

  test.each([
    [{ source: "" }, "contract source"],
    [{ deployerAddress: "0x0" }, "deployer address"],
    [{ explorerUrl: "https://example.com" }, "Studionet explorer"],
  ])("rejects invalid static preflight input %#", async (override, message) => {
    const { client, input, writeManifest } = makeHarness();
    Object.assign(input, override);

    await expect(deployFirstFault(input)).rejects.toThrow(message);
    expect(client.getChainId).not.toHaveBeenCalled();
    expect(client.deployContract).not.toHaveBeenCalled();
    expect(writeManifest).not.toHaveBeenCalled();
  });

  test("records no manifest when finalized execution fails", async () => {
    const { input, writeManifest } = makeHarness({
      waitForTransactionReceipt: vi.fn(async () => ({
        hash: TRANSACTION_HASH,
        statusName: "FINALIZED",
        txExecutionResultName: "FINISHED_WITH_ERROR",
        to_address: CONTRACT_ADDRESS,
      })),
    });

    await expect(deployFirstFault(input)).rejects.toThrow("execution failed");
    expect(writeManifest).not.toHaveBeenCalled();
  });

  test("records no manifest when deployed source differs", async () => {
    const { input, writeManifest } = makeHarness({
      getContractCode: vi.fn(async () => "class Other: pass\n"),
    });

    await expect(deployFirstFault(input)).rejects.toThrow("source mismatch");
    expect(writeManifest).not.toHaveBeenCalled();
  });

  test("records no manifest when deployed schema differs", async () => {
    const { input, writeManifest } = makeHarness({
      getContractSchema: vi.fn(async () => ({ methods: {} })),
    });

    await expect(deployFirstFault(input)).rejects.toThrow("schema mismatch");
    expect(writeManifest).not.toHaveBeenCalled();
  });

  test("records no manifest when live readback is unavailable", async () => {
    const { input, writeManifest } = makeHarness({
      getContractCode: vi.fn(async () => {
        throw new Error("RPC unavailable");
      }),
    });

    await expect(deployFirstFault(input)).rejects.toThrow("RPC unavailable");
    expect(writeManifest).not.toHaveBeenCalled();
  });
});
