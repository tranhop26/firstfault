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
});
