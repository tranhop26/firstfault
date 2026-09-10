# Studionet Execution Readback Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the frontend reconstruct exact finalized settlement transfers when current Studionet receipts report transaction consensus as result `6` / `MAJORITY_AGREE` without the older execution fields.

**Architecture:** Extend the existing `executionSucceeded` boundary in `FirstFault.ts`; keep settlement-history, calldata, parent finality, child finality, recipient, and amount checks unchanged. Prove the behavior through `findSettlementEvidence` so the test covers the user-visible settlement proof path rather than a private helper.

**Tech Stack:** TypeScript 5.9, Vitest 3, `genlayer-js` 1.1.8, Next.js 16.

## Global Constraints

- Do not change, redeploy, or migrate the FirstFault V3 Intelligent Contract.
- Accept the new receipt path only when `statusName` is `FINALIZED` and the SDK transaction result is `MAJORITY_AGREE` or its numeric value `6`.
- Do not accept `NO_MAJORITY`, `MAJORITY_DISAGREE`, failure, unknown, or unfinalized receipts.
- Preserve exact parent calldata and child recipient/value allocation checks.
- GitHub push, PR creation, and deployment require their own action-time confirmations.

---

### Task 1: Protect current Studionet receipt compatibility

**Files:**
- Modify: `frontend/lib/contracts/FirstFault.test.ts`
- Modify: `frontend/lib/contracts/FirstFault.ts:1-165`

**Interfaces:**
- Consumes: `FirstFault.findSettlementEvidence(workflowId: string): Promise<SettlementEvidence | null>`
- Produces: Receipt success normalization that retains the existing SDK execution and legacy leader-receipt paths and adds finalized transaction consensus success.

- [ ] **Step 1: Write the failing live-shape regression test**

Add a `findSettlementEvidence` test whose history parent mirrors the observed production fields:

```ts
const finalizedParent = {
  ...parent,
  statusName: "FINALIZED",
  result: 6,
  consensus_data: { validators: [{ vote: "AGREE" }, { vote: "AGREE" }, { vote: "AGREE" }] },
  data: { calldata: { readable: JSON.stringify({ args: [workflowId], method: "adjudicate" }) } },
} as GenLayerTransaction;
```

Do not set `txExecutionResultName` or `consensus_data.leader_receipt`. Supply a finalized child transfer and literal workflow/step readbacks whose expected allocation is exactly 11 units to the child recipient. Assert that the returned parent hash and one child are present.

- [ ] **Step 2: Run the regression test and observe the current bug**

Run:

```powershell
npm --prefix frontend test -- lib/contracts/FirstFault.test.ts -t "reconstructs settlement proof from a current Studionet majority receipt"
```

Expected: FAIL because `findSettlementEvidence` returns `null` when `executionSucceeded` cannot find the two older execution fields.

- [ ] **Step 3: Add negative consensus and finality coverage**

Use `it.each` with literal receipt overrides for these rejected parent cases while keeping the exact same calldata and workflow readbacks:

```ts
[
  ["is not finalized", { statusName: "ACCEPTED", result: 6 }],
  ["has no majority", { statusName: "FINALIZED", result: 5 }],
  ["has majority disagreement", { statusName: "FINALIZED", result: 7 }],
  ["has an unknown result", { statusName: "FINALIZED", result: 99 }],
]
```

Assert that every case returns `null` and never requests triggered child transaction IDs.

- [ ] **Step 4: Implement the minimal normalized success path**

Import `TransactionResult` and `TransactionResultNameToNumber` from `genlayer-js/types`, then extend `executionSucceeded` after the two existing paths:

```ts
if (receipt.consensus_data?.leader_receipt?.[0]?.execution_result) {
  return receipt.consensus_data.leader_receipt[0].execution_result === "SUCCESS";
}
return receipt.statusName === TransactionStatus.FINALIZED
  && (
    receipt.resultName === TransactionResult.MAJORITY_AGREE
    || receipt.result === Number(TransactionResultNameToNumber.MAJORITY_AGREE)
  );
```

