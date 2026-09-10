# FirstFault Final Submission Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the public repository and submission copy with the verified FirstFault V3 production system and provide judges a fast, wallet-free demo path.

**Architecture:** Keep `README.md` as the technical source of truth and add `docs/SUBMISSION.md` as concise form-ready copy derived from committed deployment evidence. Do not change contract, frontend runtime, Vercel configuration, or on-chain state.

**Tech Stack:** Markdown, GitHub, Vercel, FirstFault V3 on GenLayer Studionet.

## Global Constraints

- Active contract is `0x9236A835741DF7f891613B5578753647C140124E` on Studionet chain `61999`.
- Judge workflow is `firstfault-v3-writer-breach-20260910-1`.
- All GEN references must say simulated Studionet value.
- Every material claim must map to committed evidence.
- Do not claim a Vercel deployment ID is permanently latest.
- Do not alter contract source, frontend runtime, wallet state, or Vercel environment.
- Stop before any GitHub push, merge, or public submission save/publish action and request action-time confirmation.

---

### Task 1: Refresh public README truth

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: `deployments/studionet-v3.json`, `deployments/studionet-v3-dispute-evidence.json`, and `deployments/vercel.json`.
- Produces: Correct public setup, live application, judge demo, evidence matrix, and limitations.

- [ ] **Step 1: Update active environment guidance**

State that `NEXT_PUBLIC_CONTRACT_VERSION` accepts `v1`, `v2`, or `v3`, and give the exact active production values: Studionet RPC, chain `61999`, V3 address, and version `v3`.

- [ ] **Step 2: Replace stale live application copy**

Reference the stable production URL, contract address, runtime-fix merge `68d9b89a708daf7ae547a9b998f58e981d3a0b3a`, and evidence manifests. Avoid a “latest deployment” claim.

- [ ] **Step 3: Add the wallet-free judge demo**

Give four steps: open Production, paste `firstfault-v3-writer-breach-20260910-1`, select Inspect case, and verify `FIRST_BREACH`, Writer at UI step 2, and three finalized transfers.

- [ ] **Step 4: Add V3 dispute proof to the matrix and remove false limitations**

Add the V3 adjudication parent and exact settlement child links. Remove the claim that Production uses V1 or lacks V3 live evidence; preserve frozen-contract, `UNRESOLVED`, simulated-value, and scheduled-versus-finalized limitations.

### Task 2: Create form-ready submission copy

**Files:**
- Create: `docs/SUBMISSION.md`

**Interfaces:**
- Consumes: the updated README and committed manifests.
- Produces: Copy-ready title, tagline, summary, problem, solution, GenLayer role, workflow, technology, demo instructions, links, proof, and limitations.

- [ ] **Step 1: Write concise submission fields**

Lead with the trust failure between Buyer, Researcher, Writer, and Publisher. Explain that GenLayer validators determine the earliest material causal breach and the contract applies payouts/refunds or preserves value in `UNRESOLVED`.

- [ ] **Step 2: Ground the technical claims**

Include V3 address, deployment transaction, source hash, 24-method schema, production URL, repository, judge workflow, adjudication hash, and exact `2 payout + 1 refund = 3 deposited` conservation result.

- [ ] **Step 3: Add a short judge path and limitations**

Make the demo wallet-free and label every GEN amount as simulated. State that V3 is intentionally frozen and unresolved funds require contract-governed recovery.

### Task 3: Verify documentation and prepare form mapping

**Files:**
- Verify: `README.md`
- Verify: `docs/SUBMISSION.md`

**Interfaces:**
- Consumes: finished public documentation.
- Produces: locally committed, reviewable submission package and a mapping to the actual submission form.

- [ ] **Step 1: Scan for stale or unsupported claims**

Search for the obsolete V1-production sentence, the old deployment `6S85eiff8Dwk634YTZbmzNk5pxaR`, V1/V2-only environment wording, placeholders, secrets, and claims inconsistent with committed manifests.

- [ ] **Step 2: Validate links and project checks**

Require HTTP success for Production, repository, V3 contract, deployment transaction, adjudication, and all three child transfers. Run the complete non-Localnet frontend tests, `npm run lint`, and `npm run build`.

- [ ] **Step 3: Commit locally**

Commit only the spec, plan, README, and submission document on `docs/final-submission`. Do not push yet.

- [ ] **Step 4: Inspect the actual submission form**

Use the browser read-only to identify the platform, existing entry, field names, limits, and missing assets. Fill or save nothing until the content is fully mapped and the required external-action confirmation has been obtained.
