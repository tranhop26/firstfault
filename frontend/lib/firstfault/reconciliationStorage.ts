import type { TransactionHash } from "genlayer-js/types";

export type ReconciliationStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type StorageHost = { readonly localStorage?: ReconciliationStorage };

const transactionHashPattern = /^0x[0-9a-f]{64}$/i;

export function getReconciliationStorage(host: object): ReconciliationStorage | null {
  try {
    return (host as StorageHost).localStorage ?? null;
  } catch {
    return null;
  }
}

export function clearReconciliationHash(storage: ReconciliationStorage, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    // Persistence is best-effort and must never change an on-chain outcome.
  }
}

export function readReconciliationHash(
  storage: ReconciliationStorage,
  key: string,
): TransactionHash | null {
  try {
    const value = storage.getItem(key);
    if (!value) return null;
    if (!transactionHashPattern.test(value)) {
      clearReconciliationHash(storage, key);
      return null;
    }
    return value as TransactionHash;
  } catch {
    return null;
  }
}

export function writeReconciliationHash(
  storage: ReconciliationStorage,
  key: string,
  hash: TransactionHash,
): boolean {
  try {
    storage.setItem(key, hash);
    return true;
  } catch {
    return false;
  }
}
