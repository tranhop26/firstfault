import { createClient } from "genlayer-js";
import { localnet, studionet } from "genlayer-js/chains";
import {
  CalldataAddress,
  ExecutionResult,
  TransactionStatus,
  type GenLayerTransaction,
  type TransactionHash,
} from "genlayer-js/types";
import { hexToBytes, type Account, type Address } from "viem";

export type FirstFaultWorkflow = {
  buyer: string;
  deposited: string;
  orchestrator: string;
  outcome: string;
  paid: string;
  payout_scheduled: string;
  refunded: string;
  refund_scheduled: string;
  reserved: string;
  state: string;
  workflow_id: string;
  rejection_reason?: string;
  unresolved_reason?: string;
  dispute_opened_at?: string;
  verdict?: {
    outcome: string;
    first_breach_step: number;
    step_statuses: Array<{ step_index: number; status: string }>;
  };
};

export type FirstFaultStep = {
  amount: string;
  brief: string;
  deadline: string;
  state: string;
  step_index: number;
  worker: string;
  workflow_id: string;
  output_hash?: string;
  evidence_hash?: string;
  brief_hash?: string;
  evidence_actor?: string;
  observed_at?: string;
  output_text?: string;
  schema_version?: string;
  source_url?: string;
  submitted_at?: string;
  upstream_hash?: string;
};

export type FirstFaultAccounting = Pick<FirstFaultWorkflow, "deposited" | "reserved" | "payout_scheduled" | "refund_scheduled" | "paid" | "refunded">;
export type FirstFaultRecovery = { workflow_id: string; cure?: Record<string, unknown>; settlement?: Record<string, unknown> };

export type CreateWorkflowInput = {
  workflowId: string;
  orchestrator: Address;
  researcher: Address;
  writer: Address;
  publisher: Address;
  researchBrief: string;
  writerBrief: string;
  publisherBrief: string;
  amounts: readonly [bigint, bigint, bigint];
  deadlines: readonly [bigint, bigint, bigint];
  nonce: string;
};

export type SubmittedStep = {
  receipt: GenLayerTransaction;
  outputHash: string;
  readback: FirstFaultStep;
};

type ContractAccount = Account | Address;

function asContractAddress(address: Address): CalldataAddress {
  return new CalldataAddress(hexToBytes(address));
}

function parseContractJson<T>(value: unknown): T {
  if (typeof value !== "string") {
    throw new Error("FirstFault returned a non-JSON readback");
  }
  return JSON.parse(value) as T;
}

function executionSucceeded(receipt: GenLayerTransaction): boolean {
  if (receipt.txExecutionResultName) {
    return receipt.txExecutionResultName === ExecutionResult.FINISHED_WITH_RETURN;
  }
  return receipt.consensus_data?.leader_receipt?.[0]?.execution_result === "SUCCESS";
}

/** Headless FirstFault contract boundary shared by browser code and Localnet tests. */
export default class FirstFault {
  private client: ReturnType<typeof createClient>;

  constructor(
    private readonly contractAddress: Address,
    private account?: ContractAccount,
    private readonly endpoint?: string,
  ) {
    this.client = this.makeClient(account);
  }

  private makeClient(account?: ContractAccount) {
    return createClient({
      chain: this.endpoint ? localnet : studionet,
      ...(this.endpoint ? { endpoint: this.endpoint } : {}),
      ...(account ? { account } : {}),
    });
  }

  updateAccount(account: ContractAccount): void {
    this.account = account;
    this.client = this.makeClient(account);
  }

  private async write(functionName: string, args: unknown[], value = 0n) {
    if (!this.account) throw new Error("A connected account is required");
    const hash = await this.client.writeContract({
      account: this.account,
      address: this.contractAddress,
      functionName,
      args: args as never[],
      value,
    });
    const receipt = await this.client.waitForTransactionReceipt({
      hash,
      status: TransactionStatus.FINALIZED,
      interval: this.endpoint ? 250 : 5_000,
      retries: this.endpoint ? 600 : 120,
    });
    if (!executionSucceeded(receipt)) {
      throw new Error(`FirstFault ${functionName} finalized with failed execution`);
    }
    return receipt;
  }

  async createWorkflow(input: CreateWorkflowInput) {
    return this.write("create_workflow", [
      input.workflowId,
      asContractAddress(input.orchestrator),
      asContractAddress(input.researcher),
      asContractAddress(input.writer),
      asContractAddress(input.publisher),
      input.researchBrief,
      input.writerBrief,
      input.publisherBrief,
      ...input.amounts,
      ...input.deadlines,
      input.nonce,
    ]);
  }

  async fundWorkflow(workflowId: string, nonce: string, value: bigint) {
    return this.write("fund_workflow", [workflowId, nonce], value);
  }

