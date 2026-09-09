# FirstFault V3 Production Promotion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote the verified FirstFault V3 Studionet contract to the public Vercel frontend through a read-only Preview gate, with an exact V1 rollback record and fixed deployment evidence.

**Architecture:** The application already selects V1/V2/V3 through public build variables, so no contract or frontend behavior change is required. A branch-scoped Vercel Preview proves V3 readback first; production receives the identical four variables only after Preview passes. Preview and production observations are stored separately so repository evidence never claims a deployment before it exists.

**Tech Stack:** Next.js 16, TypeScript 5.9, Vitest 3, GenLayer Studionet chain 61999, Vercel, GitHub Actions.

## Global Constraints

- Studionet RPC is exactly `https://studio.genlayer.com/api`.
- Studionet chain ID is exactly `61999`.
- V3 contract address is exactly `0x9236A835741DF7f891613B5578753647C140124E`.
- Contract version is exactly `v3`.
- Preview verification is read-only and must not submit a transaction or transfer GEN.
- `deployments/vercel.json` remains the V1 production record until V3 production verification succeeds.
- V1 rollback address is `0x2271AE904A97865491e4b24c49532f71B711eD5f` with contract version `v1`.
- Last verified V1 production commit is `f38ea60c3a3a3fde38126c5116c53b88c970518b`.
- Stop for fresh user confirmation before each GitHub push, Vercel environment mutation, Vercel deployment, and merge.
- Never store wallet keys, API keys, Vercel tokens, or other secrets in repository files or command output.

---

### Task 1: Run the V3 promotion preflight

**Files:**
- Read: `deployments/studionet-v3.json`
- Read: `deployments/studionet-v3-live-evidence.json`
- Read: `frontend/lib/genlayer/client.ts`
- Read: `frontend/.env.example`
- Test: `frontend/lib/contracts/v3DeploymentManifest.test.ts`
- Test: `frontend/lib/contracts/v3DeploymentEvidence.test.ts`
- Test: `frontend/lib/contracts/v3LiveEvidence.test.ts`
- Test: `frontend/lib/contracts/FirstFault.test.ts`
- Test: `frontend/components/firstfault/firstfault-ui.test.tsx`

**Interfaces:**
- Consumes: `getContractVersion(): "v1" | "v2" | "v3"`, the fixed V3 manifest, and the fixed V3 custody evidence.
- Produces: a green, local build using the exact V3 public variables and a clean branch ready for external Preview configuration.

- [ ] **Step 1: Verify the fixed V3 deployment and live evidence tests**

Run from `frontend`:

```powershell
npm test -- --run lib/contracts/v3DeploymentManifest.test.ts lib/contracts/v3DeploymentEvidence.test.ts lib/contracts/v3LiveEvidence.test.ts
```

Expected: all selected test files pass and the evidence address is `0x9236A835741DF7f891613B5578753647C140124E`.

- [ ] **Step 2: Verify the V3 adapter and UI tests**

```powershell
npm test -- --run lib/contracts/FirstFault.test.ts components/firstfault/firstfault-ui.test.tsx
```

Expected: all selected adapter and UI tests pass.

- [ ] **Step 3: Build with the exact proposed Preview environment**

```powershell
$env:NEXT_PUBLIC_GENLAYER_RPC_URL='https://studio.genlayer.com/api'
$env:NEXT_PUBLIC_GENLAYER_CHAIN_ID='61999'
$env:NEXT_PUBLIC_CONTRACT_ADDRESS='0x9236A835741DF7f891613B5578753647C140124E'
$env:NEXT_PUBLIC_CONTRACT_VERSION='v3'
npm run build
Remove-Item Env:NEXT_PUBLIC_GENLAYER_RPC_URL,Env:NEXT_PUBLIC_GENLAYER_CHAIN_ID,Env:NEXT_PUBLIC_CONTRACT_ADDRESS,Env:NEXT_PUBLIC_CONTRACT_VERSION
```

