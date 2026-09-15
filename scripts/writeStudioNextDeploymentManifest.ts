import { randomUUID } from "node:crypto";
import { access, link, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const EXPLORER = "https://explorer-studio-dev.genlayer.com";

export type StudioNextDeploymentManifestInput = {
  contractAddress: string;
  deploymentTransactionHash: string;
  deployerAddress: string;
  sourceCommit: string;
  sourceSha256: string;
  deployedSourceSha256: string;
  expectedMethods: readonly string[];
  executionResult: "FINISHED_WITH_RETURN";
  deployedAt: string;
  explorerUrl: string;
  transactionExplorerUrl: string;
  feeDeposit: string;
  feeDistribution: Record<string, string | string[]>;
};

export type StudioNextDeploymentManifest = StudioNextDeploymentManifestInput & {
  schemaVersion: 1;
  project: "FirstFault";
  contractVersion: "v3";
  network: "studio-next";
  chainId: 61997;
  classification: "HACKATHON_DEPLOYMENT";
  sourcePath: "contracts/firstfault_v3.py";
  constructorArgs: [];
  receiptStatus: "FINALIZED";
};

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const HASH = /^0x[0-9a-fA-F]{64}$/;
const COMMIT = /^[0-9a-f]{40}$/;
const DIGEST = /^[0-9a-f]{64}$/;

export async function assertStudioNextDeploymentManifestAbsent(path: string) {
  try {
    await access(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  throw new Error("Studio Next deployment manifest already exists");
}

export function buildStudioNextDeploymentManifest(
  input: StudioNextDeploymentManifestInput,
): StudioNextDeploymentManifest {
  if (!ADDRESS.test(input.contractAddress) || /^0x0{40}$/i.test(input.contractAddress)) {
    throw new Error("Invalid contract address");
  }
  if (!ADDRESS.test(input.deployerAddress) || /^0x0{40}$/i.test(input.deployerAddress)) {
    throw new Error("Invalid deployer address");
  }
  if (!HASH.test(input.deploymentTransactionHash)) throw new Error("Invalid deployment transaction hash");
  if (!COMMIT.test(input.sourceCommit)) throw new Error("Invalid source commit");
  if (!DIGEST.test(input.sourceSha256) || input.sourceSha256 !== input.deployedSourceSha256) {
    throw new Error("Deployed source mismatch");
  }
  if (input.executionResult !== "FINISHED_WITH_RETURN") throw new Error("Invalid execution result");
  if (input.explorerUrl !== `${EXPLORER}/address/${input.contractAddress}`) {
    throw new Error("Invalid Studio Next contract explorer URL");
  }
  if (input.transactionExplorerUrl !== `${EXPLORER}/tx/${input.deploymentTransactionHash}`) {
    throw new Error("Invalid Studio Next transaction explorer URL");
  }
  if (!/^\d+$/.test(input.feeDeposit)) throw new Error("Invalid fee deposit");

  return {
    schemaVersion: 1,
    project: "FirstFault",
    contractVersion: "v3",
    network: "studio-next",
    chainId: 61997,
    classification: "HACKATHON_DEPLOYMENT",
    sourcePath: "contracts/firstfault_v3.py",
    constructorArgs: [],
    receiptStatus: "FINALIZED",
    ...input,
    expectedMethods: [...input.expectedMethods],
  };
}

export async function writeStudioNextDeploymentManifestAtomically(
  path: string,
  input: StudioNextDeploymentManifestInput,
) {
  const manifest = buildStudioNextDeploymentManifest(input);
  await mkdir(dirname(path), { recursive: true });
  await assertStudioNextDeploymentManifestAbsent(path);
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    await link(temporaryPath, path);
    await rm(temporaryPath, { force: true });
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
  return manifest;
}
