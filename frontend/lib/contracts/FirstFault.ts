import { createClient } from "genlayer-js";
import { localnet } from "genlayer-js/chains";
import {
  CalldataAddress,
  ExecutionResult,
  TransactionResult,
  TransactionResultNameToNumber,
  TransactionStatus,
  type GenLayerTransaction,
  type FeesDistribution,
  type MessageFeeAllocationInput,
  type TransactionHash,
} from "genlayer-js/types";
import { hexToBytes, type Account, type Address } from "viem";
import { GENLAYER_CHAIN } from "../genlayer/network";
import type { Eip1193Provider } from "../genlayer/providers";

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

export type FirstFaultFeeQuote = {
  functionName: string;
  accountAddress: Address;
  contractAddress: Address;
  chainId: number;
  feeDeposit: bigint;
  userValue: bigint;
  distribution: FeesDistribution;
  messageAllocations?: MessageFeeAllocationInput[];
};

type ContractAccount = Account | Address;
type UnknownRecord = Record<string, unknown>;
type WriteFeeEstimate = {
  distribution: FeesDistribution;
  feeValue: bigint;
  messageAllocations?: MessageFeeAllocationInput[];
};

function asRecord(value: unknown): UnknownRecord | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : undefined;
}

function decodeStudioContractResult(result: unknown): string | undefined {
  if (typeof result !== "string") return undefined;
  try {
    const bytes = Uint8Array.from(atob(result), (character) => character.charCodeAt(0));
    if (bytes.length === 0) return undefined;
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes.slice(1));
  } catch {
    return undefined;
  }
}

function simulationParamsForContractError(
  error: unknown,
  expectedMessage: string,
): UnknownRecord | undefined {
  const cause = asRecord(asRecord(error)?.cause);
  const data = asRecord(cause?.data);
  const receipt = asRecord(data?.receipt);
  if (decodeStudioContractResult(receipt?.result) !== expectedMessage) return undefined;
  return asRecord(data?.params);
}

function studioFeeInteger(value: unknown): bigint {
  if (typeof value === "bigint" && value >= 0n) return value;
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return BigInt(value);
  if (typeof value === "string" && /^(0|[1-9][0-9]*)$/.test(value)) {
    return BigInt(value);
  }
  throw new Error("Studio fee simulation returned no valid recommended preset");
}

function normalizeStudioRecommendedPreset(result: unknown): WriteFeeEstimate {
  const resultRecord = asRecord(result);
  const receipt = asRecord(resultRecord?.receipt ?? resultRecord);
  const preset = asRecord(asRecord(asRecord(receipt?.genvm_result)?.fee_accounting)?.recommended_fee_preset);
  const distribution = asRecord(preset?.distribution);
  if (!preset || !distribution) {
    throw new Error("Studio fee simulation returned no valid recommended preset");
  }
  const messageAllocations = preset.messageAllocations;
  if (messageAllocations !== undefined && !Array.isArray(messageAllocations)) {
    throw new Error("Studio fee simulation returned no valid recommended preset");
  }
  return {
    distribution: {
      leaderTimeunitsAllocation: studioFeeInteger(distribution.leaderTimeunitsAllocation),
      validatorTimeunitsAllocation: studioFeeInteger(distribution.validatorTimeunitsAllocation),
      appealRounds: studioFeeInteger(distribution.appealRounds),
      executionBudgetPerRound: studioFeeInteger(distribution.executionBudgetPerRound),
      executionConsumed: studioFeeInteger(distribution.executionConsumed),
      totalMessageFees: studioFeeInteger(distribution.totalMessageFees),
      rotations: Array.isArray(distribution.rotations)
        ? distribution.rotations.map(studioFeeInteger)
        : (() => { throw new Error("Studio fee simulation returned no valid recommended preset"); })(),
      maxPriceGenPerTimeUnit: studioFeeInteger(distribution.maxPriceGenPerTimeUnit),
      storageFeeMaxGasPrice: studioFeeInteger(distribution.storageFeeMaxGasPrice),
      receiptFeeMaxGasPrice: studioFeeInteger(distribution.receiptFeeMaxGasPrice),
    },
    feeValue: studioFeeInteger(preset.feeValue),
    ...(messageAllocations !== undefined
      ? { messageAllocations: messageAllocations as MessageFeeAllocationInput[] }
      : {}),
  };
}

function asContractAddress(address: Address): CalldataAddress {
  return new CalldataAddress(hexToBytes(address));
}

function parseContractJson<T>(value: unknown): T {
  if (typeof value !== "string") {
    throw new Error("FirstFault returned a non-JSON readback");
  }
  return JSON.parse(value) as T;
}

function hasAffirmativeExecutionEvidence(receipt: GenLayerTransaction): boolean {
  const transactionExecution = receipt.txExecutionResultName as string | undefined;
  const leaderExecution = receipt.consensus_data?.leader_receipt?.[0]?.execution_result;
  // Studio Next's SUCCESS name is compatible with a successful leader receipt.
  if (transactionExecution !== undefined
    && transactionExecution !== ExecutionResult.FINISHED_WITH_RETURN
    && transactionExecution !== "SUCCESS") return false;
  if (leaderExecution !== undefined && leaderExecution !== "SUCCESS") return false;
  return transactionExecution === ExecutionResult.FINISHED_WITH_RETURN || leaderExecution === "SUCCESS";
}

