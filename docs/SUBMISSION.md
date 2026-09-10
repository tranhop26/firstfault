# FirstFault — submission copy

## Project title

FirstFault

## Tagline

Find the first material breach in a paid agent workflow and settle each hold by GenLayer consensus.

## Short description

FirstFault is a three-agent commerce workflow for Research → Writer → Publisher. It binds briefs, identities, outputs, upstream lineage, timestamps, and source evidence on-chain. If the buyer rejects the final result, GenLayer validators determine the earliest material causal breach. The Intelligent Contract then schedules the exact payouts and refunds, or keeps value reserved in `UNRESOLVED` when evidence or consensus is insufficient.

## The problem

Multi-agent work breaks in ways that ordinary escrow cannot resolve. Workers can self-certify weak output, buyers can reject valid work after delivery, and downstream agents can reproduce an upstream error while still following their own brief. A simple pass/fail check cannot identify where trust first broke or decide which milestones deserve payment.

The actors cannot safely trust one another:

- The Buyer cannot trust workers to grade their own work.
- Workers cannot trust the Buyer to choose a convenient verdict.
- Writer cannot safely rely on unbound Research output.
- Publisher cannot be blamed automatically for faithfully reproducing an upstream artifact.
- The frontend and deployer must not be able to rewrite the outcome or recipients.

## The solution

FirstFault makes the Intelligent Contract the source of truth for both decision and consequence. Each step has a fixed worker, brief, amount, deadline, evidence schema, output hash, and upstream hash. Research evidence additionally binds the HTTPS source, normalized source snapshot, observation time, submission time, and snapshot version.

When a dispute opens, GenLayer validators evaluate the stored briefs and evidence semantically. Consensus returns one of three outcomes:

- `ACCEPT_ALL`: all submitted milestones complied.
- `FIRST_BREACH`: the earliest material causal breach plus a status for every step.
- `UNRESOLVED`: evidence or consensus is insufficient, so the contract makes no favorable assumption and keeps disputed value reserved.

For `FIRST_BREACH`, compliant steps pay their stored workers and the breached step returns its hold to the Buyer. Later steps are judged against their own briefs and bound upstream artifacts rather than blamed automatically.

## Why GenLayer

The hard part is a semantic question: did each agent satisfy its written brief using the evidence available at that step, and which failure first caused the buyer's rejection? Deterministic contracts cannot reliably answer that question from natural-language artifacts and web evidence. GenLayer provides validator consensus over the semantic evidence while the contract preserves authorization, replay protection, custody accounting, safe failure, and the final transfer consequences.

The validator result does not merely decorate an off-chain workflow. It changes contract state and determines how simulated Studionet GEN is allocated.

## Workflow

1. Buyer creates a workflow with the Buyer, Orchestrator, three workers, three briefs, three amounts, and three deadlines.
2. Buyer prepares a versioned funding intent and deposits the exact total.
3. Researcher submits source-bound evidence and an output.
4. Writer submits an output bound to the Research output hash.
5. Publisher submits an output bound to the Writer output hash.
6. Buyer accepts or opens a concrete rejection.
7. GenLayer validators adjudicate the earliest material causal breach.
8. The contract schedules exact stored-recipient transfers; the frontend reports completion only after the parent and every expected child transfer are finalized and reconciled.

Recovery includes evidence-bound cures, unanimous four-party mutual settlement, retryable adjudication, and timeout-to-`UNRESOLVED`. The contract has no admin verdict, emergency withdrawal, or privileged upgrade path.

## Live judge demo — no wallet required

1. Open https://firstfault.vercel.app
2. Paste `firstfault-v3-writer-breach-20260910-1` into **Workflow ID**.
3. Select **Inspect case**.
4. Confirm:
   - `FIRST_BREACH`
   - Earliest material breach: Writer, UI step 2 / contract step index `1`
   - Research `COMPLIANT`
   - Writer `MATERIAL_BREACH`
   - Publisher `COMPLIANT`
   - `Transfers finalized` with one parent and three child explorer links

The demonstration uses three holds of 1 simulated Studionet GEN. Research correctly reports that the IANA example-domains source contains no audience metric. Writer invents “250,000 users in one week,” violating its brief. Publisher reproduces that artifact exactly as its own brief requires. GenLayer identifies Writer as the first material breach. The contract pays 1 GEN to Researcher, pays 1 GEN to Publisher, and refunds the Writer hold of 1 GEN to Buyer. All transfers finalized and were value-credited; the contract balance returned to zero.

## Verified proof

- V3 contract: https://explorer-studio.genlayer.com/address/0x9236A835741DF7f891613B5578753647C140124E
- Deployment transaction: https://explorer-studio.genlayer.com/tx/0x9e3d328e3ec5a325ab25fffa26b006b692f7891d11de05703436304830b62fdc
- Adjudication transaction: https://explorer-studio.genlayer.com/tx/0xd3fecdeafbb30c7382a32dced6f8eab2438aa90e4eba25565cc24047def4f512
- Research payout: https://explorer-studio.genlayer.com/tx/0xa7dc45c69507f18dbec622493ca81b57b6831d71d09934c223bef4b8489db671
- Publisher payout: https://explorer-studio.genlayer.com/tx/0xc0c607bcccff569ac847a95817477956b513fd3d1456357d606ce28f0dc8bbb1
- Writer-hold refund: https://explorer-studio.genlayer.com/tx/0x689368c746f8afe06c637a7e47cd64fe0c0d026392f038bde5711c81a9f4949a
- Repository: https://github.com/tranhop26/firstfault
- Production: https://firstfault.vercel.app
- Machine-readable dispute proof: `deployments/studionet-v3-dispute-evidence.json`