Expected: Next.js build and TypeScript checks pass.

- [ ] **Step 4: Confirm repository hygiene**

Run from the repository root:

```powershell
git diff --check
git status --short
rg -n "0x0000000000000000000000000000000000000000" deployments/studionet-v3.json deployments/studionet-v3-live-evidence.json
```

Expected: no unstaged implementation changes, no whitespace errors, and no all-zero address in either V3 evidence file.

### Task 2: Create and verify the V3 branch Preview

**Files:**
- Create after live verification: `deployments/vercel-v3-preview.json`
- Create: `frontend/lib/contracts/v3PreviewEvidence.test.ts`

**Interfaces:**
- Consumes: the current `chore/promote-v3-production` HEAD resolved with `git rev-parse HEAD`; Vercel team `tdh-s-projects`; Vercel project `firstfault`; workflow ID `firstfault-v3-funded-20260909-1`.
- Produces: a fixed Preview URL, deployed commit, exact environment metadata, HTTP observation, V3 workflow/accounting readback, and lineage/payout UI observations.

- [ ] **Step 1: Stop for GitHub push confirmation**

State the exact account `tranhop26`, branch `chore/promote-v3-production`, current commit hash, remote `https://github.com/tranhop26/firstfault.git`, and proposed PR base `v2-dev`. Do not push until the user confirms.

- [ ] **Step 2: Push the promotion branch and create its PR**

```powershell
git push -u origin chore/promote-v3-production
@'
FirstFault production still uses V1. This PR prepares a branch-scoped Vercel Preview using the verified V3 Studionet deployment before any Production environment change.

Preview configuration:
- Contract: 0x9236A835741DF7f891613B5578753647C140124E
- Contract version: v3
- Chain: Studionet 61999

Validation:
- npm test -- --run lib/contracts/v3DeploymentManifest.test.ts lib/contracts/v3DeploymentEvidence.test.ts lib/contracts/v3LiveEvidence.test.ts
- npm test -- --run lib/contracts/FirstFault.test.ts components/firstfault/firstfault-ui.test.tsx
- npm run build with the exact V3 public environment
'@ | Set-Content -LiteralPath .tmp-v3-promotion-pr.md
gh pr create --base v2-dev --head chore/promote-v3-production --title "chore: promote FirstFault V3 to production" --body-file .tmp-v3-promotion-pr.md
Remove-Item -LiteralPath .tmp-v3-promotion-pr.md
```

- [ ] **Step 3: Stop for the branch-scoped Vercel environment confirmation**

Present these exact Preview-only changes for team `tdh-s-projects`, project `firstfault`, Git branch `chore/promote-v3-production`:

```text
NEXT_PUBLIC_GENLAYER_RPC_URL=https://studio.genlayer.com/api
NEXT_PUBLIC_GENLAYER_CHAIN_ID=61999
NEXT_PUBLIC_CONTRACT_ADDRESS=0x9236A835741DF7f891613B5578753647C140124E
NEXT_PUBLIC_CONTRACT_VERSION=v3
```

Explain that the change affects Preview builds for this branch and does not modify Production. Do not save the Vercel settings until the user confirms.

- [ ] **Step 4: Set the branch Preview variables and redeploy**

Use the Vercel project settings UI for `tdh-s-projects/firstfault`. Scope every variable to Preview and branch `chore/promote-v3-production`, save them, then redeploy the latest PR Preview. Do not change Production variables.

- [ ] **Step 5: Verify the deployed Preview without a wallet**

Open the Vercel Preview URL in a clean browser state and load workflow `firstfault-v3-funded-20260909-1`. Verify:

