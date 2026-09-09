import { formatGen } from "./amounts";

export type ContractReadback = {
  state: string;
  reserved: string;
  payout_scheduled: string;
  refund_scheduled: string;
};

export type TransactionEvidence = {
  hash: string;
  statusName: string;
  executionSucceeded: boolean;
  value: string;
};

export type TransactionProjectionInput = {
  connected: boolean;
  correctNetwork: boolean;
  receipt: TransactionEvidence | null;
  triggeredReceipts: TransactionEvidence[];
  readback: ContractReadback | null;
  error: string | null;
  submitted: boolean;
};

export type UiPhase =
  | "DISCONNECTED"
  | "WRONG_NETWORK"
  | "READY"
  | "SUBMITTED"
  | "FINALIZED"
  | "TRANSFER_PENDING"
  | "SUCCESS"
  | "UNRESOLVED"
  | "ERROR";

export type ProjectedStatus = {
  phase: UiPhase;
  label: string;
  detail: string;
};

const terminalSuccess = new Set(["SETTLED_SUCCESS", "SETTLED_BREACH", "SETTLED_MUTUAL"]);

export function canWrite(input: { connected: boolean; correctNetwork: boolean; configured: boolean }) {
  return input.connected && input.correctNetwork && input.configured;
}

export function projectTransactionStatus(input: TransactionProjectionInput): ProjectedStatus {
  if (input.error && input.receipt?.statusName === "FINALIZED" && input.receipt.executionSucceeded) {
    return {
      phase: "FINALIZED",
      label: "Finalized — reconciliation needed",
      detail: `The parent transaction finalized, but readback or child-transfer proof could not be reconstructed: ${input.error}`,
    };
  }
  if (input.error) return { phase: "ERROR", label: "Action failed", detail: input.error };
  if (!input.connected) return { phase: "DISCONNECTED", label: "Wallet not connected", detail: "Connect a wallet to submit a contract action." };
  if (!input.correctNetwork) return { phase: "WRONG_NETWORK", label: "Wrong network", detail: "Switch to GenLayer Studionet before continuing." };

  if (input.readback?.state === "UNRESOLVED") {
    return { phase: "UNRESOLVED", label: "Unresolved — funds held", detail: `${formatGen(input.readback.reserved)} simulated GEN remains reserved by the contract.` };
  }
  if (input.readback && terminalSuccess.has(input.readback.state)) {
    return { phase: "SUCCESS", label: "Settlement confirmed", detail: "The terminal contract state was reconstructed from readback." };
  }

  const scheduled = input.readback
    ? BigInt(input.readback.payout_scheduled) + BigInt(input.readback.refund_scheduled)
    : 0n;
  const finalizedChildValue = input.triggeredReceipts.reduce(
    (total, child) => total + (child.statusName === "FINALIZED" && child.executionSucceeded ? BigInt(child.value) : 0n),
    0n,
  );
  const allChildrenSucceeded = input.triggeredReceipts.length > 0
    && input.triggeredReceipts.every((child) => child.statusName === "FINALIZED" && child.executionSucceeded)
    && finalizedChildValue === scheduled;
  if (input.receipt?.statusName === "FINALIZED" && input.receipt.executionSucceeded && scheduled > 0n && allChildrenSucceeded) {
    return { phase: "SUCCESS", label: "Transfers finalized", detail: "Every scheduled transfer finalized for the exact contract-accounted value." };
  }
  if (scheduled > 0n) {
    return input.receipt?.statusName === "FINALIZED" && input.receipt.executionSucceeded
      ? { phase: "TRANSFER_PENDING", label: "Transfer pending", detail: "The parent decision finalized; child transfers still need execution proof." }
      : { phase: "TRANSFER_PENDING", label: "Transfer proof unavailable", detail: "The contract scheduled value, but this browser has not reconstructed exact finalized child-transfer proof." };
  }
  if (input.receipt?.statusName === "FINALIZED" && input.receipt.executionSucceeded) {
    return { phase: "FINALIZED", label: "Finalized", detail: "The contract action finalized. Readback is being reconciled." };
  }
  if (input.submitted || input.receipt) {
    return { phase: "SUBMITTED", label: "Submitted", detail: "The transaction is awaiting consensus and finality." };
  }
  return { phase: "READY", label: "Ready", detail: "Contract state is loaded from Studionet." };
}