The V3 source is fixed at commit `6e4b3b8a632ee519d571674af0b5e64bfc6d74e1`, SHA-256 `7164c7edf6bd2def6dce69615b4acce0f8899ffa7fa094b8cd59f6c1df426617`, with the verified 24-method schema recorded in `deployments/studionet-v3.json`. The contract is deployed on Studionet chain ID `61999` and is classified `INTENTIONALLY_FROZEN`.

## Built with

- GenLayer Intelligent Contracts and validator semantic consensus
- Python contract source with direct and Localnet integration tests
- `genlayer-js` for writes, finalized receipts, contract readback, and triggered-transfer reconciliation
- Next.js, React, TypeScript, and Tailwind CSS
- Vercel for the public frontend

## Safety and correctness

- Exact actor authorization and state transitions are enforced by the contract.
- Nonces and versioned funding intents prevent replay and ambiguous funding.
- Wrong or stale funding is rejected or refunded through recorded outcomes.
- Evidence is bound to workflow, step, actor, brief, upstream output, source snapshot, version, and time.
- Missing, contradictory, malformed, or insufficient evidence cannot silently become approval.
- Scheduled accounting and finalized external-transfer proof are displayed separately.
- Exact child recipients and values must match contract accounting before the UI displays `Transfers finalized`.
- Custody tests cover replay, double execution, refunds, unresolved holds, and value conservation.

## What makes it original

FirstFault does more than ask AI whether an output is good. It assigns responsibility across a dependency chain. A downstream agent can remain compliant even when its output contains a false claim, provided it faithfully followed a brief that required exact reproduction of the upstream artifact. The contract identifies the earliest material causal breach and applies milestone-level settlement without giving the Buyer, deployer, backend, or frontend control of the verdict.

## Limitations

- All GEN shown is simulated Studionet test value, not production money.
- V3 is intentionally frozen. Behavioral changes require a separately reviewed successor; existing holds cannot be silently migrated.
- `UNRESOLVED` deliberately retains disputed value until a contract-governed cure, retry, mutual settlement, or documented successor strategy succeeds.
- External transfer receipts are the execution proof; contract fields such as payout/refund scheduled record the intended allocation and are not presented as recipient-balance proof by themselves.

## Agent Tank portal field map

**Track:** Onchain Justice

**GitHub repository:** https://github.com/tranhop26/firstfault

**Project name:** FirstFault

**Project summary (145/180):**

GenLayer finds the first material breach in a paid multi-agent workflow, then settles each evidence-bound hold with verifiable transfer receipts.

**Project overview (993/1000):**

FirstFault resolves responsibility in a paid Research → Writer → Publisher workflow. Each worker submits an artifact bound to its brief, identity, upstream output, source snapshot, version, and time. If the buyer disputes delivery, the GenLayer Intelligent Contract asks validators to find the earliest material causal breach. The decision changes on-chain settlement: compliant milestones pay their stored workers, the breached hold returns to the buyer, and insufficient evidence becomes UNRESOLVED with value reserved. In the live V3 demo, Research correctly reports that IANA publishes no audience metric, Writer invents “250,000 users in one week,” and Publisher reproduces that artifact exactly as required. Consensus marks Writer as the first breach. Three finalized child receipts prove 1 simulated GEN paid to Researcher, 1 paid to Publisher, and 1 refunded to Buyer; the contract balance returns to zero. No buyer, deployer, backend, or frontend can choose the verdict or recipients.

**Demo video:** https://www.youtube.com/watch?v=dByU9s1dngc

**How-to step 1 heading:** Open the current V3 dispute

**How-to step 1 instruction:**

Open https://firstfault.vercel.app. Paste `firstfault-v3-writer-breach-20260910-1` into **Workflow ID** and select **Inspect case**. No wallet connection is required.

**How-to step 2 heading:** Verify the causal verdict

**How-to step 2 instruction:**

Confirm `FIRST_BREACH` and **Earliest material breach: step 2** (Writer). Check Research = `COMPLIANT`, Writer = `MATERIAL_BREACH`, and Publisher = `COMPLIANT`. Publisher remains compliant because its brief required exact reproduction of the Writer artifact.

**How-to step 3 heading:** Verify settlement receipts

**How-to step 3 instruction:**

Confirm **Transfers finalized**. Open the parent adjudication and all three child explorer links. The children show 1 simulated GEN paid to Researcher, 1 paid to Publisher, and the 1-GEN Writer hold refunded to Buyer; total 3 GEN and reserved balance 0.

**Expected verification outcome (382/500):**

Without a wallet, the live UI reconstructs the V3 dispute as `FIRST_BREACH` at Writer (contract index 1 / UI step 2), with Research and Publisher `COMPLIANT`. It shows 2 simulated GEN payout scheduled, 1 refunded, 0 reserved, and **Transfers finalized**. The parent adjudication and three child receipts reconcile exact stored recipients and 3 GEN total value; the contract balance is zero.

**Contract link:** https://explorer-studio.genlayer.com/address/0x9236A835741DF7f891613B5578753647C140124E

**Website:** https://firstfault.vercel.app

**GitHub:** https://github.com/tranhop26/firstfault
