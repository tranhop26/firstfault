import { randomUUID } from "node:crypto";
import { access, link, readFile, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { mkdir } from "node:fs/promises";

import type { FeesDistribution } from "genlayer-js/types";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const HASH = /^0x[0-9a-fA-F]{64}$/;
const COMMIT = /^[0-9a-f]{40}$/;
const DIGEST = /^[0-9a-f]{64}$/;
const FEE_KEYS: Array<keyof FeesDistribution> = [
  "leaderTimeunitsAllocation",
  "validatorTimeunitsAllocation",
  "appealRounds",
  "executionBudgetPerRound",
  "executionConsumed",
  "totalMessageFees",
  "rotations",
  "maxPriceGenPerTimeUnit",
  "storageFeeMaxGasPrice",
  "receiptFeeMaxGasPrice",
];

export type StudioNextPendingDeployment = {
  schemaVersion: 1;
  network: "studio-next";
  chainId: 61997;
  deployerAddress: `0x${string}`;
  sourceCommit: string;
  sourceSha256: string;
  deploymentTransactionHash: `0x${string}`;
  feeDeposit: string;
  feeDistribution: Record<keyof FeesDistribution, string | string[]>;
};

export async function assertStudioNextPendingDeploymentAbsent(path: string) {
  try {
    await access(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  throw new Error("A Studio Next deployment is already pending; resume it instead of deploying again");
}

export function serializeFeeDistribution(distribution: FeesDistribution) {
  return Object.fromEntries(Object.entries(distribution).map(([key, value]) => [
    key,
    Array.isArray(value) ? value.map(String) : String(value),
  ])) as Record<keyof FeesDistribution, string | string[]>;
}

export function deserializeFeeDistribution(
  distribution: Record<keyof FeesDistribution, string | string[]>,
): FeesDistribution {
  for (const key of FEE_KEYS) {
    const value = distribution[key];
    if (value === undefined || (Array.isArray(value) ? value.some((item) => !/^\d+$/.test(item)) : !/^\d+$/.test(value))) {
      throw new Error(`Invalid pending fee distribution field: ${key}`);
    }
  }
  return Object.fromEntries(FEE_KEYS.map((key) => [
    key,
    Array.isArray(distribution[key])
      ? (distribution[key] as string[]).map(BigInt)
      : BigInt(distribution[key] as string),
  ])) as FeesDistribution;
}

export function validateStudioNextPendingDeployment(value: StudioNextPendingDeployment) {
  if (value.schemaVersion !== 1 || value.network !== "studio-next" || value.chainId !== 61997) {
    throw new Error("Invalid Studio Next pending deployment network");
  }
  if (!ADDRESS.test(value.deployerAddress) || /^0x0{40}$/i.test(value.deployerAddress)) {
    throw new Error("Invalid pending deployment wallet");
  }
  if (!COMMIT.test(value.sourceCommit) || !DIGEST.test(value.sourceSha256)) {
    throw new Error("Invalid pending deployment source identity");
  }
  if (!HASH.test(value.deploymentTransactionHash)) {
    throw new Error("Invalid pending deployment transaction hash");
  }
  if (!/^\d+$/.test(value.feeDeposit)) throw new Error("Invalid pending deployment fee deposit");
  deserializeFeeDistribution(value.feeDistribution);
  return value;
}

export async function writeStudioNextPendingDeployment(
  path: string,
  pending: StudioNextPendingDeployment,
) {
  validateStudioNextPendingDeployment(pending);
  await mkdir(dirname(path), { recursive: true });
  await assertStudioNextPendingDeploymentAbsent(path);
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(pending, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    await link(temporaryPath, path);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

export async function readStudioNextPendingDeployment(path: string) {
  const parsed = JSON.parse(await readFile(path, "utf8")) as StudioNextPendingDeployment;
  return validateStudioNextPendingDeployment(parsed);
}

export async function clearStudioNextPendingDeployment(path: string) {
  await rm(path, { force: true });
}
