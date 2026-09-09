import { TransactionStatus } from "genlayer-js/types";

import {
  type DeploymentReceiptLike,
  verifyDeploymentReceipt,
} from "./verifyDeployment";
import {
  type V3ContractSchemaLike,
  verifyV3SourceAndSchema,
} from "./v3DeploymentEvidence";
import {
  assertV3DeploymentManifestAbsent,
  type V3DeploymentManifest,
  type V3DeploymentManifestInput,
  writeV3DeploymentManifestAtomically,
} from "./writeV3DeploymentManifest";

type Address = `0x${string}`;
type TransactionHash = `0x${string}`;

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const TRANSACTION_HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/;
const SOURCE_COMMIT_PATTERN = /^[0-9a-f]{40}$/;
const STUDIONET_CHAIN_ID = 61999;
const STUDIONET_EXPLORER = "https://explorer-studio.genlayer.com";
const V2_PREDECESSOR = "0x24c060E5394b5bD14a5546B055A7F049f9842987";

export type V3DeploymentClient = {
  getChainId(): Promise<number>;
  deployContract(input: { code: string; args: [] }): Promise<TransactionHash>;
  waitForTransactionReceipt(input: {
    hash: TransactionHash;
    status: TransactionStatus;
    interval: number;
    retries: number;
  }): Promise<DeploymentReceiptLike>;
  getContractCode(address: Address): Promise<string>;
  getContractSchema(address: Address): Promise<V3ContractSchemaLike>;
};

type V3ManifestWriter = (
  path: string,
  input: V3DeploymentManifestInput,
) => Promise<V3DeploymentManifest>;

export type DeployFirstFaultV3Input = {
  client: V3DeploymentClient;
  source: string;
  sourceCommit: string;
  manifestPath: string;
  deployerAddress: Address;
  explorerUrl: string;
  now?: () => Date;
  assertManifestAbsent?: (path: string) => Promise<void>;
  writeManifest?: V3ManifestWriter;
  onSubmitted?: (evidence: {
    deploymentTransactionHash: TransactionHash;
    deployerAddress: Address;
  }) => void;
};

function validateV3Preflight(input: DeployFirstFaultV3Input): void {
  if (!input.source.trim()) throw new Error("FirstFault V3 contract source is empty");
  if (!SOURCE_COMMIT_PATTERN.test(input.sourceCommit)) {
    throw new Error("Invalid V3 source commit");
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

async function prepareV3Deployment(
  input: DeployFirstFaultV3Input,
): Promise<{ writeManifest: V3ManifestWriter; now: () => Date }> {
  validateV3Preflight(input);
  const assertManifestAbsent =
    input.assertManifestAbsent ?? assertV3DeploymentManifestAbsent;
  const writeManifest =
    input.writeManifest ?? writeV3DeploymentManifestAtomically;
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

async function verifyAndRecordV3Deployment(
  input: DeployFirstFaultV3Input,
  deploymentTransactionHash: TransactionHash,
  writeManifest: V3ManifestWriter,
  now: () => Date,
): Promise<V3DeploymentManifest> {
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
  const evidence = verifyV3SourceAndSchema(input.source, deployedSource, schema);
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
    predecessor: V2_PREDECESSOR,
    successor: null,
  });
}

export async function deployFirstFaultV3(
  input: DeployFirstFaultV3Input,
): Promise<V3DeploymentManifest> {
  const { writeManifest, now } = await prepareV3Deployment(input);
  const deploymentTransactionHash = await input.client.deployContract({
    code: input.source,
    args: [],
  });
  input.onSubmitted?.({
    deploymentTransactionHash,
    deployerAddress: input.deployerAddress,
  });
  return verifyAndRecordV3Deployment(
    input,
    deploymentTransactionHash,
    writeManifest,
    now,
  );
}

export async function resumeFirstFaultV3Deployment(
  input: DeployFirstFaultV3Input,
  deploymentTransactionHash: TransactionHash,
): Promise<V3DeploymentManifest> {
  const { writeManifest, now } = await prepareV3Deployment(input);
  return verifyAndRecordV3Deployment(
    input,
    deploymentTransactionHash,
    writeManifest,
    now,
  );
}
