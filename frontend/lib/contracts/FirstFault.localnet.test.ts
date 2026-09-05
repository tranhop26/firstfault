import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { createAccount, createClient } from "genlayer-js";
import { localnet } from "genlayer-js/chains";
import { TransactionStatus, type Hash } from "genlayer-js/types";

import FirstFault from "./FirstFault";

const endpoint = process.env.GENLAYER_LOCALNET_URL ?? "http://127.0.0.1:4000/api";

describe("FirstFault browser adapter against Localnet", () => {
  test("separate funded accounts settle external transfers through the real adapter", async () => {
    const buyer = createAccount();
    const orchestrator = createAccount();
    const researcher = createAccount();
    const writer = createAccount();
    const publisher = createAccount();
    const admin = createClient({ chain: localnet, endpoint });
    for (const account of [buyer, orchestrator, researcher, writer, publisher]) {
      await admin.request({ method: "sim_fundAccount", params: [account.address, 1_000_000] });
    }

    const code = await readFile(resolve(process.cwd(), "../contracts/firstfault.py"), "utf8");
    const deployClient = createClient({ chain: localnet, endpoint, account: buyer });
    const deployHash = await deployClient.deployContract({ code, account: buyer });
    await deployClient.waitForTransactionReceipt({
      hash: deployHash as Hash,
      status: TransactionStatus.FINALIZED,
      interval: 250,
      retries: 600,
    });
    const deployReceipt = await deployClient.getTransaction({ hash: deployHash as Hash });
    expect(deployReceipt.statusName).toBe("FINALIZED");
    expect(deployReceipt.consensus_data?.leader_receipt?.[0]?.execution_result).toBe("SUCCESS");

    const contractAddress = deployReceipt.to_address as `0x${string}`;
    const adapter = new FirstFault(contractAddress, buyer, endpoint);
    const balance = async (address: `0x${string}`) => {
      const raw = await admin.request({ method: "eth_getBalance", params: [address, "latest"] });
      return BigInt(String(raw));
    };
    const now = Math.floor(Date.now() / 1000);
    const id = `ts-${Date.now()}`;

    await adapter.createWorkflow({
      workflowId: id,
      orchestrator: orchestrator.address,
      researcher: researcher.address,
      writer: writer.address,
      publisher: publisher.address,
      researchBrief: "Find verifiable primary sources.",
      writerBrief: "Write only claims supported by research.",
      publisherBrief: "Format without changing claims.",
      amounts: [11n, 17n, 23n],
      deadlines: [BigInt(now + 3600), BigInt(now + 7200), BigInt(now + 10800)],
      nonce: `${id}-create`,
    });
    await adapter.fundWorkflow(id, `${id}-fund`, 51n);
    adapter.updateAccount(orchestrator);
    await adapter.startWorkflow(id, `${id}-start`);
    adapter.updateAccount(researcher);
    const research = await adapter.submitStep(id, 0, "Verified source.", "", "https://evidence.example/research/ts", BigInt(now), `${id}-research`);
    adapter.updateAccount(writer);
    const writerStep = await adapter.submitStep(id, 1, "Supported draft.", research.outputHash, "", BigInt(now), `${id}-writer`);
    adapter.updateAccount(publisher);
    await adapter.submitStep(id, 2, "Supported draft.", writerStep.outputHash, "", BigInt(now), `${id}-publisher`);

    expect((await adapter.getWorkflow(id)).state).toBe("READY_FOR_REVIEW");

    const workerBalancesBefore = await Promise.all(
      [researcher.address, writer.address, publisher.address].map(balance),
    );
    expect(await balance(contractAddress)).toBe(51n);
    adapter.updateAccount(buyer);
    const parent = await adapter.acceptWorkflow(id, `${id}-accept`);
    const transfers = await adapter.getTriggeredReceipts(parent);
    expect(transfers).toHaveLength(3);
    expect(transfers.every((transfer) => transfer.statusName === "FINALIZED" && transfer.type === 0)).toBe(true);
    expect(transfers.every((transfer) => transfer.from_address?.toLowerCase() === contractAddress.toLowerCase())).toBe(true);
    expect(new Set(transfers.map((transfer) => `${transfer.to_address?.toLowerCase()}:${transfer.value}`))).toEqual(
      new Set([
        `${researcher.address.toLowerCase()}:11`,
        `${writer.address.toLowerCase()}:17`,
        `${publisher.address.toLowerCase()}:23`,
      ]),
    );
    const workerBalancesAfter = await Promise.all(
      [researcher.address, writer.address, publisher.address].map(balance),
    );
    expect(workerBalancesAfter.map((after, index) => after - workerBalancesBefore[index])).toEqual([11n, 17n, 23n]);
    expect(await balance(contractAddress)).toBe(0n);
    expect((await adapter.getWorkflow(id)).state).toBe("ACCEPTED_PENDING_FINALITY");
  }, 1_200_000);
});
