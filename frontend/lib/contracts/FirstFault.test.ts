import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GenLayerTransaction, TransactionHash } from "genlayer-js/types";
import type { Address } from "viem";

const client = vi.hoisted(() => ({
  getTransaction: vi.fn(),
  getTriggeredTransactionIds: vi.fn(),
  waitForTransactionReceipt: vi.fn(),
  estimateTransactionFeesForWrite: vi.fn(),
  writeContract: vi.fn(),
  readContract: vi.fn(),
  request: vi.fn(),
}));
const createClientMock = vi.hoisted(() => vi.fn());

vi.mock("genlayer-js", () => ({ createClient: (config: unknown) => {
  createClientMock(config);
  return client;
} }));

import FirstFault from "./FirstFault";

const contractAddress = "0x0000000000000000000000000000000000000001" as Address;
const parent = { hash: `0x${"1".repeat(64)}` as TransactionHash } as GenLayerTransaction;
const childHash = `0x${"2".repeat(64)}` as TransactionHash;

function mockFundingExpiryRetry(feeValue: unknown, executionBudgetPerRound: unknown, rotations: unknown[]) {
  client.estimateTransactionFeesForWrite.mockRejectedValueOnce({
    cause: { data: {
      params: { type: "write", to: contractAddress, data: "0x1234" },
      receipt: { result: "AUludmFsaWQgZnVuZGluZyBpbnRlbnQgZXhwaXJ5" },
    } },
  });
  client.request.mockResolvedValueOnce({ receipt: {
    execution_result: "SUCCESS",
    genvm_result: { fee_accounting: { recommended_fee_preset: {
      feeValue,
      distribution: {
        leaderTimeunitsAllocation: 11,
        validatorTimeunitsAllocation: 22,
        appealRounds: 0,
        executionBudgetPerRound,
        executionConsumed: 0,
        totalMessageFees: 0,
        rotations,
        maxPriceGenPerTimeUnit: 2,
        storageFeeMaxGasPrice: 300000000,
        receiptFeeMaxGasPrice: 300000000,
      },
    } } },
  } });
}

function mockRecommendedSimulation() {
  client.request.mockResolvedValueOnce({
    receipt: {
      execution_result: "SUCCESS",
      genvm_result: {
        fee_accounting: {
          recommended_fee_preset: {
            distribution: {
              leaderTimeunitsAllocation: 100,
              validatorTimeunitsAllocation: 200,
              appealRounds: 0,
              executionBudgetPerRound: 153459600000000,
              executionConsumed: 0,
              totalMessageFees: 0,
              rotations: [3],
              maxPriceGenPerTimeUnit: 2,
              storageFeeMaxGasPrice: 300000000,
              receiptFeeMaxGasPrice: 300000000,
            },
            feeValue: 613838400010352,
            messageAllocations: [],
          },
        },
      },
    },
  });
}

function mockSinglePayoutWorkflow(workflowId: string, researcher: string) {
  client.readContract.mockResolvedValueOnce(JSON.stringify({
    workflow_id: workflowId,
    buyer: "0x0000000000000000000000000000000000000003",
    state: "DECISION_PENDING_FINALITY",
    outcome: "FIRST_BREACH",
    deposited: "11",
    reserved: "0",
    payout_scheduled: "11",
    refund_scheduled: "0",
    paid: "0",
    refunded: "0",
    verdict: {
      outcome: "FIRST_BREACH",
      first_breach_step: 1,
      step_statuses: [
        { step_index: 0, status: "COMPLIANT" },
        { step_index: 1, status: "MATERIAL_BREACH" },
        { step_index: 2, status: "COMPLIANT" },
      ],
    },
  })).mockResolvedValueOnce(JSON.stringify({
    workflow_id: workflowId,
    step_index: 0,
    worker: researcher,
    amount: "11",
    deadline: "1",
    state: "PAYOUT_SCHEDULED",
    brief: "research",
  })).mockResolvedValueOnce(JSON.stringify({
    workflow_id: workflowId,
    step_index: 1,
    worker: "0x0000000000000000000000000000000000000004",
    amount: "0",
    deadline: "2",
    state: "REFUND_SCHEDULED",
    brief: "write",
  })).mockResolvedValueOnce(JSON.stringify({
    workflow_id: workflowId,
    step_index: 2,
    worker: "0x0000000000000000000000000000000000000005",
    amount: "0",
    deadline: "3",
    state: "PAYOUT_SCHEDULED",
    brief: "publish",
  }));
}

