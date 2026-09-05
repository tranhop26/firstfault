import { describe, expect, test, vi } from "vitest";

import {
  EXPECTED_FIRSTFAULT_METHODS,
  assertPrivateKey,
  redactSecrets,
  verifySourceAndSchema,
} from "../../../scripts/deploymentEvidence";
import {
  verifyDeploymentReceipt,
  verifyLiveDeployment,
} from "../../../scripts/verifyDeployment";

const ADDRESS = "0x1111111111111111111111111111111111111111" as const;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const TRANSACTION_HASH = `0x${"a".repeat(64)}` as const;
const OTHER_TRANSACTION_HASH = `0x${"b".repeat(64)}` as const;
const SOURCE = "class FirstFault: pass\n";

function validSchema() {
  return {
    methods: Object.fromEntries(
      EXPECTED_FIRSTFAULT_METHODS.map((name) => [name, { readonly: false }]),
    ),
  };
}

describe("deployment receipt verification", () => {
  test.each([
    [
      {
        statusName: "ACCEPTED",
        txExecutionResultName: "FINISHED_WITH_RETURN",
        to_address: ADDRESS,
      },
      "not finalized",
    ],
    [
      {
        statusName: "FINALIZED",
        txExecutionResultName: "FINISHED_WITH_ERROR",
        to_address: ADDRESS,
      },
      "execution failed",
    ],
    [
      {
        statusName: "FINALIZED",
        txExecutionResultName: "FINISHED_WITH_RETURN",
        to_address: ZERO_ADDRESS,
      },
      "no contract address",
    ],
  ])("rejects an invalid deployment receipt: %s", (receipt, message) => {
    expect(() =>
      verifyDeploymentReceipt({ hash: TRANSACTION_HASH, ...receipt }, TRANSACTION_HASH),
    ).toThrow(message);
  });

  test("returns normalized evidence only for finalized successful execution", () => {
    expect(
      verifyDeploymentReceipt({
        hash: TRANSACTION_HASH,
        statusName: "FINALIZED",
        txExecutionResultName: "FINISHED_WITH_RETURN",
        txDataDecoded: { contractAddress: ADDRESS },
      }, TRANSACTION_HASH),
    ).toEqual({
      contractAddress: ADDRESS,
      executionResult: "FINISHED_WITH_RETURN",
    });
  });

  test("rejects a finalized receipt belonging to another transaction", () => {
    expect(() =>
      verifyDeploymentReceipt({
        hash: OTHER_TRANSACTION_HASH,
        statusName: "FINALIZED",
        txExecutionResultName: "FINISHED_WITH_RETURN",
        to_address: ADDRESS,
      }, TRANSACTION_HASH),
    ).toThrow("transaction hash mismatch");
  });

  test("accepts only a 0x-prefixed 32-byte private key", () => {
    expect(() => assertPrivateKey(undefined)).toThrow("0x-prefixed 32-byte key");
    expect(() => assertPrivateKey("0x12")).toThrow("0x-prefixed 32-byte key");
    expect(() => assertPrivateKey(`0x${"a".repeat(64)}`)).not.toThrow();
  });

  test("redacts private material from deployment errors", () => {
    const privateKey = `0x${"a".repeat(64)}`;
    expect(redactSecrets(`RPC rejected ${privateKey}`, [privateKey])).toBe(
      "RPC rejected [REDACTED]",
    );
    expect(redactSecrets("ordinary failure", [undefined, ""])).toBe(
      "ordinary failure",
    );
  });

  test("rejects a deployed source mismatch", () => {
    expect(() =>
      verifySourceAndSchema(SOURCE, "class Other: pass\n", validSchema()),
    ).toThrow("source mismatch");
  });

  test("normalizes Windows line endings before comparing source", () => {
    const evidence = verifySourceAndSchema(
      "class FirstFault: pass\r\n",
      SOURCE,
      validSchema(),
    );
    expect(evidence.sourceSha256).toBe(evidence.deployedSourceSha256);
  });

  test("rejects missing or additional public methods", () => {
    const missing = validSchema();
    delete missing.methods.adjudicate;
    expect(() => verifySourceAndSchema(SOURCE, SOURCE, missing)).toThrow(
      "schema mismatch",
    );

    const additional = validSchema();
    additional.methods.admin_upgrade = { readonly: false };
    expect(() => verifySourceAndSchema(SOURCE, SOURCE, additional)).toThrow(
      "schema mismatch",
    );
  });

  test("reads source and schema from the exact finalized address", async () => {
    const client = {
      getContractCode: vi.fn().mockResolvedValue(SOURCE),
      getContractSchema: vi.fn().mockResolvedValue(validSchema()),
    };

    const result = await verifyLiveDeployment(client, ADDRESS, SOURCE);

    expect(client.getContractCode).toHaveBeenCalledWith(ADDRESS);
    expect(client.getContractSchema).toHaveBeenCalledWith(ADDRESS);
    expect(result.sourceSha256).toBe(result.deployedSourceSha256);
    expect(result.expectedMethods).toEqual(EXPECTED_FIRSTFAULT_METHODS);
  });
});
