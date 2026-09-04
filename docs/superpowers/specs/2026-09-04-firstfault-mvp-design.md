# FirstFault MVP Design

**Status:** Approved direction — single-contract, three-step MVP  
**Network:** GenLayer Studionet  
**Contract classification:** `INTENTIONALLY_FROZEN`

## Product boundary

FirstFault adjudicates failure in a paid, linear workflow of three agents: Research, Writer, and Publisher. It is not an agent marketplace, reputation system, general workflow engine, or production escrow product. Studionet GEN is simulated value.

The public SynQuesta workflow is used only as a product-structure reference: publish an immutable brief, collect participant work, run GenLayer judgment, expose transaction state, and show the resulting value movement. FirstFault has an independent domain model and dispute workflow.

## Trust problem

The buyer cannot trust workers' claims that their individual step complied. Workers cannot trust the buyer's rejection reason or the orchestrator's forwarded input. Downstream workers cannot trust that an upstream artifact was not replaced. The frontend and deployer must not be able to select or overwrite the verdict.

The contract binds the buyer, orchestrator, worker address, immutable brief, step amount, deadline, upstream artifact hash, output hash, evidence metadata, and replay nonce before judgment.

## GenLayer decision

GenLayer establishes one fact:

> Given the immutable briefs and bound evidence, which earliest step materially breached its own requirements and contributed to the final rejection?

The structured result is `ACCEPT_ALL`, `FIRST_BREACH`, or `UNRESOLVED`, plus the first-breach step, per-step status, concise reasons, and cited evidence hashes. Validators compare the semantic decision fields, not JSON shape or free-form wording.

The adjudication uses `gl.vm.run_nondet` with a custom validator. `run_nondet_unsafe` is permitted only as a documented runtime fallback. Storage is read before the nondeterministic closure and captured as immutable input. One optional source URL per Research evidence may be rendered inside the nondeterministic block; unavailable, malformed, or low-confidence leader results become `UNRESOLVED`, never a favorable default. A validator disagreement terminates and rolls back that GenVM transaction, leaving the workflow `DISPUTED` with its hold unchanged. After a frozen 900-second interval from the contract-derived `dispute_opened_at`, anyone may call `timeout_dispute_to_unresolved`; this deterministic, zero-transfer recovery transition makes the stalled dispute eligible for the Task 6 cure or unanimous-settlement paths.

## On-chain consequence

- `ACCEPT_ALL`: schedule each step's held GEN for its assigned worker.
- `FIRST_BREACH`: schedule held GEN for compliant steps and refund the breached step's hold to the buyer.
- `UNRESOLVED`: schedule no disputed transfer; preserve the hold for one cure attempt or unanimous on-chain mutual settlement.

Amounts and recipients come only from deterministic contract storage. The LLM cannot create transfer instructions. Transfer messages are scheduled in the decision transaction and emitted under GenLayer finalization semantics; there is no separate application-level `settle()` method.

Before child-transfer execution is authoritatively observed, the conservation invariant is:

`deposited = reserved + payout_scheduled + refund_scheduled + paid + refunded`

`PAYOUT_SCHEDULED` and `REFUND_SCHEDULED` mean only that a finalized child message was scheduled. They are not recipient-balance proof. `paid` and `refunded` remain zero until a later authoritative reconciliation proves child execution. Each hold can have exactly one scheduling or completed disposition.

## State machine

`DRAFT → FUNDED → IN_PROGRESS → READY_FOR_REVIEW`

From review:

- `accept_workflow → ACCEPTED_PENDING_FINALITY → SETTLED_SUCCESS`
- `cancel_workflow` with funded holds `→ CANCELED_PENDING_FINALITY → SETTLED_SUCCESS`
- `open_dispute → DISPUTED → ADJUDICATING → DECISION_PENDING_FINALITY → SETTLED_BREACH`
- leader-observable insufficient, stale, unavailable, malformed, or low-confidence evidence → `UNRESOLVED`
- validator disagreement → transaction rollback → `DISPUTED`; after 900 seconds from `dispute_opened_at`, `timeout_dispute_to_unresolved → UNRESOLVED`

Recovery branches:

- `UNRESOLVED → CURE_SUBMITTED → ADJUDICATING`, once.
- `UNRESOLVED → MUTUAL_PROPOSED → MUTUAL_APPROVED → SETTLED_MUTUAL`, requiring on-chain approval from every affected party.
- Cancellation is allowed only before any worker starts.
- The buyer alone may accept or cancel their funded workflow; the orchestrator may start a funded workflow but cannot release buyer-held GEN.

Every transition checks actor, current state, deadline, nonce, evidence binding, and terminal-state immutability.

## Architecture

- `contracts/firstfault.py`: the only authoritative state machine, adjudicator, custody ledger, and payout/refund scheduler.
- `tests/direct/`: fast state, authorization, evidence, consensus-result, replay, custody, refund, and conservation tests.
- `tests/integration/`: real client-to-contract workflows and transaction/readback checks.
- `deploy/`: Studionet deployment script and machine-readable manifest.
- `frontend/`: responsive Next.js client using GenLayerJS and a user-controlled wallet.
- `docs/`: trust model, frozen-contract recovery runbook, deployment manifest, limitations, and proof matrix.

No backend may decide the verdict, advance workflow state, custody GEN, or fabricate contract reads.

## Frontend workflow

The main screen is a three-step timeline with immutable brief, worker, hold amount, input/output hashes, evidence, and state. Role-aware actions let the buyer create/fund/accept/dispute and each worker submit only its assigned step.

Transaction presentation distinguishes `wallet disconnected`, `wallet approval`, `submitted`, `pending/accepted`, `finality window`, `finalized`, `triggered transfer pending`, `success`, `UNRESOLVED`, `error`, and authoritative readback. A refresh reconstructs the screen from contract state rather than local optimistic flags.

## Error and safety behavior

- Reject unauthorized actors, invalid transitions, duplicate funding/submission/decision, reused nonces, mismatched hashes, wrong dependency input, zero or incorrect funding, and actions after terminal state.
- Treat malformed nondeterministic output as a failed decision, not settlement authority.
- Treat missing, stale, unavailable, or contradictory evidence as `REQUEST_MORE_INFO` or `UNRESOLVED`.
- Never expose private keys through frontend environment variables; the connected funded wallet signs.
- Use Studionet consistently for contract, client, address, wallet balance, and explorer evidence.
- Verify transaction finality, execution success, triggered transfers, recipient balance changes, and contract readback separately.

## Test and evidence boundary

Implementation follows test-first cycles. The minimum promoted live scenarios are:

1. All three agents comply and all three holds are paid.
2. Writer introduces an unsupported claim; Research and Publisher are paid while Writer's hold is refunded.
3. Evidence is insufficient or contradictory; the workflow becomes `UNRESOLVED` and disputed funds do not move.

Completion requires lint, frontend production build, direct tests, integration tests, exact commit and source hash, Studionet address and deployment transaction, explorer evidence, live URL, and a proof matrix mapping each advertised claim to a transaction and readback.

## Recoverability

V1 has no upgrade or owner-verdict path. If a bug is found, the frontend stops creating new V1 workflows, affected states are disclosed, and V2 is deployed at a new address. Existing V1 holds can move only through V1's predefined terminal paths; no administrator can migrate them by assertion.
