# GenVM Observation Timestamp Safety Design

## Problem

FirstFault currently passes the browser wall clock directly as `observed_at` for `submit_step` and `submit_cure`. Studio Next fee simulation can evaluate the transaction with a slightly earlier GenVM timestamp, causing the contract to reject otherwise current evidence with `Observation is in the future` before the wallet can sign.

## Scope

Change only the frontend timestamp construction used by evidence and cure submissions. Do not change the frozen Intelligent Contract, deployment address, workflow data, custody behavior, or fee-confirmation flow.

## Design

Introduce a small pure helper that returns the current Unix timestamp minus a fixed 60-second safety margin. Use the helper for both `submitStep` and `submitCure` so the two evidence paths cannot drift apart.

The contract accepts observations up to 3,600 seconds old, so a 60-second margin remains well within the freshness window while avoiding normal clock skew. Clamp the result to zero for deterministic behavior with an injected or anomalous clock.

Studio Next can simulate against a contract-state clock that is much older than normal network skew. When fee estimation for `submit_step` or `submit_cure` decodes exactly to `Observation is in the future`, reuse the existing `prepare_funding` simulation-clock recovery pattern: retry `sim_estimateTransactionFees` once with `sim_config.genvm_datetime` set to the current ISO timestamp. Do not retry any other error. The actual wallet submission still uses the original contract arguments and remains behind the fee-confirmation gate.

## Alternatives Considered

- Increase the fixed margin until simulation passes. Live evidence showed the simulation clock can lag by roughly 18 minutes, so an arbitrary larger margin would be brittle and could exceed the 3,600-second freshness window.
- Query the RPC for a block timestamp before every submission. This adds latency and still does not change the stale GenVM simulation clock.
- Change the contract timestamp validation. The deployed contract is intentionally frozen, and changing it would require a new deployment and invalidate current evidence.

## Error Handling

The existing fee simulation remains the write gate. Only the two evidence methods retry the exact decoded future-observation error, and only once with an explicit simulation datetime. If that retry fails, or if any other error occurs, no transaction is sent and the existing action error is shown. There will be no automatic signing.

## Tests and Verification

1. Add a failing unit test proving the helper returns a timestamp 60 seconds behind a supplied clock and never returns a negative value.
2. Add a failing source-level regression assertion proving both `submitStep` and `submitCure` use the shared helper instead of raw `Date.now()`.
3. Add failing adapter tests proving both evidence methods retry the exact decoded clock error with `sim_config.genvm_datetime` and that unrelated errors never retry or write.
4. Implement the minimum helper, call-site, and fee-simulation recovery changes needed to pass.
5. Run the focused tests, full frontend test suite, type/build checks, and production build.
6. Deploy to Vercel, repeat the Research fee simulation, then obtain explicit fee approval before signing.

## Success Criteria

- Research fee simulation reaches the Studio Next fee-review dialog instead of failing with `Observation is in the future`.
- No transaction is sent before the user approves the displayed maximum fee.
- Existing contract address, chain ID 61997, workflow state, and 30 GEN custody remain unchanged.