The explicit legacy-field branch prevents a legacy `ERROR` receipt from being overridden by a contradictory consensus fallback.

- [ ] **Step 5: Run the focused adapter tests**

Run:

```powershell
npm --prefix frontend test -- lib/contracts/FirstFault.test.ts
```

Expected: all tests in `FirstFault.test.ts` pass, including the new live-shape and rejection cases.

- [ ] **Step 6: Commit the adapter regression fix**

```powershell
git add -- frontend/lib/contracts/FirstFault.ts frontend/lib/contracts/FirstFault.test.ts
git commit -m "fix: read current Studionet consensus receipts"
```

### Task 2: Verify the complete frontend behavior

**Files:**
- Verify: `frontend/lib/contracts/FirstFault.ts`
- Verify: `frontend/lib/contracts/FirstFault.test.ts`

**Interfaces:**
- Consumes: the updated `FirstFault` adapter.
- Produces: local evidence that adapter, UI status derivation, types, and production bundle remain valid.

- [ ] **Step 1: Run all non-Localnet frontend tests**

Run:

```powershell
npm --prefix frontend test
```

Expected: all frontend Vitest files pass. If the repository test command includes a known Localnet-only test, exclude only that named file and record the exact excluded command and reason.

- [ ] **Step 2: Run type checking**

Run:

```powershell
npm run lint
```

Expected: TypeScript exits successfully with no errors.

- [ ] **Step 3: Build the production frontend**

Run:

```powershell
npm run build
```

Expected: Next.js production build succeeds.

- [ ] **Step 4: Review branch scope and repository hygiene**

Run:

```powershell
git diff origin/v2-dev...HEAD --check
git status --short
git log --oneline origin/v2-dev..HEAD
```

Expected: no whitespace errors, no uncommitted changes, and only the design, plan, adapter, and regression test commits are present.

### Task 3: Prepare external review and live proof

**Files:**
- Create after preview verification: `deployments/studionet-v3-dispute-evidence.json`
- Test after manifest creation: `frontend/lib/contracts/studionetV3DisputeEvidence.test.ts`

**Interfaces:**
- Consumes: verified local commit, fixed V3 contract `0x9236A835741DF7f891613B5578753647C140124E`, and live workflow `firstfault-v3-writer-breach-20260910-1`.
- Produces: a reviewable PR followed by browser and machine-readable evidence of the repaired production readback.

- [ ] **Step 1: Present the exact push boundary**

Show the user the authenticated GitHub account, remote `https://github.com/tranhop26/firstfault.git`, source branch `fix/studionet-execution-readback`, base `v2-dev`, and exact local commits. Request action-time confirmation before pushing or creating the PR.

- [ ] **Step 2: Verify the preview without a wallet write**

After the approved push and preview build, open the preview and load `firstfault-v3-writer-breach-20260910-1`. Confirm it reports finalized transfer proof for the exact 1 GEN Researcher payout, 1 GEN Publisher payout, and 1 GEN buyer refund. This is read-only and must not prompt or submit a transaction.

- [ ] **Step 3: Record verified dispute evidence**

Create `deployments/studionet-v3-dispute-evidence.json` with the fixed chain ID, contract address, workflow ID, verdict, parent transaction, and the three independently verified child hashes, recipients, values, finality, and `value_credited` state. Add a Vitest file that parses the manifest and asserts exact allocation totals, expected addresses, unique hashes, finalized statuses, and parent linkage.

- [ ] **Step 4: Verify and deliver the evidence commit**

Run the new manifest test, full non-Localnet frontend suite, lint, and build. Commit the manifest and validation test locally. Show the new exact commit and request fresh confirmation before pushing it to the PR.

- [ ] **Step 5: Merge and production promotion gates**

After PR checks and review pass, request a separate merge confirmation. If Vercel does not automatically deploy the merged commit, show the exact project/team/commit and request a separate production-deploy confirmation. Verify the canonical production URL loads the workflow and finalized transfers without a wallet write.
