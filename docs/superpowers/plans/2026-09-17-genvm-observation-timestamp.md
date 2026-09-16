# GenVM Observation Timestamp Safety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent Studio Next fee simulation from rejecting current FirstFault evidence as `Observation is in the future`.

**Architecture:** Add one pure frontend timestamp helper that applies a fixed 60-second safety margin and clamps at zero. Route both evidence submissions through it, then extend the existing Studio simulation-clock recovery so only the exact future-observation error retries once with an explicit GenVM datetime; leave the frozen contract, custody flow, and fee-confirmation gate unchanged.

**Tech Stack:** TypeScript 5.9, Vitest 3.2, React 19, Next.js 16, `genlayer-js@2.0.0-rc.1`, Transaction Kit RC2, Vercel.

## Global Constraints

- Keep Studio Next RPC `https://studio-next.genlayer.com/api` and chain ID `61997` unchanged.
- Keep contract address `0xf7136eDe8ba1761562fEcb2147609F3A2932c449` unchanged.
- Keep the Intelligent Contract intentionally frozen; do not edit or redeploy it.
- Apply an exact 60-second observation safety margin within the contract's 3,600-second freshness window.
- Preserve explicit fee review and user approval before every wallet signature.
- Do not alter workflow `firstfault-studio-next-happy-20260917-1` or its 30 GEN custody except through the already-authorized demo actions.

---

## File Structure

- Create `frontend/lib/firstfault/observationTimestamp.ts`: pure, deterministic observation timestamp calculation.
- Create `frontend/lib/firstfault/observationTimestamp.test.ts`: unit coverage for the safety margin and zero clamp.
- Create `frontend/lib/hooks/useFirstFaultTimestamp.test.ts`: source-level regression gate proving both evidence paths use the helper.
- Modify `frontend/lib/hooks/useFirstFault.ts`: import and use the helper in `submitStep` and `submitCure` only.

### Task 1: Add the timestamp safety helper with TDD

**Files:**
- Create: `frontend/lib/firstfault/observationTimestamp.ts`
- Test: `frontend/lib/firstfault/observationTimestamp.test.ts`

**Interfaces:**
- Consumes: `nowMilliseconds: number`, defaulting to `Date.now()`.
- Produces: `observationTimestamp(nowMilliseconds?: number): bigint`.

- [ ] **Step 1: Write the failing helper tests**

```ts
import { describe, expect, it } from "vitest";

import { observationTimestamp } from "./observationTimestamp";

describe("observationTimestamp", () => {
  it("stays 60 seconds behind the supplied wall clock", () => {
    expect(observationTimestamp(1_000_000)).toBe(940n);
  });

  it("never returns a negative timestamp", () => {
    expect(observationTimestamp(59_000)).toBe(0n);
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run from `frontend`:

```powershell
npm test -- lib/firstfault/observationTimestamp.test.ts
```

Expected: FAIL because `./observationTimestamp` does not exist.

- [ ] **Step 3: Implement the minimum helper**

```ts
const OBSERVATION_SAFETY_MARGIN_SECONDS = 60;