```text
contractAddress = 0x9236A835741DF7f891613B5578753647C140124E
state = ACCEPTED_PENDING_FINALITY
deposited = 3000000000000000000
reserved = 0
payoutScheduled = 3000000000000000000
researchOutputHash = 84186d09dd99247312dd24a0cb1885cccf688cb70c0141a9c0f52c358ae9e202
writerOutputHash = e57bdf62a2b2e0ac5b53b9c7c1ea32db246834fccabb7f746a536f5d9378c7de
publisherOutputHash = e57bdf62a2b2e0ac5b53b9c7c1ea32db246834fccabb7f746a536f5d9378c7de
finalizedTransfers = 3
transferValueEach = 1000000000000000000
```

Expected: the page reads successfully without connecting a wallet and labels all three transfers finalized.

- [ ] **Step 6: Write the fixed Preview evidence**

Copy the verified HTTPS Preview URL to the clipboard, then create the evidence from live and repository-derived values:

```powershell
$previewCommit = (git rev-parse HEAD).Trim()
$previewUrl = (Get-Clipboard).Trim()
$verifiedAt = (Get-Date).ToUniversalTime().ToString('o')
$previewEvidence = [ordered]@{
  schemaVersion = 1
  project = 'firstfault'
  teamSlug = 'tdh-s-projects'
  environment = 'preview'
  branch = 'chore/promote-v3-production'
  deploymentCommit = $previewCommit
  url = $previewUrl
  verifiedAt = $verifiedAt
  configuration = [ordered]@{
    rpcUrl = 'https://studio.genlayer.com/api'
    chainId = 61999
    contractAddress = '0x9236A835741DF7f891613B5578753647C140124E'
    contractVersion = 'v3'
  }
  http = [ordered]@{ status = 200 }
  readback = [ordered]@{
    workflowId = 'firstfault-v3-funded-20260909-1'
    state = 'ACCEPTED_PENDING_FINALITY'
    deposited = '3000000000000000000'
    reserved = '0'
    payoutScheduled = '3000000000000000000'
    readWithoutWallet = $true
    transferProofLabel = 'Transfers finalized'
    finalizedTransferCount = 3
  }
}
$previewEvidence | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath deployments/vercel-v3-preview.json
```

Before saving, verify `$previewUrl` starts with `https://` and is the branch Preview opened and inspected in Step 5.

- [ ] **Step 7: Write the failing Preview evidence test before saving final evidence values**

Create `frontend/lib/contracts/v3PreviewEvidence.test.ts`:

```typescript
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const ADDRESS = "0x9236A835741DF7f891613B5578753647C140124E";
const HASH = /^[0-9a-f]{40}$/i;

describe("V3 Vercel Preview evidence", () => {
  test("binds the Preview to the verified V3 contract and terminal workflow", async () => {
    const path = resolve(process.cwd(), "../deployments/vercel-v3-preview.json");
    const evidence = JSON.parse(await readFile(path, "utf8"));

    expect(evidence).toMatchObject({
      schemaVersion: 1,
      project: "firstfault",
      teamSlug: "tdh-s-projects",
      environment: "preview",
      branch: "chore/promote-v3-production",
      configuration: {
        rpcUrl: "https://studio.genlayer.com/api",
        chainId: 61999,
        contractAddress: ADDRESS,
        contractVersion: "v3",
      },
      http: { status: 200 },
      readback: {
        workflowId: "firstfault-v3-funded-20260909-1",
        state: "ACCEPTED_PENDING_FINALITY",
        deposited: "3000000000000000000",
        reserved: "0",
        payoutScheduled: "3000000000000000000",
        readWithoutWallet: true,
        transferProofLabel: "Transfers finalized",
        finalizedTransferCount: 3,
      },
    });
    expect(evidence.deploymentCommit).toMatch(/^[0-9a-f]{40}$/i);
    expect(new URL(evidence.url).protocol).toBe("https:");
    expect(Number.isNaN(Date.parse(evidence.verifiedAt))).toBe(false);
    expect(ADDRESS.slice(2)).toMatch(HASH);
  });
});
```

- [ ] **Step 8: Run the Preview evidence test**

```powershell
npm test -- --run lib/contracts/v3PreviewEvidence.test.ts
```

Expected: PASS after the actual Preview evidence values are saved.

