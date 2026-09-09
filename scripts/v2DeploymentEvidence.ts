import { normalizeSource, sha256Hex } from "./deploymentEvidence";

export const EXPECTED_FIRSTFAULT_V2_METHODS = [
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
  "retry_adjudication",
  "start_workflow",
  "submit_cure",
  "submit_step",
  "timeout_dispute_to_unresolved",
  "timeout_incomplete_to_unresolved",
  "timeout_review_to_unresolved",
] as const;

export type V2ContractSchemaLike = {
  methods: Record<string, unknown>;
};

export type V2LiveDeploymentEvidence = {
  sourceSha256: string;
  deployedSourceSha256: string;
  expectedMethods: typeof EXPECTED_FIRSTFAULT_V2_METHODS;
};

export function verifyV2SourceAndSchema(
  expectedSource: string,
  deployedSource: string,
  schema: V2ContractSchemaLike,
): V2LiveDeploymentEvidence {
  const sourceSha256 = sha256Hex(normalizeSource(expectedSource));
  const deployedSourceSha256 = sha256Hex(normalizeSource(deployedSource));
  if (sourceSha256 !== deployedSourceSha256) {
    throw new Error("Deployed V2 source mismatch");
  }

  const actualMethods = Object.keys(schema.methods).sort();
  if (
    JSON.stringify(actualMethods) !==
    JSON.stringify(EXPECTED_FIRSTFAULT_V2_METHODS)
  ) {
    throw new Error("Deployed V2 schema mismatch");
  }

  return {
    sourceSha256,
    deployedSourceSha256,
    expectedMethods: EXPECTED_FIRSTFAULT_V2_METHODS,
  };
}
