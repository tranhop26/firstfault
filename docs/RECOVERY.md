# FirstFault V1 recovery

FirstFault V1 is **INTENTIONALLY_FROZEN**. It has no owner verdict override,
upgrade entry point, administrative migration, or emergency withdrawal. An
`UNRESOLVED` workflow keeps its simulated Studionet GEN in `reserved`; reaching
that state alone never schedules a transfer.

## Terminal paths for an existing hold

An unresolved workflow has two contract-governed recovery choices:

1. **One cure.** A worker whose own stored step is marked `UNRESOLVED` may append
   one fresh, canonical HTTPS-backed cure. The cure is bound to the original
   evidence hash, actor, workflow, chain, contract, timestamps, schema, and
   nonce. It never replaces the original step evidence and schedules no value.
   The workflow returns to `DISPUTED` so the frozen semantic adjudication can
   evaluate the original record plus the cure. No second cure is accepted.
2. **Unanimous mutual settlement.** The buyer or any assigned worker may propose
   four allocations: Research, Writer, Publisher, and buyer refund. Their sum
   must equal the workflow's current `reserved` value exactly. The proposal hash
   binds the chain, contract, workflow, monotonically increasing version,
   reserved value, all four amounts, and schema. Replacement creates a new hash
   and invalidates every earlier approval. The buyer and all three distinct
   workers must approve that exact hash on-chain. Only then may anyone execute
   it once. Storage moves value from `reserved` to `payout_scheduled` and
   `refund_scheduled` before child transfer messages are emitted; V1 never calls
   scheduled value `paid` or `refunded` without later authoritative proof.

These are the only V1 recovery routes for existing holds. Nonces, actor checks,
state checks, proposal versions, unanimous approvals, and terminal-state guards
prevent replay, stale consent, double scheduling, and double claim.

## Faulty deployment runbook

If V1 is found faulty, operators must stop directing users to create new V1
workflows at the application level and deploy a separate V2 contract with its
own reviewed policy and manifest. V1 itself has no privileged pause switch or
migration shortcut. Existing V1 holds remain governed only by V1's frozen
terminal paths; an operator cannot move them to V2 or substitute a verdict.

Studionet GEN is simulated test value, not production money.