  async startWorkflow(workflowId: string, nonce: string) {
    return this.write("start_workflow", [workflowId, nonce]);
  }

  async acceptWorkflow(workflowId: string, nonce: string) {
    return this.write("accept_workflow", [workflowId, nonce]);
  }

  async cancelWorkflow(workflowId: string, nonce: string) {
    return this.write("cancel_workflow", [workflowId, nonce]);
  }

  async openDispute(workflowId: string, rejectionReason: string, nonce: string) {
    return this.write("open_dispute", [workflowId, rejectionReason, nonce]);
  }

  async adjudicate(workflowId: string, nonce: string) {
    return this.write("adjudicate", [workflowId, nonce]);
  }

  async timeoutToUnresolved(workflowId: string, nonce: string) {
    return this.write("timeout_dispute_to_unresolved", [workflowId, nonce]);
  }

  async submitStep(
    workflowId: string,
    stepIndex: number,
    outputText: string,
    upstreamHash: string,
    sourceUrl: string,
    observedAt: bigint,
    nonce: string,
  ): Promise<SubmittedStep> {
    const receipt = await this.write("submit_step", [
      workflowId,
      stepIndex,
      outputText,
      upstreamHash,
      sourceUrl,
      observedAt,
      nonce,
    ]);
    const readback = await this.getStep(workflowId, stepIndex);
    if (!readback.output_hash) throw new Error("Submitted step has no authoritative output hash");
    return { receipt, outputHash: readback.output_hash, readback };
  }

  async getWorkflow(workflowId: string): Promise<FirstFaultWorkflow> {
    return parseContractJson<FirstFaultWorkflow>(
      await this.client.readContract({
        address: this.contractAddress,
        functionName: "get_workflow",
        args: [workflowId],
      }),
    );
  }

  async getStep(workflowId: string, stepIndex: number): Promise<FirstFaultStep> {
    return parseContractJson<FirstFaultStep>(
      await this.client.readContract({
        address: this.contractAddress,
        functionName: "get_step",
        args: [workflowId, stepIndex],
      }),
    );
  }

  async getAccounting(workflowId: string): Promise<FirstFaultAccounting> {
    return parseContractJson<FirstFaultAccounting>(
      await this.client.readContract({ address: this.contractAddress, functionName: "get_accounting", args: [workflowId] }),
    );
  }

  async getRecovery(workflowId: string): Promise<FirstFaultRecovery> {
    return parseContractJson<FirstFaultRecovery>(
      await this.client.readContract({ address: this.contractAddress, functionName: "get_recovery", args: [workflowId] }),
    );
  }

  async getTransactionReceipt(hash: TransactionHash): Promise<GenLayerTransaction> {
    return this.client.getTransaction({ hash });
  }

  async getTriggeredReceiptsByHash(hash: TransactionHash): Promise<GenLayerTransaction[]> {
    const childIds = await this.client.getTriggeredTransactionIds({ hash });
    const children = await Promise.all(
      childIds.map(async (childHash) => {
        await this.client.waitForTransactionReceipt({
          hash: childHash,
          status: TransactionStatus.FINALIZED,
          interval: this.endpoint ? 250 : 5_000,
          retries: this.endpoint ? 600 : 120,
        });
        return this.client.getTransaction({ hash: childHash });
      }),
    );
    return children.map((child) => {
      const rpcChild = child as GenLayerTransaction & {
        triggered_by?: string;
        origin_address?: string;
      };
      const comesFromContract = child.from_address?.toLowerCase() === this.contractAddress.toLowerCase()
        && rpcChild.origin_address?.toLowerCase() === this.contractAddress.toLowerCase();
      const belongsToParent = rpcChild.triggered_by?.toLowerCase() === hash.toLowerCase();
      const hasExternalPayload = Boolean(child.to_address) && BigInt(child.value ?? 0) > 0n && child.consensus_data == null;
      // genlayer-js currently maps the numeric transaction type 0 to undefined.
      const hasExternalType = child.type === 0 || child.type === undefined;
      if (
        child.statusName !== TransactionStatus.FINALIZED
        || !hasExternalType
        || !comesFromContract
        || !belongsToParent
        || !hasExternalPayload
      ) {
        const childHash = String(child.hash ?? child.txId ?? "unknown");
        throw new Error(`FirstFault child ${childHash} did not finalize as an external value transfer`);
      }
      return child.type === undefined ? { ...child, type: 0 } : child;
    });
  }

  async getTriggeredReceipts(receipt: GenLayerTransaction): Promise<GenLayerTransaction[]> {
    const hash = (receipt.hash ?? receipt.txId) as TransactionHash | undefined;
    if (!hash) return [];
    return this.getTriggeredReceiptsByHash(hash);
  }
}
