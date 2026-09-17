# Studio Next Calldata Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore wallet-free settlement proof reconstruction for current Studio Next calldata so fresh browsers show the finalized parent and child payout Explorer links.

**Architecture:** Keep the Intelligent Contract and all settlement checks unchanged. Extend the exact calldata matcher to recognize the current Studio Next unnamed-method representation. When the SDK returns no triggered IDs, let historical reconciliation use exact-parent child hashes from the already-fetched contract history, then run those receipts through the existing validation before the full frontend and live-chain gates.

**Tech Stack:** TypeScript 5.9, Vitest 3, genlayer-js 2.0.0-rc.1, Next.js 16, Studio Next RPC.

## Global Constraints

- Match an allow-listed settlement method and the exact first workflow argument.
- Fail closed for unrelated or malformed calldata; never use a loose workflow substring match.
- Preserve the existing contract-address, type, `FINALIZED`, execution-success, triggered-child, and exact-allocation checks.
- Prefer non-empty SDK-triggered IDs; use history fallback only when the SDK result is empty and `triggered_by` exactly matches the selected parent.
- Do not change Intelligent Contract, wallet, custody, fees, state machine, contract address, or deployment manifest.
- GitHub push, merge, and Vercel deployment require separate action-time user confirmation after identity checks.

---

### Task 1: Current Studio Next calldata regression

**Files:**
- Modify: `frontend/lib/contracts/FirstFault.test.ts:530-690`
- Modify: `frontend/lib/contracts/FirstFault.ts:656-677`

**Interfaces:**
- Consumes: `FirstFault.findSettlementEvidence(workflowId: string): Promise<SettlementEvidence | null>`.
- Produces: current-format support inside `matchesSettlementCall(readable: string, workflowId: string, methods: readonly string[]): boolean`.

- [ ] **Step 1: Add the exact live-format failing test**

Add a reconciliation test whose parent contains:

```ts
data: {
  calldata: {
    readable: `{"":"accept_workflow""args":["${workflowId}","accept-live-nonce",]}`,
  },
},
```

