import { formatUnits, parseUnits } from "viem";

export const GEN_DECIMALS = 18;

export function parseGen(value: string): bigint {
  return parseUnits(value.trim(), GEN_DECIMALS);
}

export function formatGen(value: string | bigint): string {
  return formatUnits(BigInt(value), GEN_DECIMALS);
}
