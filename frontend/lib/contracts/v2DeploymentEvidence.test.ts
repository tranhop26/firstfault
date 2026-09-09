import { describe, expect, test } from "vitest";

import {
  EXPECTED_FIRSTFAULT_V2_METHODS,
  verifyV2SourceAndSchema,
} from "../../../scripts/v2DeploymentEvidence";

const SOURCE = "class FirstFault: pass\n";
const SOURCE_SHA256 =
  "c84157b0dcaef7796b5d1702624951fad19fb78fba39d4bbfd2e41139f0bc94c";
const EXPECTED_METHODS = [
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

function validSchema() {
  return {
    methods: Object.fromEntries(
      EXPECTED_METHODS.map((name) => [name, { readonly: false }]),
    ),
  };
}

describe("FirstFault V2 deployment evidence", () => {
  test("accepts equal normalized source and exactly the 20 V2 methods", () => {
    const evidence = verifyV2SourceAndSchema(
      "class FirstFault: pass\r\n",
      SOURCE,
      validSchema(),
    );

    expect(evidence).toEqual({
      sourceSha256: SOURCE_SHA256,
      deployedSourceSha256: SOURCE_SHA256,
      expectedMethods: EXPECTED_METHODS,
    });
    expect(EXPECTED_FIRSTFAULT_V2_METHODS).toEqual(EXPECTED_METHODS);
  });

  test("rejects deployed source that differs from the reviewed V2 source", () => {
    expect(() =>
      verifyV2SourceAndSchema(SOURCE, "class Other: pass\n", validSchema()),
    ).toThrow("Deployed V2 source mismatch");
  });

  test("rejects a V2 schema with a missing public method", () => {
    const schema = validSchema();
    delete schema.methods.timeout_review_to_unresolved;

    expect(() => verifyV2SourceAndSchema(SOURCE, SOURCE, schema)).toThrow(
      "Deployed V2 schema mismatch",
    );
  });

  test("rejects a V2 schema with an additional privileged method", () => {
    const schema = validSchema();
    schema.methods.admin_upgrade = { readonly: false };

    expect(() => verifyV2SourceAndSchema(SOURCE, SOURCE, schema)).toThrow(
      "Deployed V2 schema mismatch",
    );
  });
});