export function observationTimestamp(nowMilliseconds = Date.now()): bigint {
  const nowSeconds = Math.floor(nowMilliseconds / 1_000);
  return BigInt(Math.max(0, nowSeconds - OBSERVATION_SAFETY_MARGIN_SECONDS));
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

```powershell
npm test -- lib/firstfault/observationTimestamp.test.ts
```

Expected: 2 tests pass with no warnings or errors.

- [ ] **Step 5: Commit the helper**

```powershell
git add -- frontend/lib/firstfault/observationTimestamp.ts frontend/lib/firstfault/observationTimestamp.test.ts
git commit -m "fix: add GenVM observation timestamp margin"
```

### Task 2: Route both evidence write paths through the helper

**Files:**
- Modify: `frontend/lib/hooks/useFirstFault.ts:1-20,352-363`
- Test: `frontend/lib/hooks/useFirstFaultTimestamp.test.ts`

**Interfaces:**
- Consumes: `observationTimestamp()` from Task 1.
- Produces: `submitStep` and `submitCure` contract calls whose `observed_at` argument uses the shared safe timestamp.

- [ ] **Step 1: Write the failing source regression test**

```ts
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("FirstFault evidence timestamp wiring", () => {
  it("uses the shared safe timestamp for step and cure submissions", async () => {
    const source = await readFile(resolve(process.cwd(), "lib/hooks/useFirstFault.ts"), "utf8");
    expect(source).toContain('import { observationTimestamp } from "../firstfault/observationTimestamp";');
    expect(source.match(/observationTimestamp\(\)/g)).toHaveLength(2);
    expect(source).not.toMatch(/submit(?:Step|Cure)[\s\S]{0,240}Date\.now\(\)/);
  });
});
```

- [ ] **Step 2: Run the regression test and verify RED**

```powershell
npm test -- lib/hooks/useFirstFaultTimestamp.test.ts
```

Expected: FAIL because the helper import and calls are absent.

- [ ] **Step 3: Make the minimum hook change**

Add the import with the other local imports:

```ts
import { observationTimestamp } from "../firstfault/observationTimestamp";
```

Replace only the two raw timestamps:

```ts
submitStep: (stepIndex: number, output: string, upstreamHash: string, sourceUrl: string) =>
  run(async () => (await contract!.submitStep(workflowId, stepIndex, output, upstreamHash, sourceUrl, observationTimestamp(), nonce(`step-${stepIndex}`))).receipt),
```

```ts
submitCure: (evidenceText: string, sourceUrl: string) =>
  run(() => contract!.submitCure(workflowId, evidenceText, sourceUrl, observationTimestamp(), nonce("cure"))),
```

- [ ] **Step 4: Run both focused tests and verify GREEN**

```powershell
npm test -- lib/firstfault/observationTimestamp.test.ts lib/hooks/useFirstFaultTimestamp.test.ts
```

Expected: all focused tests pass.

- [ ] **Step 5: Commit the hook wiring**

```powershell
git add -- frontend/lib/hooks/useFirstFault.ts frontend/lib/hooks/useFirstFaultTimestamp.test.ts
git commit -m "fix: use safe timestamps for evidence writes"
```

### Task 3: Recover stale Studio evidence simulations with TDD

**Files:**
- Modify: `frontend/lib/contracts/FirstFault.ts:170-210,310-330`
- Test: `frontend/lib/contracts/FirstFault.test.ts`

**Interfaces:**
- Consumes: decoded Studio receipt errors and the original `sim_estimateTransactionFees` parameters.
- Produces: one clock-refreshed fee simulation for `submit_step` and `submit_cure` only when the decoded result equals `Observation is in the future`.

- [ ] **Step 1: Add failing adapter tests**

Add a parameterized test covering both `submit_step` and `submit_cure`. Mock `estimateTransactionFeesForWrite` to reject with a Studio receipt whose result is base64 for `Observation is in the future`, mock `client.request` with a valid recommended preset, and assert the request includes:

```ts
{
  method: "sim_estimateTransactionFees",
  params: [{
    ...originalParams,
    sim_config: { genvm_datetime: "2026-09-17T00:00:00.000Z" },
  }],
}
```

Also extend the unrelated-error test to assert `client.request` and `client.writeContract` are not called.

- [ ] **Step 2: Run the adapter tests and verify RED**

```powershell
npm test -- lib/contracts/FirstFault.test.ts
```

Expected: the new evidence-clock cases fail because only `prepare_funding` currently supports the simulation-clock retry.

- [ ] **Step 3: Generalize the exact-error parser and retry gate**

Replace the funding-only parser with:

```ts
function simulationParamsForContractError(
  error: unknown,
  expectedMessage: string,
): UnknownRecord | undefined {
  const cause = asRecord(asRecord(error)?.cause);
  const data = asRecord(cause?.data);
  const receipt = asRecord(data?.receipt);
  if (decodeStudioContractResult(receipt?.result) !== expectedMessage) return undefined;
  return asRecord(data?.params);
}
```

In `estimateWriteFees`, map `prepare_funding` to `Invalid funding intent expiry`, map `submit_step` and `submit_cure` to `Observation is in the future`, and return the original error unchanged for every other function or decoded message. Retry once with the existing `sim_config.genvm_datetime` request and normalization.

- [ ] **Step 4: Run focused tests and verify GREEN**

```powershell
npm test -- lib/contracts/FirstFault.test.ts lib/firstfault/observationTimestamp.test.ts lib/hooks/useFirstFaultTimestamp.test.ts
```

Expected: all adapter and timestamp tests pass.

- [ ] **Step 5: Commit the simulation recovery**

```powershell
git add -- frontend/lib/contracts/FirstFault.ts frontend/lib/contracts/FirstFault.test.ts
git commit -m "fix: refresh GenVM clock for evidence simulation"
```

### Task 4: Verify, deploy, and prove the live fix

**Files:**
- Verify only: `frontend/`
- Update after successful deployment if the repository's existing evidence convention requires it: `deployments/vercel.json`

**Interfaces:**
- Consumes: the tested frontend from Tasks 1-2 and the existing Vercel project serving `https://firstfault.vercel.app`.
- Produces: a production deployment where Research fee simulation reaches fee review; no Research transaction is signed without a new explicit user confirmation.

- [ ] **Step 1: Run the full automated verification suite**

Run from `frontend`:

```powershell
npm test
npm run lint
npm run build
```

Expected: Vitest exits 0, TypeScript exits 0, and Next.js production build exits 0.

- [ ] **Step 2: Confirm repository hygiene before publication**

Run from the repository root:

```powershell
git status --short
git log -3 --oneline
git diff HEAD~2..HEAD -- frontend/lib/firstfault/observationTimestamp.ts frontend/lib/firstfault/observationTimestamp.test.ts frontend/lib/hooks/useFirstFault.ts frontend/lib/hooks/useFirstFaultTimestamp.test.ts
```

Expected: only intentional tracked changes are committed; the frozen contract and environment files are unchanged.

- [ ] **Step 3: Obtain action-time approval and publish the tested commit**

After reporting the exact branch and commit, obtain explicit user approval for the GitHub push and Vercel production deployment. Then push the current branch and deploy that exact commit through the connected Vercel project.

Expected: Vercel reports a successful production deployment for `https://firstfault.vercel.app`.

- [ ] **Step 4: Verify the production artifact and contract configuration**

Open `https://firstfault.vercel.app`, confirm HTTP 200, connect MetaMask, and inspect `firstfault-studio-next-happy-20260917-1`. Verify the UI reads:

```text
Chain ID: 61997
Contract: 0xf7136eDe8ba1761562fEcb2147609F3A2932c449
Workflow state: IN_PROGRESS
Deposited: 30 GEN
Reserved: 30 GEN
```

- [ ] **Step 5: Re-run Research fee simulation without signing**

Enter the approved Research output and source URL, click `Submit Research output`, and verify the `Approve submit step` fee-review dialog appears instead of `Observation is in the future`.

Expected: the dialog displays the exact refundable maximum fee and value `0 GEN`. Stop there and request a fresh action-time confirmation before `Continue to wallet`.

- [ ] **Step 6: Record deployment evidence and commit it if required**

If `deployments/vercel.json` is updated, record the exact deployed commit, Vercel deployment ID, production URL, Studio Next environment, verification time, and live workflow readback. Validate the corresponding evidence test before committing:

```powershell
npm test -- lib/contracts/vercelProductionEvidence.test.ts
git add -- ../deployments/vercel.json lib/contracts/vercelProductionEvidence.test.ts
git commit -m "docs: record Vercel timestamp fix evidence"
```

Expected: the evidence test passes and every recorded identifier matches the deployed artifact.
