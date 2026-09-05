import { TransactionStatus } from "genlayer-js/types";

import type { ContractSchemaLike } from "./deploymentEvidence";
import {
  type DeploymentReceiptLike,
  verifyDeploymentReceipt,
  verifyLiveDeployment,
} from "./verifyDeployment";
import {
  assertDeploymentManifestAbsent,
  type DeploymentManifest,
  type DeploymentManifestInput,
  writeDeploymentManifestAtomically,
} from "./writeDeploymentManifest";

type Address = `0x${string}`;
type TransactionHash = `0x${string}`;

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const STUDIONET_CHAIN_ID = 61999;
const STUDIONET_EXPLORER = "https://explorer-studio.genlayer.com";

export type DeploymentClient = {
  getChainId(): Promise<number>;
  deployContract(input: { code: string; args: [] }): Promise<TransactionHash>;
  waitForTransactionReceipt(input: {
    hash: TransactionHash;
    status: TransactionStatus;
    interval: number;
    retries: number;
  }): Promise<DeploymentReceiptLike>;
  getContractCode(address: Address): Promise<string>;
  getContractSchema(address: Address): Promise<ContractSchemaLike>;
};

type ManifestWriter = (
  path: string,
  input: DeploymentManifestInput,
) => Promise<DeploymentManifest>;

export type DeployFirstFaultInput = {
  client: DeploymentClient;
  source: string;
  manifestPath: string;
  deployerAddress: Address;
  explorerUrl: string;
  now?: () => Date;
  assertManifestAbsent?: (path: string) => Promise<void>;
  writeManifest?: ManifestWriter;
  onSubmitted?: (evidence: {
    deploymentTransactionHash: TransactionHash;
    deployerAddress: Address;
  }) => void;
};

function validatePreflight(input: DeployFirstFaultInput): void {
  if (!input.source.trim()) throw new Error("FirstFault contract source is empty");
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

export async function deployFirstFault(
  input: DeployFirstFaultInput,
): Promise<DeploymentManifest> {
  validatePreflight(input);
  const assertManifestAbsent =
    input.assertManifestAbsent ?? assertDeploymentManifestAbsent;
  const writeManifest = input.writeManifest ?? writeDeploymentManifestAtomically;
  const now = input.now ?? (() => new Date());

  await assertManifestAbsent(input.manifestPath);
  const chainId = await input.client.getChainId();
  if (chainId !== STUDIONET_CHAIN_ID) {
    throw new Error(
      `Expected Studionet chain ID ${STUDIONET_CHAIN_ID}, received ${chainId}`,
    );
  }

  const deploymentTransactionHash = await input.client.deployContract({
    code: input.source,
    args: [],
  });
  input.onSubmitted?.({
    deploymentTransactionHash,
    deployerAddress: input.deployerAddress,
  });

  const receipt = await input.client.waitForTransactionReceipt({
    hash: deploymentTransactionHash,
    status: TransactionStatus.FINALIZED,
    interval: 5_000,
    retries: 120,
  });
  const { contractAddress, executionResult } =
    verifyDeploymentReceipt(receipt);
  const evidence = await verifyLiveDeployment(
    input.client,
    contractAddress,
    input.source,
  );
  const explorerBase = input.explorerUrl.replace(/\/$/, "");

  return writeManifest(input.manifestPath, {
    contractAddress,
    deploymentTransactionHash,
    deployerAddress: input.deployerAddress,
    sourceSha256: evidence.sourceSha256,
    deployedSourceSha256: evidence.deployedSourceSha256,
    expectedMethods: evidence.expectedMethods,
    executionResult,
    deployedAt: now().toISOString(),
    explorerUrl: `${explorerBase}/address/${contractAddress}`,
    transactionExplorerUrl: `${explorerBase}/tx/${deploymentTransactionHash}`,
    predecessor: null,
    successor: null,
  });
}
