import { describe, expect, it } from "vitest";

import { formatGen, parseGen } from "./amounts";

describe("simulated GEN display units", () => {
  it("converts user-entered GEN to 18-decimal base units", () => {
    expect(parseGen("10")).toBe(10_000_000_000_000_000_000n);
    expect(parseGen("0.000000000000000001")).toBe(1n);
  });

  it("formats base units without silently labeling wei-sized values as whole GEN", () => {
    expect(formatGen("10000000000000000000")).toBe("10");
    expect(formatGen("1")).toBe("0.000000000000000001");
  });
});
