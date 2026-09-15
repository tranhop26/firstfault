import { ExecutionResult, type FeesDistribution } from "genlayer-js/types";

import { verifyDeploymentReceipt, type DeploymentReceiptLike } from "./verifyDeployment";
import { verifyV3SourceAndSchema } from "./v3DeploymentEvidence";
import {
  assertStudioNextDeploymentManifestAbsent,
  writeStudioNextDeploymentManifestAtomically,
  type StudioNextDeploymentManifestInput,
} from "./writeStudioNextDeploymentManifest";
import { normalizeSource, sha256Hex } from "./deploymentEvidence";
import {
  assertStudioNextPendingDeploymentAbsent,
  clearStudioNextPendingDeployment,
  deserializeFeeDistribution,
  serializeFeeDistribution,
  validateStudioNextPendingDeployment,
  writeStudioNextPendingDeployment,
  type StudioNextPendingDeployment,
} from "./studioNextDeploymentPending";

type Address = `0x${string}`;
type TransactionHash = `0x${string}`;

export type StudioNextDeploymentClient = {
  getChainId(): Promise<number>;
  estimateTransactionFees(): Promise<{ distribution: FeesDistribution; feeValue: bigint }>;
  getSubmittedDeploymentEnvelope(hash: TransactionHash): Promise<{
    deployerAddress: Address;
    distribution: FeesDistribution;
    feeValue: bigint;
  }>;
  deployContract(input: {
    code: string;
    args: [];
    fees: { distribution: FeesDistribution; feeValue: bigint };
  }): Promise<TransactionHash>;
  waitForTransactionReceipt(input: {
    hash: TransactionHash;
    waitUntil: "finalized";
    interval: number;
    retries: number;
  }): Promise<DeploymentReceiptLike>;
  getContractCode(address: Address): Promise<string>;
  getContractSchema(address: Address): Promise<{ methods: Record<string, unknown> }>;
};

type Evidence = {
  sourceSha256: string;
  deployedSourceSha256: string;
  expectedMethods: readonly string[];
};

export type DeployFirstFaultStudioNextInput = {
  client: StudioNextDeploymentClient;
  source: string;
  sourceCommit: string;
  manifestPath: string;
  pendingPath: string;
  deployerAddress: Address;
  explorerUrl: string;
  now?: () => Date;
  verifySourceAndSchema?: (expected: string, deployed: string, schema: { methods: Record<string, unknown> }) => Evidence;
  assertManifestAbsent?: (path: string) => Promise<void>;
  assertPendingAbsent?: (path: string) => Promise<void>;
  writePending?: (path: string, pending: StudioNextPendingDeployment) => Promise<void>;
  clearPending?: (path: string) => Promise<void>;
  writeManifest?: (path: string, input: StudioNextDeploymentManifestInput) => Promise<unknown>;
  onFeeQuoted?: (quote: { distribution: FeesDistribution; feeValue: bigint }) => void;
  onSubmitted?: (hash: TransactionHash) => void;
};

async function prepare(input: DeployFirstFaultStudioNextInput, requireNoPending: boolean) {
  if (!input.source.trim()) throw new Error("FirstFault V3 contract source is empty");
  if (input.explorerUrl !== "https://explorer-studio-dev.genlayer.com") {
    throw new Error("Invalid Studio Next explorer URL");
  }
  await (input.assertManifestAbsent ?? assertStudioNextDeploymentManifestAbsent)(input.manifestPath);
  if (requireNoPending) {
    await (input.assertPendingAbsent ?? assertStudioNextPendingDeploymentAbsent)(input.pendingPath);
  }
  const chainId = await input.client.getChainId();
  if (chainId !== 61997) throw new Error(`Expected Studio Next chain ID 61997, received ${chainId}`);
}

