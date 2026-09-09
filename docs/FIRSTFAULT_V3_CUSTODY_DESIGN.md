# FirstFault V3 custody safety design

Status: approved for implementation on 2026-09-09

Contract classification: `INTENTIONALLY_FROZEN`

Predecessor: FirstFault V2 at `0x24c060E5394b5bD14a5546B055A7F049f9842987`

## Problem and live evidence

FirstFault V2 passed direct tests, Localnet integration, source readback, and the
deployment schema gate, but its first live workflow exposed two boundary
failures:

1. GenLayer Studio encoded the `Address` arguments of `create_workflow` as plain
   integers. Transaction
   [`0x37f097…a4297`](https://explorer-studio.genlayer.com/tx/0x37f097ee3944ada46cc5d167acec007f5ae13afd2bb0217e05b46427847a4297)
   finalized with validator agreement on an execution error:
   `AttributeError: 'int' object has no attribute 'as_bytes'`. No workflow was
   stored.
2. A subsequent three-GEN funding call for that absent workflow finalized with
   `Workflow not found`, but transaction
   [`0x0dbf93…57be2b`](https://explorer-studio.genlayer.com/tx/0x0dbf9348f0a7e7b6009dd73e7eedc4ce9521b17455eb376a4cb8f702e157be2b)
   reports `valueCredited=true`. The V2 address balance increased by exactly
   `3_000_000_000_000_000_000` wei while no workflow accounting entry exists.

V2 is intentionally frozen, so the unaccounted simulated Studionet value cannot
be repaired in place. V2 must not be enabled in production.

## Trust matrix

| Actor | Cannot trust | Can manipulate | V3 contract defense | Required proof |
|---|---|---|---|---|
| Buyer | Studio, frontend, RPC caller | Address encoding, intent ID, value, replay order | Parse address strings before storage; two-phase funding; exact intent binding | Malformed-address and funding replay tests |
| Worker | Buyer and frontend | Actor selection and displayed milestone terms | Store normalized actors and immutable terms before funding | Unauthorized worker and readback tests |
| Arbitrary caller | Buyer and UI | Direct payable calls, nonexistent workflow IDs, stale intents | Payable entry never traps rejected value; schedule a refund for every rejected value-bearing call | Direct invalid-call refund tests |
| Frontend | Browser state | Advance optimistic state or hide a failed execution | Distinguish `FINALIZED` from execution success and require contract readback | UI regression and live browser proof |
| Validators | Leader and external evidence | Divergent semantic or web results | Existing safe `UNRESOLVED` and retry rules remain authoritative | Consensus failure and retry tests |

## Decision and consequence

The new GenLayer decision for custody entry is: **does this exact value-bearing
call satisfy a previously stored funding intent for this sender, workflow,
contract, chain, amount, and unused intent version?**

If yes, the contract consumes the intent and moves the exact value into workflow
`deposited` and `reserved` accounting. If no, the call cannot increase workflow
custody; it schedules an external transfer of the entire received value back to
the transaction sender and records a rejected funding outcome.

Semantic workflow adjudication and its payout/refund consequences remain as
defined in V2.

## Address boundary

All externally supplied actor parameters in `create_workflow` become lowercase
or checksum hexadecimal strings in the ABI. The contract validates the exact
`0x` plus 40-hex-character format, constructs `Address` values inside the
contract, and only then stores or compares them. Zero addresses and duplicate
worker addresses are rejected before any state is written.

The frontend sends plain hexadecimal strings for V3. V1 and V2 adapters retain
their existing typed-address encoding, selected by contract version.

## Two-phase funding state machine

### Funding intent

`prepare_funding(workflow_id, intent_id, expires_at, nonce)` is nonpayable and
buyer-only. It requires:

- an existing `DRAFT` workflow;
- an unused, nonempty intent ID;
- an expiry later than the current transaction timestamp and no more than one
  hour in the future; and
- no unexpired active intent for the workflow.

The contract derives the exact amount from the three immutable milestones. The
stored intent binds chain ID, contract address, workflow ID, buyer, exact amount,
expiry, nonce, and an incrementing version. Preparing an intent does not move
value or change the workflow from `DRAFT`. `get_funding_intent(workflow_id)`
returns these authoritative bindings so the frontend can compare them before it
enables the payable action.

### Payable execution

`fund_workflow(workflow_id, intent_id)` is the only payable public method. Once
entered, it must not raise for a caller-controlled validation failure.

| Condition | State effect | Value effect | Result |
|---|---|---|---|
| Active intent matches sender, workflow, amount and time | Consume intent; increase `deposited` and `reserved`; workflow becomes `FUNDED` | Retain exact value | `FUNDED` |
| Intent missing, expired, consumed or mismatched | Workflow custody unchanged | Schedule full value back to sender | `REFUND_SCHEDULED` |
| Workflow missing or no longer `DRAFT` | No workflow mutation | Schedule full value back to sender | `REFUND_SCHEDULED` |
| Zero-value invalid call | No mutation | No transfer | `REJECTED_NO_VALUE` |

Every payable call increments a contract-wide `funding_attempt_count` before it
branches. The function records `FundingOutcome` under that unique integer index,
and returns the index. The record binds sender, workflow ID, intent ID,
transaction timestamp, and current intent version, and contains received value,
retained value, refund scheduled, reason code, and resulting workflow state.
`get_funding_outcome(attempt_index)` provides authoritative readback. The nonce
or intent cannot authorize funding twice.

An external refund is asynchronous. The contract records
`funding_refund_scheduled`; the frontend treats it as pending until the exact
triggered child transfer is `FINALIZED`, credited to the original sender, and
linked to the rejected parent transaction.

## Accounting invariants

V3 exposes cumulative contract-level totals in addition to per-workflow
accounting:

- `total_accepted_funding`
- `total_rejected_funding_received`
- `total_workflow_payout_scheduled`
- `total_workflow_refund_scheduled`
- `total_rejected_funding_refund_scheduled`

The contract invariants are:

`total accepted funding = current workflow reserved + total workflow payout scheduled + total workflow refund scheduled`

`total rejected funding received = total rejected-funding refund scheduled`

The chain reconciliation invariant is:

`all credited inflows = current contract balance + all finalized value-credited outbound child transfers`

A rejected funding call must never increase `deposited` or `reserved`. Its full
nonzero value must appear in `total_rejected_funding_received`, the equal refund
scheduled total, and an exact child-transfer proof. The live proof compares the
contract's chain balance and all finalized outbound children with every credited
inflow.

## Frontend behavior

The V3 composer adds an explicit funding preparation step:

1. Create workflow and require `FINALIZED`, successful execution, and `DRAFT`
   readback.
2. Prepare the exact funding intent and require successful readback.
3. Show the bound amount, expiry, buyer, workflow, and intent version.
4. Ask the wallet to send the exact GEN amount.
5. Show transaction finality and execution result separately.
6. Read `FundingOutcome` and workflow accounting.
7. If rejected, show the refund as pending until its exact child transfer is
   finalized and reconciled.

The UI must never label a transaction successful from `FINALIZED` alone. An
execution error is shown as an error even when validators agree and the
transaction reaches finality.

## Tests and live proof

Contract regression tests must cover:

- Studio-style integer, malformed, zero, and duplicate actor inputs;
- successful preparation and exact funding;
- nonexistent workflow, wrong sender, wrong state, wrong amount, expired
  intent, mismatched intent, consumed intent, and repeated transaction;
- full scheduled refund for every invalid value-bearing branch;
- no change to workflow `deposited` or `reserved` on rejected funding;
- double funding and intent replay rejection without trapped value;
- conservation across successful funding, rejected funding, cancellation,
  acceptance, adjudication, and mutual settlement;
- all existing V2 liveness, evidence, cure, retry, and replay tests.

Frontend tests must prove string-address encoding, the prepare/fund sequence,
execution-error rendering after finality, outcome readback, and child-refund
reconciliation.

Before production enablement, a separately confirmed V3 Studionet deployment
must produce fixed evidence for:

1. successful intent, funding, three-step submission, acceptance, and three
   finalized payouts;
2. rejected invalid funding with a finalized full refund and unchanged workflow
   custody;
3. missed-worker permissionless adjudication;
4. buyer-review timeout adjudication; and
5. consensus timeout to `UNRESOLVED`, followed by same-evidence retry.

## Migration and repository evidence

V3 deploys to a new address and a new immutable manifest. V1 remains the current
production contract. V2 is retained as historical deployment evidence and is
marked unsafe for production because of the live failure above. No existing V1
or V2 state is migrated silently.

The V3 manifest must bind its source commit and hash, predecessor V2, deployer,
transaction, exact schema, explorer links, and `INTENTIONALLY_FROZEN`
classification. Production environment changes require separate confirmation
after all live proof gates pass.

## Non-goals

- Recovering the three simulated GEN already trapped in frozen V2.
- Adding administrator withdrawal, verdict, upgrade, or migration authority.
- Enabling V2 or V3 in production before live proof is complete.
- Changing the V2 semantic adjudication rubric beyond custody-related API
  compatibility work.