describe("FirstFault triggered transfer finality", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.estimateTransactionFeesForWrite.mockResolvedValue({
      distribution: {
        leaderTimeunitsAllocation: 11n,
        validatorTimeunitsAllocation: 22n,
        executionBudgetPerRound: 33n,
      },
      messageAllocations: [{ budget: 44n }],
      feeValue: 55n,
    });
    client.getTriggeredTransactionIds.mockResolvedValue([childHash]);
    client.writeContract.mockResolvedValue(parent.hash);
    client.waitForTransactionReceipt.mockResolvedValue({
      ...parent,
      statusName: "FINALIZED",
      txExecutionResultName: "FINISHED_WITH_RETURN",
    });
  });

  it("constructs browser writes with the exact selected provider", () => {
    const account = "0x0000000000000000000000000000000000000009" as Address;
    const provider = {
      request: vi.fn(),
      on: vi.fn(),
      removeListener: vi.fn(),
    };

    new FirstFault(
      contractAddress,
      account,
      undefined,
      undefined,
      "v3",
      undefined,
      undefined,
      provider,
    );

    expect(createClientMock).toHaveBeenCalledWith(expect.objectContaining({
      account,
      provider,
    }));
  });

  it("submits the Studio Next fee quote unchanged with every write", async () => {
    const account = "0x0000000000000000000000000000000000000009" as Address;
    const adapter = new FirstFault(contractAddress, account, undefined, undefined, "v3");

    await adapter.startWorkflow("demo-42", "start-now");

    const request = {
      address: contractAddress,
      functionName: "start_workflow",
      args: ["demo-42", "start-now"],
      value: 0n,
    };
    expect(client.estimateTransactionFeesForWrite).toHaveBeenCalledWith(request);
    expect(client.writeContract).toHaveBeenCalledWith({
      ...request,
      fees: {
        distribution: {
          leaderTimeunitsAllocation: 11n,
          validatorTimeunitsAllocation: 22n,
          executionBudgetPerRound: 33n,
        },
        messageAllocations: [{ budget: 44n }],
        feeValue: 55n,
      },
    });
  });

  it("retries the known funding expiry simulation", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-16T15:29:22.506Z"));
    try {
      const account = "0x0000000000000000000000000000000000000009" as Address;
      const originalParams = { type: "write", to: contractAddress, from: account, data: "0x1234" };
      const expirySimulationError = {
        cause: {
          data: {
            params: originalParams,
            receipt: { result: "AUludmFsaWQgZnVuZGluZyBpbnRlbnQgZXhwaXJ5" },
          },
        },
      };
      client.estimateTransactionFeesForWrite.mockRejectedValueOnce(expirySimulationError);
      client.request.mockResolvedValueOnce({
        receipt: {
          execution_result: "SUCCESS",
          genvm_result: {
            fee_accounting: {
              recommended_fee_preset: {
                distribution: {
                  leaderTimeunitsAllocation: 100,
                  validatorTimeunitsAllocation: 200,
                  appealRounds: 0,
                  executionBudgetPerRound: 153459600000000,
                  executionConsumed: 0,
                  totalMessageFees: 0,
                  rotations: [3],
                  maxPriceGenPerTimeUnit: 2,
                  storageFeeMaxGasPrice: 300000000,
                  receiptFeeMaxGasPrice: 300000000,
                },
                feeValue: 613838400010352,
                messageAllocations: [],
              },
            },
          },
        },
      });
      const adapter = new FirstFault(contractAddress, account, undefined, undefined, "v3");

      await adapter.prepareFunding("v3-demo", "intent-1", 2000n, "prepare-1");

      expect(client.request).toHaveBeenCalledWith({
        method: "sim_estimateTransactionFees",
        params: [{
          ...originalParams,
          sim_config: { genvm_datetime: "2026-09-16T15:29:22.506Z" },
        }],
      });
      expect(client.writeContract).toHaveBeenCalledWith(expect.objectContaining({
        fees: expect.objectContaining({
          feeValue: 613838400010352n,
          distribution: expect.objectContaining({
            executionBudgetPerRound: 153459600000000n,
            rotations: [3n],
          }),
        }),
      }));
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    {
      functionName: "submit_step",
      run: async (adapter: FirstFault) => {
        client.readContract.mockResolvedValueOnce(JSON.stringify({
          workflow_id: "v3-demo",
          step_index: 0,
          worker: "0x0000000000000000000000000000000000000009",
          amount: "1",
          deadline: "2000",
          state: "SUBMITTED",
          brief: "research",
          output_hash: "0xabc",
        }));
        await adapter.submitStep("v3-demo", 0, "verified", "", "https://example.com", 1000n, "step-1");
      },
    },
    {
      functionName: "submit_cure",
      run: async (adapter: FirstFault) => {
        await adapter.submitCure("v3-demo", "verified", "https://example.com", 1000n, "cure-1");
      },
    },
  ])("refreshes the GenVM clock for $functionName future-observation simulation", async ({ run }) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-17T00:00:00.000Z"));
    try {
      const account = "0x0000000000000000000000000000000000000009" as Address;
      const originalParams = { type: "write", to: contractAddress, from: account, data: "0x1234" };
      client.estimateTransactionFeesForWrite.mockRejectedValueOnce({
        cause: {
          data: {
            params: originalParams,
            receipt: { result: "AU9ic2VydmF0aW9uIGlzIGluIHRoZSBmdXR1cmU=" },
          },
        },
      });
      mockRecommendedSimulation();
      const adapter = new FirstFault(contractAddress, account, undefined, undefined, "v3");

      await run(adapter);

      expect(client.request).toHaveBeenCalledWith({
        method: "sim_estimateTransactionFees",
        params: [{
          ...originalParams,
          sim_config: { genvm_datetime: "2026-09-17T00:00:00.000Z" },
        }],
      });
      expect(client.writeContract).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
      client.request.mockReset();
      client.readContract.mockReset();
    }
  });

  it("propagates unrelated fee simulation errors without retrying or writing", async () => {
    const account = "0x0000000000000000000000000000000000000009" as Address;
    const error = new Error("Buyer only");
    client.estimateTransactionFeesForWrite.mockRejectedValueOnce(error);
    const adapter = new FirstFault(contractAddress, account, undefined, undefined, "v3");

    await expect(adapter.prepareFunding("v3-demo", "intent-1", 2000n, "prepare-1"))
      .rejects.toBe(error);

    expect(client.request).not.toHaveBeenCalled();
    expect(client.writeContract).not.toHaveBeenCalled();
  });

  it("fails closed when the expiry retry has no recommended preset", async () => {
    const account = "0x0000000000000000000000000000000000000009" as Address;
    const originalParams = { type: "write", to: contractAddress, from: account, data: "0x1234" };
    client.estimateTransactionFeesForWrite.mockRejectedValueOnce({
      cause: {
        data: {
          params: originalParams,
          receipt: { result: "AUludmFsaWQgZnVuZGluZyBpbnRlbnQgZXhwaXJ5" },
        },
      },
    });
    client.request.mockResolvedValueOnce({ receipt: { execution_result: "SUCCESS" } });
    const adapter = new FirstFault(contractAddress, account, undefined, undefined, "v3");

    await expect(adapter.prepareFunding("v3-demo", "intent-1", 2000n, "prepare-1"))
      .rejects.toThrow("Studio fee simulation returned no valid recommended preset");

    expect(client.writeContract).not.toHaveBeenCalled();
  });

  it("does not ask the wallet to sign when fee approval is cancelled", async () => {
    const account = "0x0000000000000000000000000000000000000009" as Address;
    const confirmFee = vi.fn(async () => {
      throw new Error("Transaction cancelled before signing");
    });
    const adapter = new FirstFault(contractAddress, account, undefined, undefined, "v3", confirmFee);

    await expect(adapter.startWorkflow("demo-42", "start-now"))
      .rejects.toThrow("Transaction cancelled before signing");
    expect(confirmFee).toHaveBeenCalledWith(expect.objectContaining({
      functionName: "start_workflow",
      accountAddress: account,
      contractAddress,
      chainId: 61997,
      feeDeposit: 55n,
      userValue: 0n,
    }));
    expect(client.writeContract).not.toHaveBeenCalled();
  });

  describe.each(["feeValue", "executionBudgetPerRound", "rotations"] as const)("invalid recommended preset %s", (field) => {
    it.each([
      ["blank string", ""],
      ["whitespace string", " \t\n"],
      ["negative bigint", -1n],
      ["negative number", -1],
      ["negative string", "-1"],
      ["positive signed string", "+1"],
      ["decimal string", "1.5"],
      ["exponent string", "1e3"],
      ["hexadecimal string", "0x10"],
      ["leading zero string", "01"],
      ["padded decimal string", " 1 "],
      ["decimal string with a trailing newline", "1\n"],
      ["fractional number", 1.5],
      ["unsafe integer", Number.MAX_SAFE_INTEGER + 1],
      ["NaN", NaN],
      ["infinity", Infinity],
      ["boolean", true],
      ["null", null],
      ["undefined", undefined],
      ["object", {}],
      ["array", []],
    ])("rejects %s before any wallet write", async (_label, value) => {
      mockFundingExpiryRetry(
        field === "feeValue" ? value : 55,
        field === "executionBudgetPerRound" ? value : 33,
        field === "rotations" ? [value] : [3],
      );
      const adapter = new FirstFault(contractAddress, "0x0000000000000000000000000000000000000009");

      await expect(adapter.prepareFunding("v3-demo", "intent-1", 2000n, "prepare-1"))
        .rejects.toThrow(/^Studio fee simulation returned no valid recommended preset$/);
      expect(client.writeContract).not.toHaveBeenCalled();
    });
  });

  it.each([
    ["zero bigint", 0n, 0n],
    ["positive bigint", 123n, 123n],
    ["zero number", 0, 0n],
    ["safe integer", Number.MAX_SAFE_INTEGER, 9007199254740991n],
    ["zero string", "0", 0n],
    ["canonical decimal string", "123", 123n],
    ["large decimal string", "9007199254740993", 9007199254740993n],
  ])("accepts recommended preset %s without precision loss", async (_label, value, expected) => {
    mockFundingExpiryRetry(value, value, [value]);
    const adapter = new FirstFault(contractAddress, "0x0000000000000000000000000000000000000009");

    await adapter.prepareFunding("v3-demo", "intent-1", 2000n, "prepare-1");
    expect(client.writeContract).toHaveBeenCalledWith(expect.objectContaining({ fees: expect.objectContaining({
      feeValue: expected,
      distribution: expect.objectContaining({ executionBudgetPerRound: expected, rotations: [expected] }),
    }) }));
  });

  it("revalidates wallet and chain identity after fee approval and before signing", async () => {
    const account = "0x0000000000000000000000000000000000000009" as Address;
    const validateBeforeSubmit = vi.fn(async () => {
      throw new Error("Wallet account changed before signing; review the fee again");
    });
    const adapter = new FirstFault(
      contractAddress,
      account,
      undefined,
      undefined,
      "v3",
      vi.fn(async () => undefined),
      validateBeforeSubmit,
    );

    await expect(adapter.startWorkflow("demo-42", "start-now"))
      .rejects.toThrow("Wallet account changed before signing");
    expect(validateBeforeSubmit).toHaveBeenCalledOnce();
    expect(client.writeContract).not.toHaveBeenCalled();
  });

  it("binds recovery writes to exact cure and settlement proposal versions", async () => {
    const account = "0x0000000000000000000000000000000000000009" as Address;
    const adapter = new FirstFault(contractAddress, account);
    await adapter.submitCure("demo-42", "corrected evidence", "https://example.test/cure", 1700000000n, "cure-nonce");
    await adapter.proposeMutualSettlement("demo-42", [1n, 2n, 3n, 4n], "proposal-nonce");
    await adapter.approveMutualSettlement("demo-42", 7n, "proposal-hash", "approval-nonce");
    await adapter.executeMutualSettlement("demo-42", "execute-nonce");

    expect(client.writeContract.mock.calls.map((call) => call[0].functionName)).toEqual([
      "submit_cure", "propose_mutual_settlement", "approve_mutual_settlement", "execute_mutual_settlement",
    ]);
    expect(client.writeContract.mock.calls[2][0].args).toEqual(["demo-42", 7n, "proposal-hash", "approval-nonce"]);
  });

  it("exposes the transaction hash as soon as submission is accepted", async () => {
    const accepted = vi.fn();
    const account = "0x0000000000000000000000000000000000000009" as Address;
    const adapter = new FirstFault(contractAddress, account, undefined, accepted);
    await adapter.startWorkflow("demo-42", "start-now");
    expect(accepted).toHaveBeenCalledWith(parent.hash, {
      functionName: "start_workflow",
      args: ["demo-42", "start-now"],
    });
    expect(accepted.mock.invocationCallOrder[0]).toBeLessThan(client.waitForTransactionReceipt.mock.invocationCallOrder[0]);
  });

  it("waits for a recovered parent to finalize before reading its authoritative receipt", async () => {
    const adapter = new FirstFault(contractAddress, undefined, "http://127.0.0.1:4000/api");
    await adapter.getTransactionReceipt(parent.hash!);
    expect(client.waitForTransactionReceipt).toHaveBeenCalledWith({
      hash: parent.hash,
      waitUntil: "finalized",
      interval: 250,
      retries: 600,
    });
    expect(client.waitForTransactionReceipt.mock.invocationCallOrder[0])
      .toBeLessThan(client.getTransaction.mock.invocationCallOrder[0]);
  });

  it("waits for every external child transfer to finalize", async () => {
    const finalizedChild = {
      hash: childHash,
      statusName: "FINALIZED",
      type: undefined,
      consensus_data: null,
      triggered_by: parent.hash,
      from_address: contractAddress,
      origin_address: contractAddress,
      to_address: "0x0000000000000000000000000000000000000002",
      value: 11n,
    };
    client.getTransaction.mockResolvedValue(finalizedChild);
    client.waitForTransactionReceipt.mockResolvedValue({
      hash: childHash,
      status: 7,
      type: undefined,
      from_address: contractAddress,
      to_address: finalizedChild.to_address,
      value: 11n,
    });

    const adapter = new FirstFault(contractAddress, undefined, "http://127.0.0.1:4000/api");
    await expect(adapter.getTriggeredReceipts(parent)).resolves.toEqual([{ ...finalizedChild, type: 0 }]);
    expect(client.waitForTransactionReceipt).toHaveBeenCalledWith({
      hash: childHash,
      status: "FINALIZED",
      interval: 250,
      retries: 600,
    });
    expect(client.getTransaction).toHaveBeenCalledWith({ hash: childHash });
  });

  it("rejects a finalized child that is not an external value transfer", async () => {
    const internalChild = { hash: childHash, statusName: "FINALIZED", type: 2 };
    client.getTransaction.mockResolvedValue(internalChild);
    client.waitForTransactionReceipt.mockResolvedValue({ hash: childHash, status: 7 });

    const adapter = new FirstFault(contractAddress, undefined, "http://127.0.0.1:4000/api");
    await expect(adapter.getTriggeredReceipts(parent)).rejects.toThrow("external value transfer");
  });

  it("reconstructs a settlement parent for a fresh browser from contract history", async () => {
    const workflowId = "demo-42";
    const finalizedParent = {
      ...parent,
      statusName: "FINALIZED",
      txExecutionResultName: "FINISHED_WITH_RETURN",
      data: { calldata: { readable: `{"args":["${workflowId}",]"method":"adjudicate"}` } },
    };
    client.request.mockResolvedValue([{ hash: parent.hash, to_address: contractAddress, type: 2, status: "FINALIZED" }]);
    client.getTransaction.mockResolvedValueOnce(finalizedParent).mockResolvedValueOnce({
      hash: childHash, statusName: "FINALIZED", type: 0, consensus_data: null,
      triggered_by: parent.hash, from_address: contractAddress, origin_address: contractAddress,
      to_address: "0x0000000000000000000000000000000000000002", value: 11n,
    });
    client.readContract.mockResolvedValueOnce(JSON.stringify({
      workflow_id: workflowId, buyer: "0x0000000000000000000000000000000000000003",
      state: "DECISION_PENDING_FINALITY", outcome: "FIRST_BREACH", deposited: "11", reserved: "0",
      payout_scheduled: "11", refund_scheduled: "0", paid: "0", refunded: "0",
      verdict: { outcome: "FIRST_BREACH", first_breach_step: 1, step_statuses: [{ step_index: 0, status: "COMPLIANT" }, { step_index: 1, status: "MATERIAL_BREACH" }, { step_index: 2, status: "COMPLIANT" }] },
    })).mockResolvedValueOnce(JSON.stringify({ workflow_id: workflowId, step_index: 0, worker: "0x0000000000000000000000000000000000000002", amount: "11", deadline: "1", state: "PAYOUT_SCHEDULED", brief: "a" }))
      .mockResolvedValueOnce(JSON.stringify({ workflow_id: workflowId, step_index: 1, worker: "0x0000000000000000000000000000000000000004", amount: "0", deadline: "2", state: "REFUND_SCHEDULED", brief: "b" }))
      .mockResolvedValueOnce(JSON.stringify({ workflow_id: workflowId, step_index: 2, worker: "0x0000000000000000000000000000000000000005", amount: "0", deadline: "3", state: "PAYOUT_SCHEDULED", brief: "c" }));

    const adapter = new FirstFault(contractAddress);
    const proof = await adapter.findSettlementEvidence(workflowId);
    expect(proof?.parent.hash).toBe(parent.hash);
    expect(proof?.children).toHaveLength(1);
    expect(client.request).toHaveBeenCalledWith({ method: "sim_getTransactionsForAddress", params: [contractAddress] });
  });

  it.each([
    ["numeric", { result: 6 }],
    ["named", { resultName: "MAJORITY_AGREE" }],
  ])("reconstructs settlement proof from a current Studionet %s majority receipt", async (_case, receiptFields) => {
    const workflowId = "live-dispute-42";
    const researcher = "0x0000000000000000000000000000000000000002";
    const finalizedParent = {
      ...parent,
      statusName: "FINALIZED",
      ...receiptFields,
      consensus_data: {
        validators: [
          { vote: "AGREE", execution_result: "SUCCESS" },
          { vote: "AGREE", execution_result: "SUCCESS" },
          { vote: "AGREE", execution_result: "SUCCESS" },
        ],
      },
      data: { calldata: { readable: JSON.stringify({ args: [workflowId], method: "adjudicate" }) } },
    } as unknown as GenLayerTransaction;
    client.request.mockResolvedValue([{ hash: parent.hash, to_address: contractAddress, type: 2, status: "FINALIZED" }]);
    client.getTransaction.mockResolvedValueOnce(finalizedParent).mockResolvedValueOnce({
      hash: childHash,
      statusName: "FINALIZED",
      type: 0,
      consensus_data: null,
      triggered_by: parent.hash,
      from_address: contractAddress,
      origin_address: contractAddress,
      to_address: researcher,
      value: 11n,
    });
    mockSinglePayoutWorkflow(workflowId, researcher);

    const adapter = new FirstFault(contractAddress);
    const proof = await adapter.findSettlementEvidence(workflowId);

    expect(proof?.parent.hash).toBe(parent.hash);
    expect(proof?.children).toHaveLength(1);
  });

  it.each([
    ["is not finalized", { statusName: "ACCEPTED", result: 6 }],
    ["has no majority", { statusName: "FINALIZED", result: 5 }],
    ["has majority disagreement", { statusName: "FINALIZED", result: 7 }],
    ["has an unknown result", { statusName: "FINALIZED", result: 99 }],
  ])("rejects a current Studionet parent that %s", async (_case, receiptFields) => {
    const workflowId = "rejected-live-dispute-42";
    const researcher = "0x0000000000000000000000000000000000000002";
    client.request.mockResolvedValue([{ hash: parent.hash, to_address: contractAddress, type: 2, status: "FINALIZED" }]);
    client.getTransaction.mockResolvedValue({
      ...parent,
      ...receiptFields,
      consensus_data: { validators: [{ vote: "AGREE", execution_result: "SUCCESS" }] },
      data: { calldata: { readable: JSON.stringify({ args: [workflowId], method: "adjudicate" }) } },
    } as unknown as GenLayerTransaction);
    mockSinglePayoutWorkflow(workflowId, researcher);

    const adapter = new FirstFault(contractAddress);

    await expect(adapter.findSettlementEvidence(workflowId)).resolves.toBeNull();
    expect(client.getTriggeredTransactionIds).not.toHaveBeenCalled();
  });

  it("uses the approved mutual allocation when reconstructing settlement proof", async () => {
    const workflowId = "mutual-42";
    const researcher = "0x0000000000000000000000000000000000000002";
    const buyer = "0x0000000000000000000000000000000000000003";
    const finalizedParent = {
      ...parent,
      statusName: "FINALIZED",
      txExecutionResultName: "FINISHED_WITH_RETURN",
      data: { calldata: { readable: JSON.stringify({ args: [workflowId], method: "execute_mutual_settlement" }) } },
    };
    client.request.mockResolvedValue([{ hash: parent.hash, to_address: contractAddress, type: 2, status: "FINALIZED" }]);
    client.getTransaction.mockResolvedValueOnce(finalizedParent)
      .mockResolvedValueOnce({
        hash: childHash, statusName: "FINALIZED", type: 0, consensus_data: null,
        triggered_by: parent.hash, from_address: contractAddress, origin_address: contractAddress,
        to_address: researcher, value: 4n,
      })
      .mockResolvedValueOnce({
        hash: `0x${"3".repeat(64)}`, statusName: "FINALIZED", type: 0, consensus_data: null,
        triggered_by: parent.hash, from_address: contractAddress, origin_address: contractAddress,
        to_address: buyer, value: 6n,
      });
    client.getTriggeredTransactionIds.mockResolvedValue([childHash, `0x${"3".repeat(64)}`]);
    client.readContract.mockResolvedValueOnce(JSON.stringify({
      workflow_id: workflowId, buyer, state: "SETTLEMENT_PENDING_FINALITY", outcome: "MUTUAL_SETTLEMENT",
      deposited: "10", reserved: "0", payout_scheduled: "4", refund_scheduled: "6", paid: "0", refunded: "0",
    })).mockResolvedValueOnce(JSON.stringify({ workflow_id: workflowId, step_index: 0, worker: researcher, amount: "10", deadline: "1", state: "PAYOUT_SCHEDULED", brief: "a" }))
      .mockResolvedValueOnce(JSON.stringify({ workflow_id: workflowId, step_index: 1, worker: "0x0000000000000000000000000000000000000004", amount: "10", deadline: "2", state: "NO_PAYOUT", brief: "b" }))
      .mockResolvedValueOnce(JSON.stringify({ workflow_id: workflowId, step_index: 2, worker: "0x0000000000000000000000000000000000000005", amount: "10", deadline: "3", state: "NO_PAYOUT", brief: "c" }))
      .mockResolvedValueOnce(JSON.stringify({
        workflow_id: workflowId,
        settlement: { research_amount: "4", writer_amount: "0", publisher_amount: "0", buyer_refund: "6" },
      }));

    const adapter = new FirstFault(contractAddress);
    await expect(adapter.findSettlementEvidence(workflowId)).resolves.toMatchObject({ parent: { hash: parent.hash } });
  });

  it("rejects a history candidate whose exact workflow argument differs", async () => {
    const workflowId = "target-42";
    client.request.mockResolvedValue([{ hash: parent.hash, to_address: contractAddress, type: 2, status: "FINALIZED" }]);
    client.getTransaction.mockResolvedValue({
      ...parent,
      statusName: "FINALIZED",
      txExecutionResultName: "FINISHED_WITH_RETURN",
      data: { calldata: { readable: `{"args":["another-workflow","${workflowId}",]"method":"adjudicate"}` } },
    });
    client.readContract.mockResolvedValueOnce(JSON.stringify({
      workflow_id: workflowId, buyer: "0x0000000000000000000000000000000000000003",
      state: "DECISION_PENDING_FINALITY", outcome: "FIRST_BREACH", deposited: "11", reserved: "0",
      payout_scheduled: "11", refund_scheduled: "0", paid: "0", refunded: "0",
    })).mockResolvedValueOnce(JSON.stringify({ workflow_id: workflowId, step_index: 0, worker: "0x0000000000000000000000000000000000000002", amount: "11", deadline: "1", state: "PAYOUT_SCHEDULED", brief: "a" }))
      .mockResolvedValueOnce(JSON.stringify({ workflow_id: workflowId, step_index: 1, worker: "0x0000000000000000000000000000000000000004", amount: "0", deadline: "2", state: "NO_PAYOUT", brief: "b" }))
      .mockResolvedValueOnce(JSON.stringify({ workflow_id: workflowId, step_index: 2, worker: "0x0000000000000000000000000000000000000005", amount: "0", deadline: "3", state: "NO_PAYOUT", brief: "c" }));

    const adapter = new FirstFault(contractAddress);
    await expect(adapter.findSettlementEvidence(workflowId)).resolves.toBeNull();
    expect(client.getTriggeredTransactionIds).not.toHaveBeenCalled();
  });

  it("sends plain actor strings through the V3 create boundary", async () => {
    const account = "0x0000000000000000000000000000000000000009" as Address;
    const actors = [
      "0x0000000000000000000000000000000000000011",
      "0x0000000000000000000000000000000000000012",
      "0x0000000000000000000000000000000000000013",
      "0x0000000000000000000000000000000000000014",
    ] as const;
    const adapter = new FirstFault(contractAddress, account, undefined, undefined, "v3");

    await adapter.createWorkflow({
      workflowId: "v3-demo",
      orchestrator: actors[0], researcher: actors[1], writer: actors[2], publisher: actors[3],
      researchBrief: "research", writerBrief: "write", publisherBrief: "publish",
      amounts: [1n, 2n, 3n], deadlines: [10n, 20n, 30n], nonce: "create-v3",
    });

    expect(client.writeContract).toHaveBeenCalledWith(expect.objectContaining({
      functionName: "create_workflow",
      args: ["v3-demo", ...actors, "research", "write", "publish", 1n, 2n, 3n, 10n, 20n, 30n, "create-v3"],
    }));
  });

  it("uses prepare, intent readback, and the V3 payable arguments", async () => {
    const account = "0x0000000000000000000000000000000000000009" as Address;
    const adapter = new FirstFault(contractAddress, account, undefined, undefined, "v3");
    client.readContract
      .mockResolvedValueOnce(JSON.stringify({ workflow_id: "v3-demo", intent_id: "intent-1", expected_amount: "6", version: "1" }))
      .mockResolvedValueOnce(JSON.stringify({ attempt_index: "2", result: "FUNDED", retained: "6" }))
      .mockResolvedValueOnce(JSON.stringify({ funding_attempt_count: "2", total_accepted_funding: "6" }));

    await adapter.prepareFunding("v3-demo", "intent-1", 2000n, "prepare-1");
    await adapter.fundPreparedWorkflow("v3-demo", "intent-1", 6n);
    await expect(adapter.getFundingIntent("v3-demo")).resolves.toMatchObject({ version: "1" });
    await expect(adapter.getFundingOutcome(2n)).resolves.toMatchObject({ result: "FUNDED" });
    await expect(adapter.getGlobalAccounting()).resolves.toMatchObject({ total_accepted_funding: "6" });

    expect(client.writeContract.mock.calls[0][0]).toMatchObject({
      functionName: "prepare_funding", args: ["v3-demo", "intent-1", 2000n, "prepare-1"], value: 0n,
    });
    expect(client.writeContract.mock.calls[1][0]).toMatchObject({
      functionName: "fund_workflow", args: ["v3-demo", "intent-1"], value: 6n,
    });
  });

  it("accepts a finalized Studio Next write with SUCCESS execution evidence", async () => {
    const account = "0x0000000000000000000000000000000000000009" as Address;
    client.waitForTransactionReceipt.mockResolvedValueOnce({
      ...parent,
      statusName: "FINALIZED",
      txExecutionResultName: "SUCCESS",
      consensus_data: { leader_receipt: [{ execution_result: "SUCCESS" }] },
    });
    const adapter = new FirstFault(contractAddress, account, undefined, undefined, "v3");

    await expect(adapter.prepareFunding("v3-demo", "intent-1", 2000n, "prepare-1"))
      .resolves.toMatchObject({ statusName: "FINALIZED" });
  });

  it("rejects FINALIZED when GenVM execution failed", async () => {
    const account = "0x0000000000000000000000000000000000000009" as Address;
    client.waitForTransactionReceipt.mockResolvedValue({
      ...parent,
      statusName: "FINALIZED",
      consensus_data: { leader_receipt: [{ execution_result: "ERROR" }] },
    });
    const adapter = new FirstFault(contractAddress, account, undefined, undefined, "v3");

    await expect(adapter.prepareFunding("v3-demo", "intent-1", 2000n, "prepare-1"))
      .rejects.toThrow("without successful execution evidence");
  });

  it.each([
    ["transaction error despite leader success", {
      txExecutionResultName: "FINISHED_WITH_ERROR",
      consensus_data: { leader_receipt: [{ execution_result: "SUCCESS" }] },
    }],
    ["unknown transaction result despite leader success", {
      txExecutionResultName: "UNKNOWN",
      consensus_data: { leader_receipt: [{ execution_result: "SUCCESS" }] },
    }],
    ["leader error despite transaction return", {
      txExecutionResultName: "FINISHED_WITH_RETURN",
      consensus_data: { leader_receipt: [{ execution_result: "ERROR" }] },
    }],
    ["majority alone without execution evidence", { resultName: "MAJORITY_AGREE" }],
    ["historical numeric majority alone", { result: 6 }],
  ])("rejects a submitted write with %s", async (_label, evidence) => {
    client.waitForTransactionReceipt.mockResolvedValueOnce({ ...parent, statusName: "FINALIZED", ...evidence });
    const adapter = new FirstFault(contractAddress, "0x0000000000000000000000000000000000000009");

    await expect(adapter.prepareFunding("v3-demo", "intent-1", 2000n, "prepare-1"))
      .rejects.toThrow("without successful execution evidence");
  });

  it("accepts a submitted write with leader success and no transaction execution field", async () => {
    client.waitForTransactionReceipt.mockResolvedValueOnce({
      ...parent, statusName: "FINALIZED",
      consensus_data: { leader_receipt: [{ execution_result: "SUCCESS" }] },
    });
    const adapter = new FirstFault(contractAddress, "0x0000000000000000000000000000000000000009");

    await expect(adapter.prepareFunding("v3-demo", "intent-1", 2000n, "prepare-1"))
      .resolves.toMatchObject({ statusName: "FINALIZED" });
  });
});
