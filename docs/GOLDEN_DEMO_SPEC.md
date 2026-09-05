# FirstFault Golden Demo Specification

## Goal

Produce one reproducible Studionet case that demonstrates FirstFault's core claim: when a three-agent delivery chain fails, the Intelligent Contract binds every artifact, asks GenLayer to identify the earliest material causal breach, and schedules value using stored parties and amounts rather than caller-selected settlement data.

## Case identity and actors

- Workflow ID: `firstfault-golden-writer-breach-20260905-1`.
- Buyer and orchestrator: `0x21b45103dd05c43969daF3CbB4277391777e2eC7`.
- Researcher, writer, and publisher: three distinct MetaMask accounts controlled by the project owner. Their addresses are recorded only after each account is selected and verified in the wallet.
- Contract: `0x2271AE904A97865491e4b24c49532f71B711eD5f` on Studionet chain `61999`.
- Holds: researcher `11`, writer `17`, publisher `23`; total custody is `51` simulated Studionet GEN.

## Immutable briefs and artifacts

The stable primary source is `https://www.iana.org/help/example-domains`.

1. Researcher MUST report what IANA says about example domains and MUST state whether the source provides an audience metric.
   - Output: `IANA reserves example domains for documentation purposes. The cited source provides no audience or weekly-user metric.`
2. Writer MUST use only claims supported by the Research artifact and MUST NOT invent audience, traffic, or adoption metrics.
   - Deliberate breach output: `Example domains reached 250,000 users in one week.`
3. Publisher MUST reproduce the Writer artifact without adding, removing, correcting, or independently asserting any claim.
   - Output: `Example domains reached 250,000 users in one week.`

The buyer's rejection reason is: `The final publication contains a 250,000 weekly-user metric that is absent from the bound IANA source and contradicts the Writer MUST brief.`

## Expected decision and consequence

The target semantic outcome is `FIRST_BREACH` with `first_breach_step = 1`. Research should be `COMPLIANT`; Writer should be `MATERIAL_BREACH`; Publisher should be evaluated against its own immutable formatting-only brief. GenLayer may also identify a downstream breach, but the earliest causal breach must remain Writer at step 1.

For every step GenLayer marks `MATERIAL_BREACH`, that step's stored hold is scheduled back to the Buyer. Every other step's hold is scheduled to its stored worker. Neither the caller, frontend, nor model supplies recipients or amounts. If consensus or evidence is insufficient, the safe result is `UNRESOLVED`, with all `51` simulated GEN remaining reserved and no child transfer emitted.

## Transaction sequence

1. Buyer creates the workflow with three distinct workers, strictly increasing deadlines, and a unique nonce.
2. Buyer funds exactly `51` simulated GEN.
3. Orchestrator starts the workflow.
4. Researcher submits the source-bound Research artifact with an empty upstream hash.
5. Writer submits the deliberate breach with the exact Research output hash as upstream.
6. Publisher submits the unchanged Writer artifact with the exact Writer output hash as upstream.
7. Buyer opens the dispute with the fixed rejection reason.
8. Any connected account requests adjudication.
9. Wait for parent finality, every triggered child transfer, and authoritative readback.

All evidence observations and adjudication must complete inside the contract's one-hour freshness window. Each wallet address, network, method, arguments, and simulated value is checked immediately before the final wallet confirmation.

## Failure handling

- A rejected wallet prompt creates no claimed evidence and may be retried with a new nonce.
- A submitted transaction is never resubmitted merely because the browser is slow; its hash is reconciled first.
- A reverted transaction is recorded with its rollback payload and must leave authoritative state unchanged.
- Missing, stale, contradictory, unsafe, or unavailable evidence must not become a payout; `UNRESOLVED` is accepted as the safe live result.
- A finalized adjudication parent is not described as settled until every triggered transfer has finalized for the exact contract-accounted value.

## Required proof package

The fixed evidence record must contain:

- Every parent transaction hash and execution result for create, fund, start, three submissions, dispute, and adjudication.
- Three stored evidence hashes and upstream-hash links.
- Adjudication validator agreement, normalized verdict, first-breach index, and cited evidence hashes.
- Every triggered child transaction with sender, recipient, value, status, and execution result.
- Workflow, three steps, accounting, and relevant balance readbacks before funding, before adjudication, and after child finality.
- Conservation proof: `51 = reserved + payout_scheduled + refund_scheduled` immediately after adjudication, plus exact finalized child-transfer value.
- An explicit distinction between simulated Studionet value and production money.

## Acceptance criteria

- The deployed frozen source and 17-method schema remain unchanged.
- Workers are distinct and each protected method is called by the correct account.
- No nonce, evidence hash, workflow ID, or transaction is replayed.
- The live production UI reconstructs the final contract state without fake data.
- The README proof matrix and machine-readable evidence file map actor, action, method, transaction, finality, consequence, and readback.
- Any departure from `FIRST_BREACH` is reported truthfully as a live limitation or `UNRESOLVED`, never rewritten into the expected result.
