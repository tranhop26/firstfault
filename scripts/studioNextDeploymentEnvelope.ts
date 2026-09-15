import { decodeFunctionData, getAddress, zeroAddress } from "viem";
import type { FeesDistribution } from "genlayer-js/types";

const feeComponents = [
  { name: "leaderTimeunitsAllocation", type: "uint256" },
  { name: "validatorTimeunitsAllocation", type: "uint256" },
  { name: "appealRounds", type: "uint256" },
  { name: "executionBudgetPerRound", type: "uint256" },
  { name: "executionConsumed", type: "uint256" },
  { name: "totalMessageFees", type: "uint256" },
  { name: "rotations", type: "uint256[]" },
  { name: "maxPriceGenPerTimeUnit", type: "uint256" },
  { name: "storageFeeMaxGasPrice", type: "uint256" },
  { name: "receiptFeeMaxGasPrice", type: "uint256" },
] as const;

const messageComponents = [
  { name: "messageType", type: "uint8" },
  { name: "onAcceptance", type: "bool" },
  { name: "parentIndex", type: "uint256" },
  { name: "recipient", type: "address" },
  { name: "callKey", type: "bytes32" },
  { name: "budget", type: "uint256" },
  { name: "feeParams", type: "bytes" },
] as const;

export const studioNextAddTransactionAbi = [{
  type: "function",
  name: "addTransaction",
  stateMutability: "payable",
  inputs: [{
    name: "_params",
    type: "tuple",
    components: [
      { name: "sender", type: "address" },
      { name: "recipient", type: "address" },
      { name: "numOfInitialValidators", type: "uint256" },
      { name: "maxRotations", type: "uint256" },
      { name: "validUntil", type: "uint256" },
      { name: "saltNonce", type: "uint256" },
      { name: "userValue", type: "uint256" },
      { name: "feesDistribution", type: "tuple", components: feeComponents },
      { name: "txCalldata", type: "bytes" },
      { name: "messageAllocations", type: "tuple[]", components: messageComponents },
    ],
  }],
  outputs: [],
}] as const;

export type StudioNextRawTransaction = {
  hash?: `0x${string}`;
  from?: `0x${string}`;
  to?: `0x${string}`;
  input?: `0x${string}`;
  value?: `0x${string}`;
};

export type SubmittedDeploymentEnvelope = {
  deployerAddress: `0x${string}`;
  feeValue: bigint;
  distribution: FeesDistribution;
};

export function decodeStudioNextDeploymentEnvelope(
  raw: StudioNextRawTransaction | null,
  expectedHash: `0x${string}`,
  expectedDeployer: `0x${string}`,
  expectedConsensusContract: `0x${string}`,
): SubmittedDeploymentEnvelope {
  if (!raw || raw.hash?.toLowerCase() !== expectedHash.toLowerCase()) {
    throw new Error("Studio Next deployment envelope hash mismatch");
  }
  if (!raw.from || getAddress(raw.from) !== getAddress(expectedDeployer)) {
    throw new Error("Studio Next deployment envelope wallet mismatch");
  }
  if (!raw.to || getAddress(raw.to) !== getAddress(expectedConsensusContract)) {
    throw new Error("Studio Next deployment envelope consensus contract mismatch");
  }
  if (!raw.input || !raw.value) throw new Error("Studio Next deployment envelope is incomplete");
  const decoded = decodeFunctionData({ abi: studioNextAddTransactionAbi, data: raw.input });
  if (decoded.functionName !== "addTransaction") throw new Error("Studio Next envelope is not a deployment transaction");
  const params = decoded.args[0];
  if (getAddress(params.sender) !== getAddress(expectedDeployer) || getAddress(params.recipient) !== getAddress(zeroAddress)) {
    throw new Error("Studio Next deployment envelope parameters mismatch");
  }
  if (params.userValue !== 0n || params.messageAllocations.length !== 0) {
    throw new Error("Studio Next deployment envelope carries unexpected value or messages");
  }
  return {
    deployerAddress: getAddress(params.sender),
    feeValue: BigInt(raw.value),
    distribution: {
      ...params.feesDistribution,
      rotations: [...params.feesDistribution.rotations],
    },
  };
}
