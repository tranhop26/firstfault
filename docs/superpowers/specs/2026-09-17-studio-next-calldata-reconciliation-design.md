# Studio Next Calldata Reconciliation Design

## Problem

Fresh browsers do not have the locally stored settlement parent hash. They reconstruct settlement proof by scanning the deployed contract's Studio Next transaction history and matching the settlement call to the selected workflow. Studio Next currently decodes the live acceptance calldata as:

```text
{"":"accept_workflow""args":["<workflow-id>","<nonce>",]}
```

The existing fallback parser accepts valid JSON and the older malformed form that begins with `{"args":...}` and ends with `"method":"..."}`. It therefore rejects the current Studio Next representation, returns no settlement evidence, and leaves the production UI without parent or child Explorer links even though all transfers are finalized.

## Scope and decision

Extend the historical reconciliation path in two narrowly bounded places. First, the calldata matcher will recognize these three representations:

1. Valid JSON containing `method` and `args`.
2. The older Studio Next JSON-like `args` followed by `method` representation.
3. The current Studio Next JSON-like unnamed method followed by `args` representation.

Every representation must match both an allow-listed settlement method and the exact first workflow argument. Second, when `genlayer-js` returns no triggered transaction IDs, reconciliation may derive candidate child hashes from the already-fetched contract history by requiring an exact `triggered_by` match to the parent hash. This fallback is used only for historical reconciliation and only when the SDK result is empty.

The implementation must not use a general substring match, must not infer success from UI or local storage, and must keep the existing finalized/execution-success and child-allocation checks unchanged. History-derived candidates pass through the same receipt hydration and validation as SDK-discovered children.

No Intelligent Contract, custody, wallet, fee, state-machine, or deployment-address behavior changes.

## Trust and evidence impact

| Actor | Cannot trust | Manipulation capability | Contract/frontend defense | Test/evidence |
|---|---|---|---|---|
| Fresh-browser viewer | Transaction-history text alone | Select a different workflow identifier appearing later in calldata | Require the exact first decoded argument and an allow-listed method | Regression tests with the live format and a mismatched first argument |
| RPC/history provider | A merely present transaction | Return unrelated, failed, or incomplete history entries | Preserve contract address, type, `FINALIZED`, execution-success, exact `triggered_by`, triggered-child receipt validation, and exact allocation checks | Existing reconciliation tests plus live-chain readback |
| Frontend/local storage | Cached parent hash | Omit or retain stale local proof | Contract history remains the wallet-free source; allocation is compared to contract readback | Fresh-browser production verification |

The GenLayer decision remains the contract's accepted workflow outcome. The consequence remains the three scheduled 10 GEN Studio Next test-value transfers. Evidence binding remains the deployed chain, contract address, workflow ID, settlement method, parent transaction, triggered child transactions, recipients, and values.

## Implementation

Keep the change local to historical reconciliation in `frontend/lib/contracts/FirstFault.ts`. Add the smallest exact parser branch for the current representation. Avoid a broad normalization pass because malformed calldata must fail closed.

Allow the existing child-receipt loader to accept history-derived fallback hashes. Prefer non-empty SDK results; otherwise use candidate hashes whose history records have an exact case-insensitive `triggered_by` match to the selected parent. The existing receipt-level contract origin, parent binding, external-transfer type, positive value, and `FINALIZED` checks remain authoritative.

Add regression tests to `frontend/lib/contracts/FirstFault.test.ts` using the exact live decoded calldata shape and the live SDK behavior where triggered IDs are empty but history contains an exactly parent-bound child. Each test must fail before its production change and pass afterward. Negative cases must prove that a different first workflow argument is rejected even if the target workflow appears elsewhere, and that a history child bound to another parent is not used.

## Verification gates

1. Demonstrate the regression test failing for the missing current-format branch.
2. Apply the minimal parser change and demonstrate the focused test passing.
3. Demonstrate a second regression test failing when triggered IDs are empty despite parent-bound children in history.
4. Apply the bounded history fallback and demonstrate positive and wrong-parent tests passing.
5. Run the complete non-Localnet frontend suite, TypeScript check, and production build.
6. Call `findSettlementEvidence` against the live Studio Next contract and require the known parent plus all three known child hashes.
7. After separately confirmed GitHub/Vercel actions, verify a fresh production browser displays Explorer links for the parent and three payouts.

## Alternatives rejected

- Documentation-only correction would weaken judge-facing proof and leave fresh-browser reconciliation broken.
- Hard-coding the demo transaction hashes would not generalize to other workflows and would make the frontend an authority over evidence.
- Loose substring matching could bind a transaction for a different workflow and is therefore unsafe.

## Completion boundary

The fix is complete only after automated checks and live-chain reconstruction pass. Production readiness additionally requires a confirmed push/merge/deployment and a fresh-browser verification on the deployed site.