Use the existing single-payout fixture and assert that the returned proof contains the parent hash and one child.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
npm --prefix frontend test -- lib/contracts/FirstFault.test.ts -t "current Studio Next acceptance calldata"
```

Expected: FAIL because `findSettlementEvidence` returns `null`.

- [ ] **Step 3: Add a negative exact-first-argument regression**

Use current-format calldata with `another-workflow` as `args[0]` and the target ID as a later argument. Assert that reconciliation returns `null` and never requests triggered transaction IDs.

- [ ] **Step 4: Implement the minimal exact parser branch**

In the existing `catch` branch, extract the current representation with anchored expressions equivalent to:

```ts
const currentMethod = readable.match(/^\{"":"([^"]+)""args":\[/);
const currentFirstArgument = readable.match(/^\{"":"[^"]+""args":\["((?:\\.|[^"\\])*)"/);
```

Accept only when both matches exist, `currentMethod[1]` is allow-listed, and JSON-decoding `currentFirstArgument[1]` equals `workflowId`. Retain the older parser path unchanged.

- [ ] **Step 5: Run the focused tests and verify GREEN**

Run:

```powershell
npm --prefix frontend test -- lib/contracts/FirstFault.test.ts -t "current Studio Next"
```

Expected: both positive and negative current-format tests pass.

- [ ] **Step 6: Commit the isolated fix**

```powershell
git add frontend/lib/contracts/FirstFault.test.ts frontend/lib/contracts/FirstFault.ts
git commit -m "fix: reconcile current Studio Next calldata"
```

### Task 2: Empty SDK triggered-ID fallback

**Files:**
- Modify: `frontend/lib/contracts/FirstFault.test.ts:563-650`
- Modify: `frontend/lib/contracts/FirstFault.ts:538-650`

**Interfaces:**
- Consumes: contract-history entries with `hash` and `triggered_by`, plus `getTriggeredTransactionIds({ hash })`.
- Produces: `getTriggeredReceiptsByHash(hash, fallbackChildIds?)` that prefers non-empty SDK IDs and otherwise validates fallback receipts through the existing checks.

- [ ] **Step 1: Make the live-format test reproduce the empty SDK result**

Set `client.getTriggeredTransactionIds` to return `[]` and include the finalized child history entry with `triggered_by: parent.hash`. Keep the expected proof parent and child count unchanged.

- [ ] **Step 2: Run the focused test and verify RED**

```powershell
npm --prefix frontend test -- lib/contracts/FirstFault.test.ts -t "empty triggered IDs"
```

Expected: FAIL because reconciliation hydrates zero child receipts and allocation comparison fails.

- [ ] **Step 3: Add the wrong-parent negative test**

Return no SDK IDs and a history child whose `triggered_by` is another hash. Assert reconciliation returns `null` and the unrelated child receipt is never hydrated.

- [ ] **Step 4: Implement the bounded fallback**

Expand the history entry type with `triggered_by`. Derive fallback hashes using an exact case-insensitive parent match. Pass them to `getTriggeredReceiptsByHash`; inside that method use them only when the SDK returns an empty list. Do not bypass its receipt-level validation.

- [ ] **Step 5: Run both fallback tests and verify GREEN**

```powershell
npm --prefix frontend test -- lib/contracts/FirstFault.test.ts -t "triggered IDs"
```

Expected: positive empty-ID reconstruction and wrong-parent rejection both pass.

- [ ] **Step 6: Commit the fallback**

```powershell
git add frontend/lib/contracts/FirstFault.test.ts frontend/lib/contracts/FirstFault.ts
git commit -m "fix: recover Studio Next child receipts from history"
```

### Task 3: Automated and live proof gates

**Files:**
- Verify: `frontend/lib/contracts/FirstFault.test.ts`
- Verify: `frontend/lib/contracts/FirstFault.ts`

**Interfaces:**
- Consumes: deployed contract `0xf7136eDe8ba1761562fEcb2147609F3A2932c449` and workflow `firstfault-studio-next-final-20260917-1`.
- Produces: verified parent `0xd396f50e33e776b056251f6ff86bf40d7dbb35de39d0df1b98ba3f8a30f80c4d` and exactly three finalized child receipts.

- [ ] **Step 1: Run the full frontend test suite**

```powershell
npm --prefix frontend test
```

Expected: zero failures; Localnet-dependent tests may only be excluded if the repository already excludes them by configuration.

- [ ] **Step 2: Run TypeScript and production-build gates**

```powershell
npm --prefix frontend run lint
npm --prefix frontend run build
```

Expected: both commands exit 0.

- [ ] **Step 3: Run live Studio Next reconstruction**

Instantiate `FirstFault` with the deployed address, call `findSettlementEvidence` for the known workflow, and print only the parent and child hashes. Require the known parent and these three children:

```text
0x8454136cef08bd373e50f0f0313955ec7b7d16981a2e605fc48b99558369a620
0x9b4cdd19059374cf58abdf3399bef1f2f0e25321423cc0fd9a25519aa5ddc37b
0x6c9050b30ab5e85c75e775d632262b437f621354355bb148fdb856e6dd5d5079
```

Expected: exact parent match and exactly three child hashes.

- [ ] **Step 4: Review repository hygiene and diff**

```powershell
git status --short
git diff origin/main...HEAD --check
git diff origin/main...HEAD --stat
```

Expected: only the design, plan, regression tests, and parser fix are present; no secrets, caches, build output, or local instructions.

### Task 4: Confirmed publication and fresh-browser proof

**Files:**
- No source changes expected.

**Interfaces:**
- Consumes: verified local branch and user-confirmed GitHub/Vercel identities.
- Produces: merged commit, Ready production deployment, and fresh-browser Explorer-link evidence.

- [ ] **Step 1: Check identities before external mutation**

Check Git author, active GitHub CLI account, repository remote/owner, and Vercel project/team. State the exact branch, commit, repository, and deployment target to the user.

- [ ] **Step 2: Obtain action-time confirmation**

Stop and ask the user to approve pushing the exact branch and allowing the resulting Vercel production deployment. Previous approval does not satisfy this step.

- [ ] **Step 3: Push, open/merge the PR, and wait for deployment**

Perform only the confirmed GitHub and Vercel actions. Record the merge commit and Ready deployment URL.

- [ ] **Step 4: Verify production from a fresh browser context**

Open `https://firstfault.vercel.app`, inspect `firstfault-studio-next-final-20260917-1`, and require one parent plus three child links under `https://explorer-studio-dev.genlayer.com/tx/`.

- [ ] **Step 5: Report fixed evidence and limitations**

Report the exact commit, test/type/build results, live contract/workflow, parent/children, deployment URL, and any remaining limitation. Do not call the project hackathon-ready if any gate is missing.
