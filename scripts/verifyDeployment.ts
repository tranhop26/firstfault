import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { ExecutionResult, TransactionStatus, type Hash } from "genlayer-js/types";

import {
  type ContractSchemaLike,
  verifySourceAndSchema,
} from "./deploymentEvidence";

type Address = `0x${string}`;

export type DeploymentReceiptLike = {
  hash?: string;
  txId?: string;
  from_address?: string;
  sender?: string;
  statusName?: string;
  txExecutionResultName?: string;
  to_address?: string;
  recipient?: string;
  data?: Record<string, unknown>;
  txDataDecoded?: Record<string, unknown>;
  consensus_data?: {
    leader_receipt?: Array<{ execution_result?: string }>;
  };
};

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

export type VerifiedDeploymentReceipt = {
  contractAddress: Address;
  executionResult: "FINISHED_WITH_RETURN";
};

export type DeploymentReadClient = {
  getContractCode(address: Address): Promise<string>;
  getContractSchema(address: Address): Promise<ContractSchemaLike>;
};

export function verifyDeploymentReceipt(
  receipt: DeploymentReceiptLike,
  expectedTransactionHash: `0x${string}`,
  expectedDeployerAddress?: Address,
): VerifiedDeploymentReceipt {
  const receiptHash = receipt.hash ?? receipt.txId;
  if (
    typeof receiptHash !== "string" ||
    receiptHash.toLowerCase() !== expectedTransactionHash.toLowerCase()
  ) {
    throw new Error("Deployment receipt transaction hash mismatch");
  }
  if (expectedDeployerAddress) {
    const receiptSender = receipt.from_address ?? receipt.sender;
    if (
      typeof receiptSender !== "string" ||
      receiptSender.toLowerCase() !== expectedDeployerAddress.toLowerCase()
    ) {
      throw new Error("Deployment receipt deployer address mismatch");
    }
  }
  if (receipt.statusName !== TransactionStatus.FINALIZED) {
    throw new Error("Deployment is not finalized");
  }
  const localExecution = receipt.consensus_data?.leader_receipt?.[0]?.execution_result;
  const succeeded = receipt.txExecutionResultName
    ? receipt.txExecutionResultName === ExecutionResult.FINISHED_WITH_RETURN
    : localExecution === "SUCCESS";
  if (!succeeded) throw new Error("Deployment execution failed");

  const decodedAddress = receipt.txDataDecoded?.contractAddress;
  const dataAddress = receipt.data?.contract_address;
  const address =
    (typeof decodedAddress === "string" ? decodedAddress : undefined) ??
    (typeof dataAddress === "string" ? dataAddress : undefined) ??
    receipt.to_address ??
    receipt.recipient ??
    "";
  if (!ADDRESS_PATTERN.test(address) || /^0x0{40}$/i.test(address)) {
    throw new Error("Deployment receipt has no contract address");
  }
  return {
    contractAddress: address as Address,
    executionResult: "FINISHED_WITH_RETURN",
  };
}

export async function verifyLiveDeployment(
  client: DeploymentReadClient,
  contractAddress: Address,
  expectedSource: string,
) {
  const [deployedSource, schema] = await Promise.all([
    client.getContractCode(contractAddress),
    client.getContractSchema(contractAddress),
  ]);
  return verifySourceAndSchema(expectedSource, deployedSource, schema);
}

export async function verifyDeployment(hash: Hash, endpoint?: string) {
  const client = createClient({ chain: studionet, ...(endpoint ? { endpoint } : {}) });
  const receipt = await client.waitForTransactionReceipt({
    hash,
    status: TransactionStatus.FINALIZED,
    interval: 5_000,
    retries: 120,
  });
  const verified = verifyDeploymentReceipt(receipt, hash);
  return { receipt, contractAddress: verified.contractAddress };
}
