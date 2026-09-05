import { createHash } from "node:crypto";

export const EXPECTED_FIRSTFAULT_METHODS = [
  "accept_workflow",
  "adjudicate",
  "approve_mutual_settlement",
  "cancel_workflow",
  "create_workflow",
  "execute_mutual_settlement",
  "fund_workflow",
  "get_accounting",
  "get_recovery",
  "get_step",
  "get_workflow",
  "open_dispute",
  "propose_mutual_settlement",
  "start_workflow",
  "submit_cure",
  "submit_step",
  "timeout_dispute_to_unresolved",
] as const;

export type ContractSchemaLike = {
  methods: Record<string, unknown>;
};

export type LiveDeploymentEvidence = {
  sourceSha256: string;
  deployedSourceSha256: string;
  expectedMethods: typeof EXPECTED_FIRSTFAULT_METHODS;
};

export function normalizeSource(value: string): string {
  return value.replace(/\r\n/g, "\n");
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function assertPrivateKey(
  value: string | undefined,
): asserts value is `0x${string}` {
  if (!value || !/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error(
      "GENLAYER_DEPLOYER_PRIVATE_KEY must be a 0x-prefixed 32-byte key",
    );
  }
}

export function verifySourceAndSchema(
  expectedSource: string,
  deployedSource: string,
  schema: ContractSchemaLike,
): LiveDeploymentEvidence {
  const sourceSha256 = sha256Hex(normalizeSource(expectedSource));
  const deployedSourceSha256 = sha256Hex(normalizeSource(deployedSource));
  if (sourceSha256 !== deployedSourceSha256) {
    throw new Error("Deployed source mismatch");
  }

  const actualMethods = Object.keys(schema.methods).sort();
  if (
    JSON.stringify(actualMethods) !==
    JSON.stringify(EXPECTED_FIRSTFAULT_METHODS)
  ) {
    throw new Error("Deployed schema mismatch");
  }

  return {
    sourceSha256,
    deployedSourceSha256,
    expectedMethods: EXPECTED_FIRSTFAULT_METHODS,
  };
}
