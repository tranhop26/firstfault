import { createClient } from "genlayer-js";
import { localnet, studionet } from "genlayer-js/chains";
import {
  CalldataAddress,
  ExecutionResult,
  TransactionStatus,
  type GenLayerTransaction,
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
};

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
      interval: this.endpoint ? 20 : 5_000,
      retries: this.endpoint ? 100 : 120,
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
}
