import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  deployFirstFaultStudioNext,
  resumeFirstFaultStudioNextDeployment,
} from "../../../scripts/deployFirstFaultStudioNext";
import {
  serializeFeeDistribution,
  deserializeFeeDistribution,
  validateStudioNextPendingDeployment,
  type StudioNextPendingDeployment,
} from "../../../scripts/studioNextDeploymentPending";

const TX = `0x${"1".repeat(64)}` as `0x${string}`;
const DEPLOYER = `0x${"2".repeat(40)}` as `0x${string}`;
const CONTRACT = `0x${"3".repeat(40)}` as `0x${string}`;
const COMMIT = "4".repeat(40);
const source = "class FirstFault:\n    pass\n";
const distribution = {
  leaderTimeunitsAllocation: 11n,
  validatorTimeunitsAllocation: 22n,
  appealRounds: 1n,
  executionBudgetPerRound: 33n,
  executionConsumed: 0n,
  totalMessageFees: 0n,
  rotations: [0n, 0n],
  maxPriceGenPerTimeUnit: 44n,
  storageFeeMaxGasPrice: 55n,
  receiptFeeMaxGasPrice: 66n,
};

const client = {
  getChainId: vi.fn(async () => 61997),
  estimateTransactionFees: vi.fn(async () => ({ distribution, feeValue: 77n })),
  getSubmittedDeploymentEnvelope: vi.fn(async () => ({
    deployerAddress: DEPLOYER,
    distribution,
    feeValue: 77n,
  })),
  deployContract: vi.fn(async () => TX),
  waitForTransactionReceipt: vi.fn(async () => ({
    hash: TX,
    from_address: DEPLOYER,
    statusName: "FINALIZED",
    txExecutionResultName: "FINISHED_WITH_RETURN",
    txDataDecoded: { contractAddress: CONTRACT },
  })),
  getContractCode: vi.fn(async () => source),
  getContractSchema: vi.fn(async () => ({ methods: {} })),
};