function readbackExecutionSucceeded(receipt: GenLayerTransaction): boolean {
  if (receipt.txExecutionResultName !== undefined
    || receipt.consensus_data?.leader_receipt?.[0]?.execution_result !== undefined) {
    return hasAffirmativeExecutionEvidence(receipt);
  }
  // Majority-only compatibility is restricted to historical reconciliation.
  return receipt.statusName === TransactionStatus.FINALIZED
    && (
      receipt.resultName === TransactionResult.MAJORITY_AGREE
      || receipt.result === Number(TransactionResultNameToNumber.MAJORITY_AGREE)
      || receipt.result === 6 // Historical Studionet encoding retained for evidence readback.
    );
}

function submittedWriteSucceeded(receipt: GenLayerTransaction): boolean {
  const decided = receipt.statusName === TransactionStatus.ACCEPTED
    || receipt.statusName === TransactionStatus.FINALIZED;
  return decided && hasAffirmativeExecutionEvidence(receipt);
}

/** Headless FirstFault contract boundary shared by browser code and Localnet tests. */
export default class FirstFault {
  private client: ReturnType<typeof createClient>;

  constructor(
    private readonly contractAddress: Address,
    private account?: ContractAccount,
    private readonly endpoint?: string,
    private readonly onSubmitted?: (hash: TransactionHash, action: { functionName: string; args: unknown[] }) => void,
    private readonly version: "v1" | "v2" | "v3" = "v1",
    private readonly confirmFee?: (quote: FirstFaultFeeQuote) => Promise<void>,
    private readonly validateBeforeSubmit?: () => Promise<void>,
    private readonly provider?: Eip1193Provider,
  ) {
    this.client = this.makeClient(account);
  }

  private makeClient(account?: ContractAccount) {
    return createClient({
      chain: this.endpoint ? localnet : GENLAYER_CHAIN,
      ...(this.endpoint ? { endpoint: this.endpoint } : {}),
      ...(account ? { account } : {}),
      ...(!this.endpoint && this.provider ? { provider: this.provider } : {}),
    });
  }

  updateAccount(account: ContractAccount): void {
    this.account = account;
    this.client = this.makeClient(account);
  }

  private async estimateWriteFees(
    request: Parameters<ReturnType<typeof createClient>["estimateTransactionFeesForWrite"]>[0],
  ): Promise<WriteFeeEstimate> {
    try {
      return await this.client.estimateTransactionFeesForWrite(request);
    } catch (error) {
      const expectedMessage =
        request.functionName === "prepare_funding"
          ? "Invalid funding intent expiry"
          : request.functionName === "submit_step" || request.functionName === "submit_cure"
            ? "Observation is in the future"
            : undefined;
      if (!expectedMessage) throw error;
      const params = simulationParamsForContractError(error, expectedMessage);
      if (!params) throw error;
      const result = await (this.client as unknown as {
        request(args: { method: string; params: [UnknownRecord] }): Promise<unknown>;
      }).request({
        method: "sim_estimateTransactionFees",
        params: [{
          ...params,
          sim_config: { genvm_datetime: new Date().toISOString() },
        }],
      });
      return normalizeStudioRecommendedPreset(result);
    }
  }

  private async write(functionName: string, args: unknown[], value = 0n) {
    if (!this.account) throw new Error("A connected account is required");
    const request = {
      address: this.contractAddress,
      functionName,
      args: args as never[],
      value,
    };
    const estimate = this.endpoint
      ? undefined
      : await this.estimateWriteFees(request);
    if (estimate && this.confirmFee) {
      const accountAddress = typeof this.account === "string" ? this.account : this.account.address;
      await this.confirmFee({
        functionName,
        accountAddress,
        contractAddress: this.contractAddress,
        chainId: GENLAYER_CHAIN.id,
        feeDeposit: estimate.feeValue,
        userValue: value,
        distribution: estimate.distribution,
        messageAllocations: estimate.messageAllocations,
      });
    }
    await this.validateBeforeSubmit?.();
    const hash = await this.client.writeContract({
      ...request,
      ...(estimate ? {
        fees: {
          distribution: estimate.distribution,
          ...(estimate.messageAllocations
            ? { messageAllocations: estimate.messageAllocations }
            : {}),
          feeValue: estimate.feeValue,
        },
      } : {}),
    });
    this.onSubmitted?.(hash, { functionName, args });
    const receipt = await this.client.waitForTransactionReceipt({
      hash,
      status: TransactionStatus.FINALIZED,
      interval: this.endpoint ? 250 : 5_000,
      retries: this.endpoint ? 600 : 120,
    });
    if (!submittedWriteSucceeded(receipt)) {
      throw new Error(`FirstFault ${functionName} reached a decision without successful execution evidence`);
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
    await this.client.waitForTransactionReceipt({
      hash,
      waitUntil: "finalized",
      interval: this.endpoint ? 250 : 5_000,
      retries: this.endpoint ? 600 : 120,
    });
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
      if (!readbackExecutionSucceeded(parent)) continue;
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
