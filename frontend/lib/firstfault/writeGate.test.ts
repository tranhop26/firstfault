import { describe, expect, it, vi } from "vitest";

import { runExclusiveWrite } from "./writeGate";

describe("Studio Next write gate", () => {
  it("rejects a second write while the first fee/signing flow is active", async () => {
    const gate = { current: false };
    let release!: () => void;
    const first = runExclusiveWrite(gate, () => new Promise<void>((resolve) => { release = resolve; }));

    await expect(runExclusiveWrite(gate, vi.fn(async () => undefined)))
      .rejects.toThrow("already in progress");
    release();
    await first;
    await expect(runExclusiveWrite(gate, async () => "next")).resolves.toBe("next");
  });
});