- [ ] **Step 9: Commit the Preview evidence**

```powershell
git add deployments/vercel-v3-preview.json frontend/lib/contracts/v3PreviewEvidence.test.ts
git diff --cached --check
git commit -m "test: record V3 Vercel preview evidence"
```

### Task 3: Complete review and merge the promotion PR

**Files:**
- Read: `deployments/vercel-v3-preview.json`
- Read: `frontend/lib/contracts/v3PreviewEvidence.test.ts`

**Interfaces:**
- Consumes: the fixed Preview evidence commit from Task 2.
- Produces: a reviewed merge commit on `v2-dev`, automatically fast-forwarded to `main`, with green post-merge CI.

- [ ] **Step 1: Run the complete non-Localnet verification set**

```powershell
npm test -- --run --exclude lib/contracts/FirstFault.localnet.test.ts
npm run build
```

Expected: all selected tests and the production build pass. Run the Localnet test separately only when `127.0.0.1:4000` is available.

- [ ] **Step 2: Stop for the Preview evidence push confirmation**

State the exact GitHub account, commit hash, branch, remote, and PR URL. Push only after confirmation:

```powershell
git push origin chore/promote-v3-production
```

- [ ] **Step 3: Wait for all PR checks**

```powershell
gh pr checks --watch --interval 10
```

Expected: Direct Mode Tests, Branch Policy, and Vercel all pass.

- [ ] **Step 4: Stop for merge confirmation and merge without deleting the source branch**

After confirmation:

```powershell
gh pr merge --merge
```

Expected: the PR state is `MERGED`; `origin/v2-dev` and `origin/main` resolve to the same merge commit after the Fast-forward main workflow completes.

- [ ] **Step 5: Verify post-merge CI**

```powershell
git fetch origin --prune
git rev-parse origin/v2-dev
git rev-parse origin/main
gh run list --branch v2-dev --limit 5
```

Expected: both branch hashes match and the push-triggered Direct Mode Tests pass.

### Task 4: Promote the verified V3 configuration to Production

**Files:**
- Modify only after live verification: `deployments/vercel.json`
- Create: `frontend/lib/contracts/vercelProductionEvidence.test.ts`

**Interfaces:**
- Consumes: the merged commit from Task 3, the verified Preview configuration, Vercel team `tdh-s-projects`, and project `firstfault`.
- Produces: one V3 production deployment at `https://firstfault.vercel.app`, a fixed production manifest, and a test that binds that manifest to the actual deployment.

- [ ] **Step 1: Stop for Production environment and deployment confirmation**

Present the current V1 values, the exact four V3 values from Global Constraints, the merged commit, canonical URL, Vercel team/project, and rollback values. Obtain one action-time confirmation that explicitly authorizes saving the Production variables and deploying that commit.

- [ ] **Step 2: Set the four Production variables and deploy once**

Use the Vercel project settings UI for `tdh-s-projects/firstfault`. Scope the variables to Production, save them, and deploy the merged `main` commit. Do not trigger a second production deployment unless the first one fails and the user confirms a retry.

- [ ] **Step 3: Verify production without a wallet**

At `https://firstfault.vercel.app`, verify HTTP 200 and repeat every readback assertion from Task 2 Step 5. Confirm the displayed contract is `0x9236A835741DF7f891613B5578753647C140124E` and the funding UI is the guarded V3 flow.

- [ ] **Step 4: Roll back on failed production readback**

If any assertion fails, stop normal promotion, report the exact failed assertion, restore address `0x2271AE904A97865491e4b24c49532f71B711eD5f` and version `v1`, and redeploy commit `f38ea60c3a3a3fde38126c5116c53b88c970518b` only after fresh rollback confirmation.

- [ ] **Step 5: Update the production evidence manifest**

Update `deployments/vercel.json` with the actual production deployment commit, V3 environment including `NEXT_PUBLIC_CONTRACT_VERSION`, verification timestamp, HTTP result, and a new `v3TerminalReadback` object containing the exact Task 2 Step 5 observations. Preserve prior V1 proof under a `predecessor` object rather than deleting it.

