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
  from_address?: `0x${string}`;
  to_address?: `0x${string}`;
  type?: number;
  data?: {
    contract_code?: string;
    contract_address?: `0x${string}`;
    user_value?: number | string;
    message_allocations_count?: number | string;
    fee_value?: number | string;
    fees_distribution?: Record<string, unknown>;
  };
  fees?: {
    deposit?: number | string;
    userValue?: number | string;
  };
};

export type SubmittedDeploymentEnvelope = {
  deployerAddress: `0x${string}`;
  feeValue: bigint;
  distribution: FeesDistribution;
};

function protocolBigInt(value: unknown, label: string): bigint {
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "bigint") {
    throw new Error(`Studio Next ${label} is missing`);
  }
  try {
    const result = BigInt(value);
    if (result < 0n) throw new Error("negative");
    return result;
  } catch {
    throw new Error(`Studio Next ${label} is invalid`);
  }
}

function decodeStudioProjection(
  raw: StudioNextRawTransaction,
  expectedDeployer: `0x${string}`,
): SubmittedDeploymentEnvelope | undefined {
  if (!raw.from_address && !raw.data?.fees_distribution) return undefined;
  if (!raw.from_address || getAddress(raw.from_address) !== getAddress(expectedDeployer)) {
    throw new Error("Studio Next deployment envelope wallet mismatch");
  }
  if (raw.type !== 1 || !raw.to_address || getAddress(raw.to_address) === getAddress(zeroAddress)) {
    throw new Error("Studio Next projection is not a deployment transaction");
  }
  const data = raw.data;
  if (
    !data?.contract_code
    || !data.contract_address
    || getAddress(data.contract_address) !== getAddress(raw.to_address)
    || protocolBigInt(data.user_value, "user value") !== 0n
    || protocolBigInt(data.message_allocations_count, "message allocation count") !== 0n
  ) {
    throw new Error("Studio Next projection has invalid deployment data");
  }
  const feeValue = protocolBigInt(raw.fees?.deposit, "fee deposit");
  if (
    feeValue !== protocolBigInt(data.fee_value, "data fee value")
    || protocolBigInt(raw.fees?.userValue, "fee user value") !== 0n
  ) {
    throw new Error("Studio Next projection fee deposit mismatch");
  }
  const fees = data.fees_distribution;
  if (!fees || !Array.isArray(fees.rotations)) {
    throw new Error("Studio Next projection fee distribution is missing");
  }
  return {
    deployerAddress: getAddress(raw.from_address),
    feeValue,
    distribution: {
      leaderTimeunitsAllocation: protocolBigInt(fees.leaderTimeunitsAllocation, "leader allocation"),
      validatorTimeunitsAllocation: protocolBigInt(fees.validatorTimeunitsAllocation, "validator allocation"),
      appealRounds: protocolBigInt(fees.appealRounds, "appeal rounds"),
      executionBudgetPerRound: protocolBigInt(fees.executionBudgetPerRound, "execution budget"),
      executionConsumed: protocolBigInt(fees.executionConsumed, "execution consumed"),
      totalMessageFees: protocolBigInt(fees.totalMessageFees, "message fees"),
      rotations: fees.rotations.map((value) => protocolBigInt(value, "rotation")),
      maxPriceGenPerTimeUnit: protocolBigInt(fees.maxPriceGenPerTimeUnit, "maximum time-unit price"),
      storageFeeMaxGasPrice: protocolBigInt(fees.storageFeeMaxGasPrice, "storage gas price"),
      receiptFeeMaxGasPrice: protocolBigInt(fees.receiptFeeMaxGasPrice, "receipt gas price"),
    },
  };
}

export function decodeStudioNextDeploymentEnvelope(
  raw: StudioNextRawTransaction | null,
  expectedHash: `0x${string}`,
  expectedDeployer: `0x${string}`,
  expectedConsensusContract: `0x${string}`,
): SubmittedDeploymentEnvelope {
  if (!raw || raw.hash?.toLowerCase() !== expectedHash.toLowerCase()) {
    throw new Error("Studio Next deployment envelope hash mismatch");
  }
  const studioProjection = decodeStudioProjection(raw, expectedDeployer);
  if (studioProjection) return studioProjection;
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
