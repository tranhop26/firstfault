import { TransactionStatus } from "genlayer-js/types";

import {
  type DeploymentReceiptLike,
  verifyDeploymentReceipt,
} from "./verifyDeployment";
import {
  type V2ContractSchemaLike,
  verifyV2SourceAndSchema,
} from "./v2DeploymentEvidence";
import {
  assertV2DeploymentManifestAbsent,
  type V2DeploymentManifest,
  type V2DeploymentManifestInput,
  writeV2DeploymentManifestAtomically,
} from "./writeV2DeploymentManifest";

type Address = `0x${string}`;
type TransactionHash = `0x${string}`;

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const TRANSACTION_HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/;
const SOURCE_COMMIT_PATTERN = /^[0-9a-f]{40}$/;
const STUDIONET_CHAIN_ID = 61999;
const STUDIONET_EXPLORER = "https://explorer-studio.genlayer.com";
const V1_PREDECESSOR = "0x2271AE904A97865491e4b24c49532f71B711eD5f";

export type V2DeploymentClient = {
  getChainId(): Promise<number>;
  deployContract(input: { code: string; args: [] }): Promise<TransactionHash>;
  waitForTransactionReceipt(input: {
    hash: TransactionHash;
    status: TransactionStatus;
    interval: number;
    retries: number;
  }): Promise<DeploymentReceiptLike>;
  getContractCode(address: Address): Promise<string>;
  getContractSchema(address: Address): Promise<V2ContractSchemaLike>;
};

type V2ManifestWriter = (
  path: string,
  input: V2DeploymentManifestInput,
) => Promise<V2DeploymentManifest>;

export type DeployFirstFaultV2Input = {
  client: V2DeploymentClient;
  source: string;
  sourceCommit: string;
  manifestPath: string;
  deployerAddress: Address;
  explorerUrl: string;
  now?: () => Date;
  assertManifestAbsent?: (path: string) => Promise<void>;
  writeManifest?: V2ManifestWriter;
  onSubmitted?: (evidence: {
    deploymentTransactionHash: TransactionHash;
    deployerAddress: Address;
  }) => void;
};

function validateV2Preflight(input: DeployFirstFaultV2Input): void {
  if (!input.source.trim()) throw new Error("FirstFault V2 contract source is empty");
  if (!SOURCE_COMMIT_PATTERN.test(input.sourceCommit)) {
    throw new Error("Invalid V2 source commit");
  }
  if (
    !ADDRESS_PATTERN.test(input.deployerAddress) ||
    /^0x0{40}$/i.test(input.deployerAddress)
  ) {
    throw new Error("Invalid deployer address");
  }
  if (input.explorerUrl !== STUDIONET_EXPLORER) {
    throw new Error("Invalid Studionet explorer URL");
  }
}

async function prepareV2Deployment(
  input: DeployFirstFaultV2Input,
): Promise<{ writeManifest: V2ManifestWriter; now: () => Date }> {
  validateV2Preflight(input);
  const assertManifestAbsent =
    input.assertManifestAbsent ?? assertV2DeploymentManifestAbsent;
  const writeManifest =
    input.writeManifest ?? writeV2DeploymentManifestAtomically;
  const now = input.now ?? (() => new Date());

  await assertManifestAbsent(input.manifestPath);
  const chainId = await input.client.getChainId();
  if (chainId !== STUDIONET_CHAIN_ID) {
    throw new Error(
      `Expected Studionet chain ID ${STUDIONET_CHAIN_ID}, received ${chainId}`,
    );
  }
  return { writeManifest, now };
}

async function verifyAndRecordV2Deployment(
  input: DeployFirstFaultV2Input,
  deploymentTransactionHash: TransactionHash,
  writeManifest: V2ManifestWriter,
  now: () => Date,
): Promise<V2DeploymentManifest> {
  if (!TRANSACTION_HASH_PATTERN.test(deploymentTransactionHash)) {
    throw new Error("Invalid deployment transaction hash");
  }
  const receipt = await input.client.waitForTransactionReceipt({
    hash: deploymentTransactionHash,
    status: TransactionStatus.FINALIZED,
    interval: 5_000,
    retries: 120,
  });
  const { contractAddress, executionResult } = verifyDeploymentReceipt(
    receipt,
    deploymentTransactionHash,
    input.deployerAddress,
  );
  const [deployedSource, schema] = await Promise.all([
    input.client.getContractCode(contractAddress),
    input.client.getContractSchema(contractAddress),
  ]);
  const evidence = verifyV2SourceAndSchema(input.source, deployedSource, schema);
  const explorerBase = input.explorerUrl.replace(/\/$/, "");

  return writeManifest(input.manifestPath, {
    contractAddress,
    deploymentTransactionHash,
    deployerAddress: input.deployerAddress,
    sourceCommit: input.sourceCommit,
    sourceSha256: evidence.sourceSha256,
    deployedSourceSha256: evidence.deployedSourceSha256,
    expectedMethods: evidence.expectedMethods,
    executionResult,
    deployedAt: now().toISOString(),
    explorerUrl: `${explorerBase}/address/${contractAddress}`,
    transactionExplorerUrl: `${explorerBase}/tx/${deploymentTransactionHash}`,
    predecessor: V1_PREDECESSOR,
    successor: null,
  });
}

export async function deployFirstFaultV2(
  input: DeployFirstFaultV2Input,
): Promise<V2DeploymentManifest> {
  const { writeManifest, now } = await prepareV2Deployment(input);
  const deploymentTransactionHash = await input.client.deployContract({
    code: input.source,
    args: [],
  });
  input.onSubmitted?.({
    deploymentTransactionHash,
    deployerAddress: input.deployerAddress,
  });
  return verifyAndRecordV2Deployment(
    input,
    deploymentTransactionHash,
    writeManifest,
    now,
  );
}

export async function resumeFirstFaultV2Deployment(
  input: DeployFirstFaultV2Input,
  deploymentTransactionHash: TransactionHash,
): Promise<V2DeploymentManifest> {
  const { writeManifest, now } = await prepareV2Deployment(input);
  return verifyAndRecordV2Deployment(
    input,
    deploymentTransactionHash,
    writeManifest,
    now,
  );
}
