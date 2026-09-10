import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GenLayerTransaction, TransactionHash } from "genlayer-js/types";
import type { Address } from "viem";

const client = vi.hoisted(() => ({
  getTransaction: vi.fn(),
  getTriggeredTransactionIds: vi.fn(),
  waitForTransactionReceipt: vi.fn(),
  writeContract: vi.fn(),
  readContract: vi.fn(),
  request: vi.fn(),
}));

vi.mock("genlayer-js", () => ({ createClient: () => client }));

import FirstFault from "./FirstFault";

const contractAddress = "0x0000000000000000000000000000000000000001" as Address;
const parent = { hash: `0x${"1".repeat(64)}` as TransactionHash } as GenLayerTransaction;
const childHash = `0x${"2".repeat(64)}` as TransactionHash;

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
    client.getTriggeredTransactionIds.mockResolvedValue([childHash]);
    client.writeContract.mockResolvedValue(parent.hash);
    client.waitForTransactionReceipt.mockResolvedValue({
      ...parent,
      statusName: "FINALIZED",
      txExecutionResultName: "FINISHED_WITH_RETURN",
    });
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
    expect(accepted).toHaveBeenCalledWith(parent.hash);
    expect(accepted.mock.invocationCallOrder[0]).toBeLessThan(client.waitForTransactionReceipt.mock.invocationCallOrder[0]);
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

  it("rejects FINALIZED when GenVM execution failed", async () => {
    const account = "0x0000000000000000000000000000000000000009" as Address;
    client.waitForTransactionReceipt.mockResolvedValue({
      ...parent,
      statusName: "FINALIZED",
      consensus_data: { leader_receipt: [{ execution_result: "ERROR" }] },
    });
    const adapter = new FirstFault(contractAddress, account, undefined, undefined, "v3");

    await expect(adapter.prepareFunding("v3-demo", "intent-1", 2000n, "prepare-1"))
      .rejects.toThrow("finalized with failed execution");
  });
});
