# Studionet execution readback compatibility design

## Goal

Restore finalized settlement proof in the frontend for current Studionet transaction receipts without weakening the existing proof checks. The verified V3 dispute workflow finalized its adjudication and all three child transfers, but the browser still reports `Transfer proof unavailable` because its success adapter recognizes only older receipt shapes.

This change affects frontend receipt interpretation only. It does not change, redeploy, or migrate the FirstFault V3 Intelligent Contract.

## Observed production failure

The adjudication transaction for workflow `firstfault-v3-writer-breach-20260910-1` is finalized on Studionet:

- Parent transaction: `0xd3fecdeafbb30c7382a32dced6f8eab2438aa90e4eba25565cc24047def4f512`
- Current receipt shape: `statusName` is `FINALIZED`, raw `result` is `6`, and `consensus_data.validators` records the validator executions.
- The SDK maps transaction result `6` to `MAJORITY_AGREE`.
- The receipt does not expose `txExecutionResultName` or the legacy `consensus_data.leader_receipt[0].execution_result` field.

`executionSucceeded` currently checks only `txExecutionResultName === FINISHED_WITH_RETURN` or the legacy leader receipt value `SUCCESS`. It therefore rejects this valid parent before `findSettlementEvidence` evaluates the exact child transfers.

The three triggered transfers were independently verified as finalized and value-credited:

- 1 GEN to Researcher `0x21b45103dd05c43969daF3CbB4277391777e2eC7`
- 1 GEN to Publisher `0x35C9979d30992b13EF6dF7036bC745E2e1cD76a2`
- 1 GEN buyer refund to `0x21b45103dd05c43969daF3CbB4277391777e2eC7`

## Selected approach

Extend the shared receipt-success normalization with one current Studionet path. A receipt is successful when an existing supported execution field reports success, or when the receipt is finalized and its transaction result maps to `MAJORITY_AGREE`.

The implementation will prefer the SDK's transaction-result representation where its public types support it. A narrow compatibility check may normalize the runtime numeric or named value because the live API currently returns the numeric result even when the TypeScript surface does not expose the corresponding name.

`findSettlementEvidence` will keep all of its existing parent and child validation:

- The parent must be finalized, addressed to the configured contract, and be an adjudication transaction for the exact workflow.
- The parent must pass the normalized execution-success check.
- Every required child must be finalized and value-credited.
- Child recipients and values must exactly match the on-chain settlement allocation.
- Extra, missing, duplicated, pending, failed, or mismatched transfers must not produce settlement proof.

## Safety boundaries

Finalization alone is insufficient. The new path must reject unfinalized transactions and finalized results representing `NO_MAJORITY`, `MAJORITY_DISAGREE`, execution failure, validator disagreement, or unknown values.

The fallback applies only to transaction-level consensus success. It does not infer child success, alter scheduled accounting, relax calldata matching, or synthesize transfer evidence. The UI can report finalized transfers only after the existing exact-allocation checks pass.

## Test strategy

Add a regression test based on the live current Studionet receipt shape:

- Parent has `statusName: FINALIZED` and raw result `6`, with neither `txExecutionResultName` nor legacy `leader_receipt`.
- Parent calldata identifies the exact workflow and `adjudicate` method.
- Child receipts are finalized and exactly match the expected recipients and amounts.
- `findSettlementEvidence` must return the parent and children.

Add negative coverage for an unfinalized parent and for finalized non-success consensus results. Existing tests for legacy receipts, calldata matching, child allocation, and missing transfer proof must continue to pass.

Verification requires the targeted adapter tests, the full non-Localnet test suite, lint, and production build. After a preview deployment, the live workflow must show finalized transfer proof in a browser without initiating a wallet transaction.

## Delivery and evidence

The code change and tests will be committed on `fix/studionet-execution-readback`. A GitHub push and PR require a separate confirmation after the exact account, remote, branch, commit, and base are shown. Production deployment remains a separate confirmation gate.

After browser verification, record a machine-readable dispute evidence manifest containing the workflow, verdict, parent transaction, and exact child-transfer hashes. Evidence must describe observed chain state and must not claim a deployment or transfer that was not independently verified.
