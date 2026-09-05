import { describe, expect, it } from "vitest";
import type { TransactionHash } from "genlayer-js/types";

import {
  clearReconciliationHash,
  getReconciliationStorage,
  readReconciliationHash,
  writeReconciliationHash,
} from "./reconciliationStorage";

const key = "firstfault:parent:contract:workflow";
const hash = `0x${"a".repeat(64)}` as TransactionHash;

describe("best-effort reconciliation storage", () => {
  it("handles a browser that throws while exposing the localStorage property", () => {
    const browser = Object.defineProperty({}, "localStorage", {
      get: () => { throw new DOMException("blocked", "SecurityError"); },
    });
    expect(getReconciliationStorage(browser)).toBeNull();
  });

  it("never interrupts reconciliation when browser storage is unavailable", () => {
    const blocked = {
      getItem: () => { throw new DOMException("blocked", "SecurityError"); },
      setItem: () => { throw new DOMException("blocked", "QuotaExceededError"); },
      removeItem: () => { throw new DOMException("blocked", "SecurityError"); },
    };
    expect(readReconciliationHash(blocked, key)).toBeNull();
    expect(writeReconciliationHash(blocked, key, hash)).toBe(false);
    expect(() => clearReconciliationHash(blocked, key)).not.toThrow();
  });

  it("round-trips a valid parent hash without accepting malformed data", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (itemKey: string) => values.get(itemKey) ?? null,
      setItem: (itemKey: string, value: string) => { values.set(itemKey, value); },
      removeItem: (itemKey: string) => { values.delete(itemKey); },
    };
    expect(writeReconciliationHash(storage, key, hash)).toBe(true);
    expect(readReconciliationHash(storage, key)).toBe(hash);
    storage.setItem(key, "not-a-hash");
    expect(readReconciliationHash(storage, key)).toBeNull();
    expect(storage.getItem(key)).toBeNull();
  });
});
