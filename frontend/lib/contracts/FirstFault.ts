import { createClient } from "genlayer-js";
import { localnet, studionet } from "genlayer-js/chains";
import {
  CalldataAddress,
  ExecutionResult,
  TransactionResult,
  TransactionResultNameToNumber,
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
  review_deadline?: string;
  adjudication_round?: string;
  round_opened_at?: string;
  verdict?: {
    outcome: string;
    first_breach_step: number;
    step_statuses: Array<{ step_index: number; status: string }>;
    reasons?: Array<{ step_index: number; confidence: string; material: boolean; causal: boolean; reason: string }>;
    cited_evidence_hashes?: string[];
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
  source_content?: string;
  source_content_hash?: string;
  source_snapshot_version?: string;
  submitted_at?: string;
  upstream_hash?: string;
};

export type FirstFaultAccounting = Pick<FirstFaultWorkflow, "deposited" | "reserved" | "payout_scheduled" | "refund_scheduled" | "paid" | "refunded">;
export type FirstFaultFundingIntent = {
  workflow_id: string;
  intent_id: string;
  buyer: string;
  expected_amount: string;
  expires_at: string;
  version: string;
  chain_id: string;
  contract_address: string;
  nonce: string;
  intent_hash: string;
  consumed: boolean;
};
export type FirstFaultFundingOutcome = {
  attempt_index: string;
  attempted_at: string;
  workflow_id: string;
  intent_id: string;
  intent_version: string;
  sender: string;
  received: string;
  retained: string;
  refund_scheduled: string;
  reason: string;
  result: "FUNDED" | "REFUND_SCHEDULED" | "REJECTED_NO_VALUE";
  workflow_state: string;
};
export type FirstFaultGlobalAccounting = {
  funding_attempt_count: string;
  total_accepted_funding: string;
  total_rejected_funding_received: string;
  total_rejected_funding_refund_scheduled: string;
  total_workflow_payout_scheduled: string;
  total_workflow_refund_scheduled: string;
};
export type FirstFaultSettlement = {
  approvals?: Record<string, boolean>;
  buyer_refund: string;
  proposal_hash?: string;
  publisher_amount: string;
  research_amount: string;
  version?: string;
  writer_amount: string;
};
export type FirstFaultCure = {
  step_index: number;
  observed_at: string;
  submitted_at: string;
  cure_hash?: string;
  source_content?: string;
  source_content_hash?: string;
  source_snapshot_version?: string;
  [key: string]: unknown;
};
export type FirstFaultRecovery = { workflow_id: string; cure?: Record<string, unknown>; cures?: FirstFaultCure[]; settlement?: FirstFaultSettlement };

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

export type SettlementEvidence = {
  parent: GenLayerTransaction;
  children: GenLayerTransaction[];
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
  const leaderExecution = receipt.consensus_data?.leader_receipt?.[0]?.execution_result;
  if (leaderExecution) return leaderExecution === "SUCCESS";
  return receipt.statusName === TransactionStatus.FINALIZED
    && (
      receipt.resultName === TransactionResult.MAJORITY_AGREE
      || receipt.result === Number(TransactionResultNameToNumber.MAJORITY_AGREE)
    );
}

/** Headless FirstFault contract boundary shared by browser code and Localnet tests. */
export default class FirstFault {
  private client: ReturnType<typeof createClient>;

  constructor(
    private readonly contractAddress: Address,
    private account?: ContractAccount,
    private readonly endpoint?: string,
    private readonly onSubmitted?: (hash: TransactionHash) => void,
    private readonly version: "v1" | "v2" | "v3" = "v1",
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
      address: this.contractAddress,
      functionName,
      args: args as never[],
      value,
    });
    this.onSubmitted?.(hash);
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
    const actors = this.version === "v3"
      ? [input.orchestrator, input.researcher, input.writer, input.publisher]
      : [
          asContractAddress(input.orchestrator),
          asContractAddress(input.researcher),
          asContractAddress(input.writer),
          asContractAddress(input.publisher),
        ];
    return this.write("create_workflow", [
      input.workflowId,
      ...actors,
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

  async prepareFunding(workflowId: string, intentId: string, expiresAt: bigint, nonce: string) {
    return this.write("prepare_funding", [workflowId, intentId, expiresAt, nonce]);
  }

  async fundPreparedWorkflow(workflowId: string, intentId: string, value: bigint) {
    return this.write("fund_workflow", [workflowId, intentId], value);
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

  async timeoutIncompleteToUnresolved(workflowId: string, nonce: string) {
    return this.write("timeout_incomplete_to_unresolved", [workflowId, nonce]);
  }

  async timeoutReviewToUnresolved(workflowId: string, nonce: string) {
    return this.write("timeout_review_to_unresolved", [workflowId, nonce]);
  }

  async retryAdjudication(workflowId: string, nonce: string) {
    return this.write("retry_adjudication", [workflowId, nonce]);
  }

  async submitCure(workflowId: string, evidenceText: string, sourceUrl: string, observedAt: bigint, nonce: string) {
    return this.write("submit_cure", [workflowId, evidenceText, sourceUrl, observedAt, nonce]);
  }

  async proposeMutualSettlement(workflowId: string, amounts: readonly [bigint, bigint, bigint, bigint], nonce: string) {
    return this.write("propose_mutual_settlement", [workflowId, ...amounts, nonce]);
  }

  async approveMutualSettlement(workflowId: string, expectedVersion: bigint, expectedHash: string, nonce: string) {
    return this.write("approve_mutual_settlement", [workflowId, expectedVersion, expectedHash, nonce]);
  }

  async executeMutualSettlement(workflowId: string, nonce: string) {
    return this.write("execute_mutual_settlement", [workflowId, nonce]);
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

  async getFundingIntent(workflowId: string): Promise<FirstFaultFundingIntent> {
    return parseContractJson<FirstFaultFundingIntent>(
      await this.client.readContract({ address: this.contractAddress, functionName: "get_funding_intent", args: [workflowId] }),
    );
  }

  async getFundingOutcome(attemptIndex: bigint): Promise<FirstFaultFundingOutcome> {
    return parseContractJson<FirstFaultFundingOutcome>(
      await this.client.readContract({ address: this.contractAddress, functionName: "get_funding_outcome", args: [attemptIndex] }),
    );
  }

  async getGlobalAccounting(): Promise<FirstFaultGlobalAccounting> {
    return parseContractJson<FirstFaultGlobalAccounting>(
      await this.client.readContract({ address: this.contractAddress, functionName: "get_global_accounting", args: [] }),
    );
  }

  async findSettlementEvidence(workflowId: string): Promise<SettlementEvidence | null> {
    const [workflow, steps] = await Promise.all([
      this.getWorkflow(workflowId),
      Promise.all([0, 1, 2].map((index) => this.getStep(workflowId, index))),
    ]);
    const expected = new Map<string, bigint>();
    const add = (address: string, amount: bigint) => {
      if (amount > 0n) expected.set(address.toLowerCase(), (expected.get(address.toLowerCase()) ?? 0n) + amount);
    };
    if (workflow.outcome === "MUTUAL_SETTLEMENT" || workflow.state === "SETTLEMENT_PENDING_FINALITY" || workflow.state === "SETTLED_MUTUAL") {
      const settlement = (await this.getRecovery(workflowId)).settlement;
      if (!settlement) return null;
      add(steps[0].worker, BigInt(settlement.research_amount));
      add(steps[1].worker, BigInt(settlement.writer_amount));
      add(steps[2].worker, BigInt(settlement.publisher_amount));
      add(workflow.buyer, BigInt(settlement.buyer_refund));
    } else {
      for (const step of steps) {
        if (step.state === "PAYOUT_SCHEDULED") add(step.worker, BigInt(step.amount));
      }
      add(workflow.buyer, BigInt(workflow.refund_scheduled));
    }
    if (expected.size === 0) return null;

    const history = await this.client.request({
      method: "sim_getTransactionsForAddress",
      params: [this.contractAddress],
    }) as Array<{ hash?: TransactionHash; to_address?: string; type?: number; status?: string }>;
    const methods = ["accept_workflow", "adjudicate", "cancel_workflow", "execute_mutual_settlement"];
    for (const item of history) {
      if (!item.hash || item.type !== 2 || item.status !== "FINALIZED" || item.to_address?.toLowerCase() !== this.contractAddress.toLowerCase()) continue;
      const parent = await this.client.getTransaction({ hash: item.hash });
      const readable = String((parent.data?.calldata as { readable?: string } | undefined)?.readable ?? "");
      if (!matchesSettlementCall(readable, workflowId, methods)) continue;
      if (!executionSucceeded(parent)) continue;
      const children = await this.getTriggeredReceiptsByHash(item.hash);
      const actual = new Map<string, bigint>();
      for (const child of children) addActual(actual, String(child.to_address ?? ""), BigInt(child.value ?? 0));
      if (sameAllocations(expected, actual)) return { parent, children };
    }
    return null;
  }
}

function addActual(target: Map<string, bigint>, address: string, amount: bigint) {
  const key = address.toLowerCase();
  target.set(key, (target.get(key) ?? 0n) + amount);
}

function sameAllocations(expected: Map<string, bigint>, actual: Map<string, bigint>) {
  return expected.size === actual.size && [...expected].every(([address, amount]) => actual.get(address) === amount);
}

function matchesSettlementCall(readable: string, workflowId: string, methods: readonly string[]) {
  try {
    let decoded: unknown = JSON.parse(readable);
    if (typeof decoded === "string") decoded = JSON.parse(decoded);
    if (!decoded || typeof decoded !== "object") return false;
    const call = decoded as { method?: unknown; args?: unknown };
    return typeof call.method === "string"
      && methods.includes(call.method)
      && Array.isArray(call.args)
      && call.args[0] === workflowId;
  } catch {
    // Studionet currently exposes GenLayer calldata as JSON-like text with a
    // trailing comma and no comma before "method". Parse only the exact first
    // argument and terminal method fields instead of using substring matches.
    const firstArgument = readable.match(/^\{"args":\["((?:\\.|[^"\\])*)"/);
    const method = readable.match(/\]"method":"([^"]+)"\}$/);
    if (!firstArgument || !method || !methods.includes(method[1])) return false;
    try {
      return JSON.parse(`"${firstArgument[1]}"`) === workflowId;
    } catch {
      return false;
    }
  }
}
