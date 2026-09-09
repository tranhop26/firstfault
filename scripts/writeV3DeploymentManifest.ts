import { randomUUID } from "node:crypto";
import { access, link, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { EXPECTED_FIRSTFAULT_V3_METHODS } from "./v3DeploymentEvidence";

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const TRANSACTION_PATTERN = /^0x[0-9a-fA-F]{64}$/;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const COMMIT_PATTERN = /^[0-9a-f]{40}$/;
const EXPLORER_BASE = "https://explorer-studio.genlayer.com";
const V2_PREDECESSOR = "0x24c060E5394b5bD14a5546B055A7F049f9842987";

export type V3DeploymentManifestInput = {
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
  predecessor: string;
  successor: null;
};

export type V3DeploymentManifest = V3DeploymentManifestInput & {
  schemaVersion: 1;
  project: "FirstFault";
  contractVersion: "v3";
  network: "studionet";
  chainId: 61999;
  classification: "INTENTIONALLY_FROZEN";
  sourcePath: "contracts/firstfault_v3.py";
  constructorArgs: [];
  receiptStatus: "FINALIZED";
};

export type V3SafeDeploymentLog = Pick<
  V3DeploymentManifest,
  | "network"
  | "contractAddress"
  | "deploymentTransactionHash"
  | "deployerAddress"
  | "sourceSha256"
  | "sourceCommit"
> & { status: "verified" };

export type V3ManifestFileOps = {
  mkdir(path: string, options: { recursive: true }): Promise<unknown>;
  access(path: string): Promise<void>;
  writeFile(
    path: string,
    data: string,
    options: { encoding: "utf8"; flag: "wx" },
  ): Promise<void>;
  link(oldPath: string, newPath: string): Promise<void>;
  rm(path: string, options: { force: true }): Promise<void>;
};

const nodeFileOps: V3ManifestFileOps = {
  mkdir: (path, options) => mkdir(path, options),
  access: (path) => access(path),
  writeFile: (path, data, options) => writeFile(path, data, options),
  link: (oldPath, newPath) => link(oldPath, newPath),
  rm: (path, options) => rm(path, options),
};

function requireAddress(value: string, label: string): void {
  if (!ADDRESS_PATTERN.test(value) || /^0x0{40}$/i.test(value)) {
    throw new Error(`Invalid ${label}`);
  }
}

function requireExactUrl(value: string, expected: string, label: string): void {
  if (value !== expected) throw new Error(`Invalid ${label}`);
}

export function buildV3DeploymentManifest(
  input: V3DeploymentManifestInput,
): V3DeploymentManifest {
  requireAddress(input.contractAddress, "contract address");
  requireAddress(input.deployerAddress, "deployer address");
  requireAddress(input.predecessor, "predecessor address");
  if (input.predecessor !== V2_PREDECESSOR) {
    throw new Error("Invalid predecessor");
  }
  if (input.successor !== null) throw new Error("Invalid successor");
  if (!TRANSACTION_PATTERN.test(input.deploymentTransactionHash)) {
    throw new Error("Invalid deployment transaction hash");
  }
  if (!COMMIT_PATTERN.test(input.sourceCommit)) {
    throw new Error("Invalid source commit");
  }
  if (!DIGEST_PATTERN.test(input.sourceSha256)) {
    throw new Error("Invalid source SHA-256");
  }
  if (!DIGEST_PATTERN.test(input.deployedSourceSha256)) {
    throw new Error("Invalid deployed source SHA-256");
  }
  if (input.sourceSha256 !== input.deployedSourceSha256) {
    throw new Error("Deployed V3 source mismatch");
  }
  if (
    JSON.stringify(input.expectedMethods) !==
    JSON.stringify(EXPECTED_FIRSTFAULT_V3_METHODS)
  ) {
    throw new Error("Invalid FirstFault V3 method set");
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
    contractVersion: "v3",
    network: "studionet",
    chainId: 61999,
    classification: "INTENTIONALLY_FROZEN",
    contractAddress: input.contractAddress,
    deploymentTransactionHash: input.deploymentTransactionHash,
    deployerAddress: input.deployerAddress,
    sourcePath: "contracts/firstfault_v3.py",
    sourceCommit: input.sourceCommit,
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
    successor: null,
  };
}

export function v3DeploymentLogFields(
  manifest: V3DeploymentManifest,
): V3SafeDeploymentLog {
  return {
    network: manifest.network,
    contractAddress: manifest.contractAddress,
    deploymentTransactionHash: manifest.deploymentTransactionHash,
    deployerAddress: manifest.deployerAddress,
    sourceSha256: manifest.sourceSha256,
    sourceCommit: manifest.sourceCommit,
    status: "verified",
  };
}

export async function assertV3DeploymentManifestAbsent(
  path: string,
  fileOps: Pick<V3ManifestFileOps, "access"> = nodeFileOps,
): Promise<void> {
  try {
    await fileOps.access(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  throw new Error("V3 deployment manifest already exists");
}

export async function writeV3DeploymentManifestAtomically(
  path: string,
  input: V3DeploymentManifestInput,
  fileOps: V3ManifestFileOps = nodeFileOps,
): Promise<V3DeploymentManifest> {
  const manifest = buildV3DeploymentManifest(input);
  await fileOps.mkdir(dirname(path), { recursive: true });
  await assertV3DeploymentManifestAbsent(path, fileOps);

  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await fileOps.writeFile(
      temporaryPath,
      `${JSON.stringify(manifest, null, 2)}\n`,
      { encoding: "utf8", flag: "wx" },
    );
    await fileOps.link(temporaryPath, path);
    await fileOps.rm(temporaryPath, { force: true });
  } catch (error) {
    await fileOps.rm(temporaryPath, { force: true });
    throw error;
  }
  return manifest;
}