- [ ] **Step 6: Write the production evidence test**

Create `frontend/lib/contracts/vercelProductionEvidence.test.ts` to assert:

```typescript
expect(evidence.environment).toMatchObject({
  NEXT_PUBLIC_GENLAYER_RPC_URL: "https://studio.genlayer.com/api",
  NEXT_PUBLIC_GENLAYER_CHAIN_ID: "61999",
  NEXT_PUBLIC_CONTRACT_ADDRESS: "0x9236A835741DF7f891613B5578753647C140124E",
  NEXT_PUBLIC_CONTRACT_VERSION: "v3",
});
expect(evidence.http).toMatchObject({ status: 200, containsProjectTitle: true });
expect(evidence.liveChecks.v3TerminalReadback).toMatchObject({
  workflowId: "firstfault-v3-funded-20260909-1",
  state: "ACCEPTED_PENDING_FINALITY",
  deposited: "3000000000000000000",
  reserved: "0",
  payoutScheduled: "3000000000000000000",
  transferProof: "Transfers finalized",
  finalizedTransferCount: 3,
  readWithoutWallet: true,
});
expect(evidence.predecessor).toMatchObject({
  contractAddress: "0x2271AE904A97865491e4b24c49532f71B711eD5f",
  contractVersion: "v1",
  deploymentCommit: "f38ea60c3a3a3fde38126c5116c53b88c970518b",
});
```

- [ ] **Step 7: Run evidence and regression verification**

```powershell
npm test -- --run lib/contracts/vercelProductionEvidence.test.ts lib/contracts/v3LiveEvidence.test.ts lib/contracts/FirstFault.test.ts components/firstfault/firstfault-ui.test.tsx
npm run build
```

Expected: all selected tests and build pass.

- [ ] **Step 8: Commit the production evidence locally**

```powershell
git add deployments/vercel.json frontend/lib/contracts/vercelProductionEvidence.test.ts
git diff --cached --check
git commit -m "docs: record verified V3 production deployment"
```

- [ ] **Step 9: Stop for final evidence push and PR confirmation**

State the exact account, commit, new evidence branch, remote, and proposed PR base. Push and create the final evidence PR only after confirmation. Wait for CI, obtain merge confirmation, merge to `v2-dev`, and verify `main` fast-forwards to the same commit.

### Task 5: Final completion audit

**Files:**
- Read: `deployments/studionet-v3.json`
- Read: `deployments/studionet-v3-live-evidence.json`
- Read: `deployments/vercel-v3-preview.json`
- Read: `deployments/vercel.json`

**Interfaces:**
- Consumes: all fixed deployment, custody, Preview, and production evidence.
- Produces: a completion report that distinguishes deployed facts from local verification and lists no unresolved value or configuration mismatch.

- [ ] **Step 1: Verify source, contract, and frontend binding**

Confirm all four files identify chain 61999 and V3 address `0x9236A835741DF7f891613B5578753647C140124E`; confirm the V3 source SHA-256 remains `7164c7edf6bd2def6dce69615b4acce0f8899ffa7fa094b8cd59f6c1df426617`.

- [ ] **Step 2: Verify custody conservation**

Confirm rejected funding received equals finalized refund, accepted funding equals the three finalized payouts, and the V3 contract balance remains `0`.

- [ ] **Step 3: Verify repository and deployment state**

Confirm the evidence PR is merged, `origin/v2-dev` equals `origin/main`, post-merge CI passes, the working tree is clean, and the canonical production URL returns HTTP 200 with the V3 workflow readback.

- [ ] **Step 4: Report completion with material limits**

Report the production URL, contract address, deployment and evidence commits, terminal workflow ID, test/build results, and rollback pointer. Do not claim additional dispute/recovery branches are production-proven unless their own fixed V3 live evidence exists.
