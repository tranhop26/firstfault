import { describe, expect, it } from "vitest";
import { encodeFunctionData, zeroAddress } from "viem";

import {
  decodeStudioNextDeploymentEnvelope,
  studioNextAddTransactionAbi,
  type StudioNextRawTransaction,
} from "../../../scripts/studioNextDeploymentEnvelope";

const TX = `0x${"1".repeat(64)}` as `0x${string}`;
const DEPLOYER = `0x${"2".repeat(40)}` as `0x${string}`;
const CONSENSUS = `0x${"3".repeat(40)}` as `0x${string}`;
const distribution = {
  leaderTimeunitsAllocation: 11n,
  validatorTimeunitsAllocation: 22n,
  appealRounds: 1n,
  executionBudgetPerRound: 33n,
  executionConsumed: 0n,
  totalMessageFees: 0n,
  rotations: [0n, 0n],
  maxPriceGenPerTimeUnit: 44n,
  storageFeeMaxGasPrice: 55n,
  receiptFeeMaxGasPrice: 66n,
};

function raw(value = 77n) {
  return {
    hash: TX,
    from: DEPLOYER,
    to: CONSENSUS,
    value: `0x${value.toString(16)}` as `0x${string}`,
    input: encodeFunctionData({
      abi: studioNextAddTransactionAbi,
      functionName: "addTransaction",
      args: [{
        sender: DEPLOYER,
        recipient: zeroAddress,
        numOfInitialValidators: 5n,
        maxRotations: 2n,
        validUntil: 999n,
        saltNonce: 0n,
        userValue: 0n,
        feesDistribution: distribution,
        txCalldata: "0x1234",
        messageAllocations: [],
      }],
    }),
  };
}

describe("Studio Next submitted deployment envelope", () => {
  it("recovers the fee quote from the signed on-chain transaction", () => {
    expect(decodeStudioNextDeploymentEnvelope(raw(), TX, DEPLOYER, CONSENSUS)).toEqual({
      deployerAddress: DEPLOYER,
      feeValue: 77n,
      distribution,
    });
  });

  it("recovers the fee quote from Studio Next's finalized transaction projection", () => {
    const studioTransaction = {
      hash: TX,
      from_address: DEPLOYER,
      to_address: `0x${"4".repeat(40)}`,
      type: 1,
      data: {
        contract_code: "IyB7ICJEZXBlbmRzIjogInB5LWdlbmxheWVyOnRlc3QiIH0=",
        contract_address: `0x${"4".repeat(40)}`,
        user_value: 0,
        message_allocations_count: 0,
        fee_value: "77",
        fees_distribution: Object.fromEntries(
          Object.entries(distribution).map(([key, value]) => [
            key,
            Array.isArray(value)
              ? value.map((item) => item.toString())
              : value.toString(),
          ]),
        ),
      },
      fees: {
        deposit: "77",
        userValue: "0",
      },
    } as unknown as StudioNextRawTransaction;

    expect(
      decodeStudioNextDeploymentEnvelope(studioTransaction, TX, DEPLOYER, CONSENSUS),
    ).toEqual({
      deployerAddress: DEPLOYER,
      feeValue: 77n,
      distribution,
    });
  });

  it("rejects a transaction sent to another consensus contract", () => {
    expect(() => decodeStudioNextDeploymentEnvelope(
      { ...raw(), to: `0x${"4".repeat(40)}` }, TX, DEPLOYER, CONSENSUS,
    )).toThrow("consensus contract mismatch");
  });
});
