import { describe, expect, test } from "vitest";

import { verifyDeploymentReceipt } from "../../../scripts/verifyDeployment";

describe("deployment receipt verification", () => {
  test("rejects finalized deployment receipts whose execution failed", () => {
    expect(() =>
      verifyDeploymentReceipt({
        statusName: "FINALIZED",
        txExecutionResultName: "FINISHED_WITH_ERROR",
        to_address: "0x1111111111111111111111111111111111111111",
      }),
    ).toThrow("execution failed");
  });

  test("returns the deployed address only for finalized successful execution", () => {
    expect(
      verifyDeploymentReceipt({
        statusName: "FINALIZED",
        txExecutionResultName: "FINISHED_WITH_RETURN",
        to_address: "0x1111111111111111111111111111111111111111",
      }),
    ).toBe("0x1111111111111111111111111111111111111111");
  });
});
