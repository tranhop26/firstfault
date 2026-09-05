import { randomUUID } from "node:crypto";
import {
  access,
  mkdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname } from "node:path";

import { EXPECTED_FIRSTFAULT_METHODS } from "./deploymentEvidence";

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const TRANSACTION_PATTERN = /^0x[0-9a-fA-F]{64}$/;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const EXPLORER_BASE = "https://explorer-studio.genlayer.com";

export type DeploymentManifestInput = {
  contractAddress: string;
  deploymentTransactionHash: string;
  deployerAddress: string;
  sourceSha256: string;
  deployedSourceSha256: string;
  expectedMethods: readonly string[];
  executionResult: "FINISHED_WITH_RETURN";
  deployedAt: string;
  explorerUrl: string;
  transactionExplorerUrl: string;
  predecessor: string | null;
  successor: string | null;
};

export type DeploymentManifest = DeploymentManifestInput & {
  schemaVersion: 1;
  project: "FirstFault";
  network: "studionet";
  chainId: 61999;
  classification: "INTENTIONALLY_FROZEN";
  sourcePath: "contracts/firstfault.py";
  constructorArgs: [];
  receiptStatus: "FINALIZED";
};

export type SafeDeploymentLog = Pick<
  DeploymentManifest,
  | "network"
  | "contractAddress"
  | "deploymentTransactionHash"
  | "deployerAddress"
  | "sourceSha256"
> & { status: "verified" };

export type ManifestFileOps = {
  mkdir(path: string, options: { recursive: true }): Promise<unknown>;
  access(path: string): Promise<void>;
  writeFile(
    path: string,
    data: string,
    options: { encoding: "utf8"; flag: "wx" },
  ): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
  rm(path: string, options: { force: true }): Promise<void>;
};

const nodeFileOps: ManifestFileOps = {
  mkdir: (path, options) => mkdir(path, options),
  access: (path) => access(path),
  writeFile: (path, data, options) => writeFile(path, data, options),
  rename: (oldPath, newPath) => rename(oldPath, newPath),
  rm: (path, options) => rm(path, options),
};

function requireAddress(value: string, label: string): void {
  if (!ADDRESS_PATTERN.test(value) || /^0x0{40}$/i.test(value)) {
    throw new Error(`Invalid ${label}`);
  }
}

function requireOptionalAddress(value: string | null, label: string): void {
  if (value !== null) requireAddress(value, label);
}

function requireExactUrl(value: string, expected: string, label: string): void {
  if (value !== expected) throw new Error(`Invalid ${label}`);
}

export function buildDeploymentManifest(
  input: DeploymentManifestInput,
): DeploymentManifest {
  requireAddress(input.contractAddress, "contract address");
  requireAddress(input.deployerAddress, "deployer address");
  requireOptionalAddress(input.predecessor, "predecessor address");
  requireOptionalAddress(input.successor, "successor address");

  if (!TRANSACTION_PATTERN.test(input.deploymentTransactionHash)) {
    throw new Error("Invalid deployment transaction hash");
  }
  if (!DIGEST_PATTERN.test(input.sourceSha256)) {
    throw new Error("Invalid source SHA-256");
  }
  if (!DIGEST_PATTERN.test(input.deployedSourceSha256)) {
    throw new Error("Invalid deployed source SHA-256");
  }
  if (input.sourceSha256 !== input.deployedSourceSha256) {
    throw new Error("Deployed source mismatch");
  }
  if (
    JSON.stringify(input.expectedMethods) !==
    JSON.stringify(EXPECTED_FIRSTFAULT_METHODS)
  ) {
    throw new Error("Invalid FirstFault method set");
  }
  if (input.executionResult !== "FINISHED_WITH_RETURN") {
    throw new Error("Invalid deployment execution result");
  }
  if (
    !input.deployedAt.endsWith("Z") ||
    Number.isNaN(Date.parse(input.deployedAt)) ||
    new Date(input.deployedAt).toISOString() !== input.deployedAt
  ) {
    throw new Error("Invalid deployment timestamp");
  }

  requireExactUrl(
    input.explorerUrl,
    `${EXPLORER_BASE}/address/${input.contractAddress}`,
    "contract explorer URL",
  );
  requireExactUrl(
    input.transactionExplorerUrl,
    `${EXPLORER_BASE}/tx/${input.deploymentTransactionHash}`,
    "transaction explorer URL",
  );

  return {
    schemaVersion: 1,
    project: "FirstFault",
    network: "studionet",
    chainId: 61999,
    classification: "INTENTIONALLY_FROZEN",
    contractAddress: input.contractAddress,
    deploymentTransactionHash: input.deploymentTransactionHash,
    deployerAddress: input.deployerAddress,
    sourcePath: "contracts/firstfault.py",
    sourceSha256: input.sourceSha256,
    deployedSourceSha256: input.deployedSourceSha256,
    constructorArgs: [],
    expectedMethods: [...input.expectedMethods],
    receiptStatus: "FINALIZED",
    executionResult: input.executionResult,
    deployedAt: input.deployedAt,
    explorerUrl: input.explorerUrl,
    transactionExplorerUrl: input.transactionExplorerUrl,
    predecessor: input.predecessor,
    successor: input.successor,
  };
}

export function deploymentLogFields(
  manifest: DeploymentManifest,
): SafeDeploymentLog {
  return {
    network: manifest.network,
    contractAddress: manifest.contractAddress,
    deploymentTransactionHash: manifest.deploymentTransactionHash,
    deployerAddress: manifest.deployerAddress,
    sourceSha256: manifest.sourceSha256,
    status: "verified",
  };
}

export async function assertDeploymentManifestAbsent(
  path: string,
  fileOps: Pick<ManifestFileOps, "access"> = nodeFileOps,
): Promise<void> {
  try {
    await fileOps.access(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  throw new Error("Deployment manifest already exists");
}

export async function writeDeploymentManifestAtomically(
  path: string,
  input: DeploymentManifestInput,
  fileOps: ManifestFileOps = nodeFileOps,
): Promise<DeploymentManifest> {
  const manifest = buildDeploymentManifest(input);
  await fileOps.mkdir(dirname(path), { recursive: true });
  await assertDeploymentManifestAbsent(path, fileOps);

  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await fileOps.writeFile(
      temporaryPath,
      `${JSON.stringify(manifest, null, 2)}\n`,
      { encoding: "utf8", flag: "wx" },
    );
    await fileOps.rename(temporaryPath, path);
  } catch (error) {
    await fileOps.rm(temporaryPath, { force: true });
    throw error;
  }
  return manifest;
}
