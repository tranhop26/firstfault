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

The validator result does not merely decorate an off-chain workflow. It changes contract state and determines how simulated Studio Next GEN is allocated.

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
2. Paste `firstfault-studio-next-final-20260917-1` into **Workflow ID**.
3. Select **Inspect case**; no wallet connection is required for readback.
4. Verify three submitted evidence artifacts, the exact Research → Writer → Publisher lineage, `30 GEN` deposited, and `0 GEN` reserved.
5. Open the `accept_workflow` parent and all three child explorer links. Each child is `FINALIZED`, credits `10 GEN` to the stored Researcher, Writer, or Publisher address, and totals `30 GEN`.

This featured Studio Next flow proves real contract calls, persistent state, versioned funding, actor authorization, evidence lineage, custody accounting, fees, and external settlement. It is intentionally the happy path, not the semantic-dispute example. The same deployed contract invokes GenLayer validator consensus when a buyer opens a concrete natural-language evidence dispute; that is where FirstFault determines the earliest material causal breach and changes the payout/refund allocation.

## Verified proof

- Network: Studio Next, chain ID `61997`, RPC `https://studio-next.genlayer.com/api`
- Studio Next V3 contract: https://explorer-studio-dev.genlayer.com/address/0xf7136eDe8ba1761562fEcb2147609F3A2932c449
- Deployment transaction: https://explorer-studio-dev.genlayer.com/tx/0x48491dfc5f18ab2cdc6c74e37e9a427261c3964e5220c61c5e5178108af76a0a
- Accept-all parent: https://explorer-studio-dev.genlayer.com/tx/0xd396f50e33e776b056251f6ff86bf40d7dbb35de39d0df1b98ba3f8a30f80c4d
- Researcher payout: https://explorer-studio-dev.genlayer.com/tx/0x8454136cef08bd373e50f0f0313955ec7b7d16981a2e605fc48b99558369a620
- Writer payout: https://explorer-studio-dev.genlayer.com/tx/0x9b4cdd19059374cf58abdf3399bef1f2f0e25321423cc0fd9a25519aa5ddc37b
- Publisher payout: https://explorer-studio-dev.genlayer.com/tx/0x6c9050b30ab5e85c75e775d632262b437f621354355bb148fdb856e6dd5d5079
- Repository: https://github.com/tranhop26/firstfault
- Production: https://firstfault.vercel.app
- Demo video: https://www.youtube.com/watch?v=yV5kURhk76g
- Machine-readable happy-path proof: `deployments/studio-next-happy-path.json`

The deployed V3 source is fixed at commit `e9042b0a83afa39cd669cf0ec6e9896d68930034`, SHA-256 `be9a66f6f0a4f694024615f841c362eda8f463fd02ce4d16d4cffbb84dbb0e06`, with the verified 24-method schema recorded in `deployments/studio-next-v3.json`. The active contract is deployed on Studio Next chain ID `61997` and is classified `INTENTIONALLY_FROZEN`. Earlier Studionet receipts remain historical development evidence only.

## Built with

- GenLayer Intelligent Contracts and validator semantic consensus
- Python contract source with direct and Localnet integration tests
- `@genlayer/transaction-kit@0.1.0-rc.2`, `@genlayer/transaction-kit-react@0.1.0-rc.2`, and `genlayer-js@2.0.0-rc.1`
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

- All GEN shown is simulated Studio Next test value, not production money.
- V3 is intentionally frozen. Behavioral changes require a separately reviewed successor; existing holds cannot be silently migrated.
- `UNRESOLVED` deliberately retains disputed value until a contract-governed cure, retry, mutual settlement, or documented successor strategy succeeds.
- External transfer receipts are the execution proof; contract fields such as payout/refund scheduled record the intended allocation and are not presented as recipient-balance proof by themselves.

## Agent Tank portal field map

**Track:** Onchain Justice

**GitHub repository:** https://github.com/tranhop26/firstfault

**Project name:** FirstFault

**Project summary (145/180):**

GenLayer finds the first material breach in a paid multi-agent workflow, then settles each evidence-bound hold with verifiable transfer receipts.

**Project overview (maximum 1000 characters):**

FirstFault resolves responsibility in a paid Research → Writer → Publisher workflow. Each artifact is bound on-chain to its brief, worker, upstream output, evidence, version, and time. If the buyer disputes delivery, GenLayer validators determine the earliest material causal breach; compliant holds pay workers, the breached hold returns to the buyer, and insufficient evidence stays reserved as UNRESOLVED. The Studio Next judge demo proves the surrounding trust path end to end: real contract calls, 30 GEN custody, three evidence submissions with exact lineage, buyer acceptance, and three finalized 10 GEN child payouts to stored recipients. The production UI reads this state without a wallet and exposes the parent and child receipts. No buyer, deployer, backend, or frontend can rewrite the verdict, recipients, or accounting.

**Demo video:** https://www.youtube.com/watch?v=yV5kURhk76g

**How-to step 1 heading:** Open the Studio Next workflow

**How-to step 1 instruction:**

Open https://firstfault.vercel.app. Paste `firstfault-studio-next-final-20260917-1` into **Workflow ID** and select **Inspect case**. No wallet connection is required.

**How-to step 2 heading:** Verify evidence and custody

**How-to step 2 instruction:**

Confirm three submitted evidence artifacts and exact Research → Writer → Publisher upstream lineage. Check that Publisher's output hash equals Writer's output hash, deposited value is `30 GEN`, and reserved value is `0 GEN` after acceptance.

**How-to step 3 heading:** Verify settlement receipts

**How-to step 3 instruction:**

Confirm **Transfers finalized**. Open the `accept_workflow` parent and all three child explorer links. The children show `10 GEN` credited to each stored Researcher, Writer, and Publisher address; total finalized payout is `30 GEN`.

**Expected verification outcome (maximum 500 characters):**

Without a wallet, the UI reconstructs the Studio Next workflow with all three submitted evidence artifacts and exact upstream lineage. It shows `30 GEN` deposited, `30 GEN` payout scheduled, `0 GEN` refunded, `0 GEN` reserved, and **Transfers finalized**. The finalized parent and three child receipts reconcile the stored recipients at `10 GEN` each.

**Contract link:** https://explorer-studio-dev.genlayer.com/address/0xf7136eDe8ba1761562fEcb2147609F3A2932c449

**Website:** https://firstfault.vercel.app

**GitHub:** https://github.com/tranhop26/firstfault