describe("FirstFault Studio Next deployment", () => {
  beforeEach(() => vi.clearAllMocks());

  it("quotes fees and submits the exact distribution and deposit unchanged", async () => {
    const writeManifest = vi.fn(async (_path, input) => input);
    const writePending = vi.fn(async () => undefined);
    const clearPending = vi.fn(async () => undefined);
    const onSubmitted = vi.fn();
    await deployFirstFaultStudioNext({
      client,
      source,
      sourceCommit: COMMIT,
      manifestPath: "C:/firstfault/deployments/studio-next-v3.json",
      pendingPath: "C:/firstfault/deployments/studio-next-v3.pending.json",
      deployerAddress: DEPLOYER,
      explorerUrl: "https://explorer-studio-dev.genlayer.com",
      verifySourceAndSchema: vi.fn(() => ({
        sourceSha256: "a".repeat(64),
        deployedSourceSha256: "a".repeat(64),
        expectedMethods: [],
      })),
      assertManifestAbsent: vi.fn(async () => undefined),
      assertPendingAbsent: vi.fn(async () => undefined),
      writePending,
      clearPending,
      writeManifest,
      onSubmitted,
    });

    expect(client.estimateTransactionFees).toHaveBeenCalledWith();
    expect(client.deployContract).toHaveBeenCalledWith({
      code: source,
      args: [],
      fees: { distribution, feeValue: 77n },
    });
    expect(client.waitForTransactionReceipt).toHaveBeenCalledWith({
      hash: TX,
      waitUntil: "finalized",
      interval: 5_000,
      retries: 120,
    });
    expect(onSubmitted).toHaveBeenCalledWith(TX);
    expect(onSubmitted.mock.invocationCallOrder[0]).toBeLessThan(writePending.mock.invocationCallOrder[0]);
    expect(writePending).toHaveBeenCalledWith(
      "C:/firstfault/deployments/studio-next-v3.pending.json",
      expect.objectContaining({ deploymentTransactionHash: TX, feeDeposit: "77" }),
    );
    expect(writeManifest).toHaveBeenCalledWith(
      "C:/firstfault/deployments/studio-next-v3.json",
      expect.objectContaining({
        contractAddress: CONTRACT,
        deploymentTransactionHash: TX,
        feeDeposit: "77",
      }),
    );
    expect(clearPending).toHaveBeenCalledWith("C:/firstfault/deployments/studio-next-v3.pending.json");
  });

  it("rejects every chain other than Studio Next before estimating or deploying", async () => {
    client.getChainId.mockResolvedValueOnce(61999);
    await expect(deployFirstFaultStudioNext({
      client,
      source,
      sourceCommit: COMMIT,
      manifestPath: "unused",
      pendingPath: "unused.pending",
      deployerAddress: DEPLOYER,
      explorerUrl: "https://explorer-studio-dev.genlayer.com",
      verifySourceAndSchema: vi.fn(),
      assertManifestAbsent: vi.fn(async () => undefined),
      assertPendingAbsent: vi.fn(async () => undefined),
      writeManifest: vi.fn(),
    })).rejects.toThrow("Expected Studio Next chain ID 61997");
    expect(client.estimateTransactionFees).not.toHaveBeenCalled();
    expect(client.deployContract).not.toHaveBeenCalled();
  });

  it("resumes the saved exact hash and quote without deploying again", async () => {
    const writeManifest = vi.fn(async (_path, input) => input);
    const clearPending = vi.fn(async () => undefined);
    const pending: StudioNextPendingDeployment = {
      schemaVersion: 1 as const,
      network: "studio-next" as const,
      chainId: 61997 as const,
      deployerAddress: DEPLOYER,
      sourceCommit: COMMIT,
      sourceSha256: "a".repeat(64),
      deploymentTransactionHash: TX,
      feeDeposit: "77",
      feeDistribution: serializeFeeDistribution(distribution),
    };
    const { createHash } = await import("node:crypto");
    pending.sourceSha256 = createHash("sha256").update(source.replaceAll("\r\n", "\n")).digest("hex");

    await resumeFirstFaultStudioNextDeployment({
      client,
      source,
      sourceCommit: COMMIT,
      manifestPath: "C:/firstfault/deployments/studio-next-v3.json",
      pendingPath: "C:/firstfault/deployments/studio-next-v3.pending.json",
      deployerAddress: DEPLOYER,
      explorerUrl: "https://explorer-studio-dev.genlayer.com",
      verifySourceAndSchema: vi.fn(() => ({
        sourceSha256: "a".repeat(64), deployedSourceSha256: "a".repeat(64), expectedMethods: [],
      })),
      assertManifestAbsent: vi.fn(async () => undefined),
      writeManifest,
      clearPending,
    }, TX, pending);

    expect(client.estimateTransactionFees).not.toHaveBeenCalled();
    expect(client.deployContract).not.toHaveBeenCalled();
    expect(client.waitForTransactionReceipt).toHaveBeenCalledWith(expect.objectContaining({ hash: TX }));
    expect(writeManifest).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ feeDeposit: "77" }));
  });

  it("can resume from the reported hash when the pending file was never written", async () => {
    const writeManifest = vi.fn(async (_path, input) => input);
    await resumeFirstFaultStudioNextDeployment({
      client,
      source,
      sourceCommit: COMMIT,
      manifestPath: "C:/firstfault/deployments/studio-next-v3.json",
      pendingPath: "C:/firstfault/deployments/studio-next-v3.pending.json",
      deployerAddress: DEPLOYER,
      explorerUrl: "https://explorer-studio-dev.genlayer.com",
      verifySourceAndSchema: vi.fn(() => ({
        sourceSha256: "a".repeat(64), deployedSourceSha256: "a".repeat(64), expectedMethods: [],
      })),
      assertManifestAbsent: vi.fn(async () => undefined),
      writeManifest,
      clearPending: vi.fn(async () => undefined),
    }, TX);

    expect(client.deployContract).not.toHaveBeenCalled();
    expect(writeManifest).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ feeDeposit: "77" }));
  });

  it("reports the deployment hash even when pending persistence fails", async () => {
    const onSubmitted = vi.fn();
    await expect(deployFirstFaultStudioNext({
      client,
      source,
      sourceCommit: COMMIT,
      manifestPath: "unused",
      pendingPath: "unwritable.pending",
      deployerAddress: DEPLOYER,
      explorerUrl: "https://explorer-studio-dev.genlayer.com",
      assertManifestAbsent: vi.fn(async () => undefined),
      assertPendingAbsent: vi.fn(async () => undefined),
      writePending: vi.fn(async () => { throw new Error("disk full"); }),
      onSubmitted,
    })).rejects.toThrow("disk full");
    expect(onSubmitted).toHaveBeenCalledWith(TX);
  });

  it("rejects edited pending fee evidence against the submitted envelope", async () => {
    const pending: StudioNextPendingDeployment = {
      schemaVersion: 1,
      network: "studio-next",
      chainId: 61997,
      deployerAddress: DEPLOYER,
      sourceCommit: COMMIT,
      sourceSha256: (await import("node:crypto")).createHash("sha256").update(source).digest("hex"),
      deploymentTransactionHash: TX,
      feeDeposit: "78",
      feeDistribution: serializeFeeDistribution(distribution),
    };
    await expect(resumeFirstFaultStudioNextDeployment({
      client,
      source,
      sourceCommit: COMMIT,
      manifestPath: "unused",
      pendingPath: "unused.pending",
      deployerAddress: DEPLOYER,
      explorerUrl: "https://explorer-studio-dev.genlayer.com",
      assertManifestAbsent: vi.fn(async () => undefined),
      writeManifest: vi.fn(),
    }, TX, pending)).rejects.toThrow("submitted fee quote mismatch");
  });

  it("round-trips every fee field in the pending recovery record", () => {
    expect(deserializeFeeDistribution(serializeFeeDistribution(distribution))).toEqual(distribution);
  });

  it("rejects a malformed pending transaction before resume", () => {
    expect(() => validateStudioNextPendingDeployment({
      schemaVersion: 1,
      network: "studio-next",
      chainId: 61997,
      deployerAddress: DEPLOYER,
      sourceCommit: COMMIT,
      sourceSha256: "a".repeat(64),
      deploymentTransactionHash: "0x12",
      feeDeposit: "77",
      feeDistribution: serializeFeeDistribution(distribution),
    } as unknown as StudioNextPendingDeployment)).toThrow("transaction hash");
  });
});