async function verifyAndRecord(
  input: DeployFirstFaultStudioNextInput,
  hash: TransactionHash,
  expectedQuote?: { distribution: FeesDistribution; feeValue: bigint },
) {
  const submittedQuote = await input.client.getSubmittedDeploymentEnvelope(hash);
  if (submittedQuote.deployerAddress.toLowerCase() !== input.deployerAddress.toLowerCase()) {
    throw new Error("Studio Next deployment fee envelope wallet mismatch");
  }
  if (expectedQuote && (
    submittedQuote.feeValue !== expectedQuote.feeValue
    || JSON.stringify(serializeFeeDistribution(submittedQuote.distribution))
      !== JSON.stringify(serializeFeeDistribution(expectedQuote.distribution))
  )) {
    throw new Error("Studio Next submitted fee quote mismatch");
  }
  const receipt = await input.client.waitForTransactionReceipt({
    hash,
    waitUntil: "finalized",
    interval: 5_000,
    retries: 120,
  });
  if (receipt.txExecutionResultName !== ExecutionResult.FINISHED_WITH_RETURN) {
    throw new Error("Studio Next deployment did not finish with FINISHED_WITH_RETURN");
  }
  const { contractAddress, executionResult } = verifyDeploymentReceipt(receipt, hash, input.deployerAddress);
  const [deployedSource, schema] = await Promise.all([
    input.client.getContractCode(contractAddress),
    input.client.getContractSchema(contractAddress),
  ]);
  const evidence = (input.verifySourceAndSchema ?? verifyV3SourceAndSchema)(input.source, deployedSource, schema);
  const explorer = input.explorerUrl.replace(/\/$/, "");
  const manifestInput: StudioNextDeploymentManifestInput = {
    contractAddress,
    deploymentTransactionHash: hash,
    deployerAddress: input.deployerAddress,
    sourceCommit: input.sourceCommit,
    sourceSha256: evidence.sourceSha256,
    deployedSourceSha256: evidence.deployedSourceSha256,
    expectedMethods: evidence.expectedMethods,
    executionResult,
    deployedAt: (input.now ?? (() => new Date()))().toISOString(),
    explorerUrl: `${explorer}/address/${contractAddress}`,
    transactionExplorerUrl: `${explorer}/tx/${hash}`,
    feeDeposit: submittedQuote.feeValue.toString(),
    feeDistribution: serializeFeeDistribution(submittedQuote.distribution),
  };
  const manifest = await (input.writeManifest ?? writeStudioNextDeploymentManifestAtomically)(input.manifestPath, manifestInput);
  await (input.clearPending ?? clearStudioNextPendingDeployment)(input.pendingPath);
  return manifest;
}

export async function deployFirstFaultStudioNext(input: DeployFirstFaultStudioNextInput) {
  await prepare(input, true);
  const quote = await input.client.estimateTransactionFees();
  input.onFeeQuoted?.(quote);
  const hash = await input.client.deployContract({
    code: input.source,
    args: [],
    fees: { distribution: quote.distribution, feeValue: quote.feeValue },
  });
  input.onSubmitted?.(hash);
  const pending: StudioNextPendingDeployment = {
    schemaVersion: 1,
    network: "studio-next",
    chainId: 61997,
    deployerAddress: input.deployerAddress,
    sourceCommit: input.sourceCommit,
    sourceSha256: sha256Hex(normalizeSource(input.source)),
    deploymentTransactionHash: hash,
    feeDeposit: quote.feeValue.toString(),
    feeDistribution: serializeFeeDistribution(quote.distribution),
  };
  await (input.writePending ?? writeStudioNextPendingDeployment)(input.pendingPath, pending);
  return verifyAndRecord(input, hash, quote);
}

export async function resumeFirstFaultStudioNextDeployment(
  input: DeployFirstFaultStudioNextInput,
  hash: TransactionHash,
  pending?: StudioNextPendingDeployment,
) {
  await prepare(input, false);
  let expectedQuote: { distribution: FeesDistribution; feeValue: bigint } | undefined;
  if (pending) {
    validateStudioNextPendingDeployment(pending);
    if (pending.deploymentTransactionHash.toLowerCase() !== hash.toLowerCase()) {
      throw new Error("Resume hash does not match the saved Studio Next pending deployment");
    }
    if (pending.deployerAddress.toLowerCase() !== input.deployerAddress.toLowerCase()) {
      throw new Error("Pending deployment wallet does not match the active deployer");
    }
    if (pending.sourceCommit !== input.sourceCommit || pending.sourceSha256 !== sha256Hex(normalizeSource(input.source))) {
      throw new Error("Pending deployment source does not match the current V3 source");
    }
    expectedQuote = {
      distribution: deserializeFeeDistribution(pending.feeDistribution),
      feeValue: BigInt(pending.feeDeposit),
    };
  }
  return verifyAndRecord(input, hash, expectedQuote);
}
