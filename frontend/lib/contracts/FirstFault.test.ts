import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GenLayerTransaction, TransactionHash } from "genlayer-js/types";
import type { Address } from "viem";

const client = vi.hoisted(() => ({
  getTransaction: vi.fn(),
  getTriggeredTransactionIds: vi.fn(),
  waitForTransactionReceipt: vi.fn(),
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
});
