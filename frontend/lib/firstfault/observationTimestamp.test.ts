import { describe, expect, it } from "vitest";

import { observationTimestamp } from "./observationTimestamp";

describe("observationTimestamp", () => {
  it("stays 60 seconds behind the supplied wall clock", () => {
    expect(observationTimestamp(1_000_000)).toBe(940n);
  });

  it("never returns a negative timestamp", () => {
    expect(observationTimestamp(59_000)).toBe(0n);
  });
});
