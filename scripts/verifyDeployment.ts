import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { ExecutionResult, TransactionStatus, type Hash } from "genlayer-js/types";

type DeploymentReceiptLike = {
  statusName?: string;
  txExecutionResultName?: string;
  to_address?: string;
  recipient?: string;
  data?: Record<string, unknown>;
  consensus_data?: {
    leader_receipt?: Array<{ execution_result?: string }>;
  };
};

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

export function verifyDeploymentReceipt(receipt: DeploymentReceiptLike): string {
  if (receipt.statusName !== TransactionStatus.FINALIZED) {
    throw new Error("Deployment is not finalized");
  }
  const localExecution = receipt.consensus_data?.leader_receipt?.[0]?.execution_result;
  const succeeded = receipt.txExecutionResultName
    ? receipt.txExecutionResultName === ExecutionResult.FINISHED_WITH_RETURN
    : localExecution === "SUCCESS";
  if (!succeeded) throw new Error("Deployment execution failed");

  const dataAddress = receipt.data?.contract_address;
  const address =
    receipt.to_address ?? receipt.recipient ?? (typeof dataAddress === "string" ? dataAddress : "");
  if (!ADDRESS_PATTERN.test(address) || /^0x0{40}$/i.test(address)) {
    throw new Error("Deployment receipt has no contract address");
  }
  return address;
}

export async function verifyDeployment(hash: Hash, endpoint?: string) {
  const client = createClient({ chain: studionet, ...(endpoint ? { endpoint } : {}) });
  const receipt = await client.waitForTransactionReceipt({
    hash,
    status: TransactionStatus.FINALIZED,
    interval: 5_000,
    retries: 120,
  });
  return { receipt, contractAddress: verifyDeploymentReceipt(receipt) };
}
