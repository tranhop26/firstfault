# Studio Next Submission Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for inline execution, or superpowers:subagent-driven-development only when the user explicitly requests delegation. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make FirstFault's public repository and Agent Tank submission copy accurately document the active Studio Next deployment, verified happy path, finalized payouts, and mandatory demo video.

**Architecture:** Keep the deployed contract and production frontend unchanged. Add one immutable machine-readable evidence artifact, then make `README.md` and `docs/SUBMISSION.md` consume the same verified identifiers and Explorer proofs so reviewers see one consistent Studio Next story.

**Tech Stack:** Markdown, JSON, Git, GenLayer Studio Next Explorer, Node.js/npm verification, Python/GenVM contract tests already present in the repository.

## Global Constraints

- Network is Studio Next with RPC `https://studio-next.genlayer.com/api` and chain ID `61997`.
- Active contract is `0xf7136eDe8ba1761562fEcb2147609F3A2932c449`.
- Active demo workflow is `firstfault-studio-next-final-20260917-1`.
- Mandatory demo video is `https://www.youtube.com/watch?v=yV5kURhk76g`.
- Required frontend releases remain `@genlayer/transaction-kit@0.1.0-rc.2`, `@genlayer/transaction-kit-react@0.1.0-rc.2`, and `genlayer-js@2.0.0-rc.1`.
- Do not change contract source, frontend behavior, deployment configuration, wallet state, or on-chain state.
- A transaction is successful evidence only when its finality and execution/value result are independently recorded.
- Preserve Studionet material only as explicitly historical evidence.

---

### Task 1: Record the Studio Next happy-path evidence

**Files:**
- Create: `deployments/studio-next-happy-path.json`

**Interfaces:**
- Consumes: the verified deployment manifest in `deployments/studio-next-v3.json` and Explorer proof for the completed workflow.
- Produces: one JSON source of truth used by the README and Portal submission copy.

- [ ] **Step 1: Create the evidence JSON with exact network and actor bindings**

Use this top-level structure and exact identities:

```json
{
  "schemaVersion": 1,
  "project": "FirstFault",
  "network": {
    "name": "Studio Next",
    "rpcUrl": "https://studio-next.genlayer.com/api",
    "chainId": 61997,
    "explorerUrl": "https://explorer-studio-dev.genlayer.com"
  },
  "contract": {
    "version": "v3",
    "address": "0xf7136eDe8ba1761562fEcb2147609F3A2932c449",
    "deploymentTransactionHash": "0x48491dfc5f18ab2cdc6c74e37e9a427261c3964e5220c61c5e5178108af76a0a"
  },
  "workflow": {
    "id": "firstfault-studio-next-final-20260917-1",
    "buyer": "0x21b45103dd05c43969daF3CbB4277391777e2eC7",
    "orchestrator": "0x21b45103dd05c43969daF3CbB4277391777e2eC7",
    "workers": {
      "research": "0x21b45103dd05c43969daF3CbB4277391777e2eC7",
      "writer": "0x70dbCE2459FC9771a2110c14F4F93C08e16975d4",
      "publisher": "0x38c06bce3459949570A337BDC734CD5225d31985"
    },
    "holdsGen": ["10", "10", "10"]
  }
}
```

- [ ] **Step 2: Add lifecycle transactions with finality and result evidence**

Record these actions as ordered objects with `status: "FINALIZED"`, `executionResult: "SUCCESS"`, and a canonical Explorer URL:

```text
create_workflow  0x8a5a42d91b8e96b5c3efd99347ae4fac9f4b8029d87613d0a6b6546b88cdf5db
prepare_funding  0xbf8d0a1df0e1cd3af707f4264c5ecce4419fb0198c8c513bd562347efe035b3b
fund_workflow     0x2e51f45d00f3958faee2b20a4f982a6f5816257322fc0b82c83eaa03e1c2dd28
start_workflow    0x9109c19cae3eb3b314f31db12dbeb5d9efcda57712131ab85c7509be16d733b8
submit_research   0x07d1d032a04accdb1f079477cf114caf7ac30cb25015627777341a7af8bcc87e
submit_writer     0x500ab8717137c9cb7b24a5ff55d54023259baa6155d4323cf04eed35f5c14408
submit_publisher  0xe5f7f2133458ceefcb55480fd47d780c7b605fb1b15bdf97ef229c05c8546251
accept_workflow   0xd396f50e33e776b056251f6ff86bf40d7dbb35de39d0df1b98ba3f8a30f80c4d
```

- [ ] **Step 3: Add evidence lineage and output hashes**

Record the contract readback values:

```text
Research evidence  76a40c70f6e3c1168ec6fc72764726e8605158ef254dc16c72bb551569879ff5
Research output    8f7797d9b5d77bc04f7bd6252ea080dc3b8e4f902c4c74c6c8e1a8e2ebd80cf5
Writer evidence    3ac194e473f9c5cf53fea9b515724d93a55e27f5fe81cef0ad9dd72881f1766e
Writer output      5689f5f2a63515385374e1268165c2b448eae5fd7bc386717b63a932b36bc194
Publisher evidence 2c28d03c7fa9b7080f2d60996cb5611adc28811184a0265f470fc022e2cd3d07
Publisher output   5689f5f2a63515385374e1268165c2b448eae5fd7bc386717b63a932b36bc194
```

Store these complete lowercase SHA-256 values exactly. Keep the verified upstream-equality assertions as booleans.

- [ ] **Step 4: Add the exact finalized payout mapping**

Record three `10 GEN` triggered external transfers with `status: "FINALIZED"` and `valueCredited: true`:

```text
Researcher 0x21b45103dd05c43969daF3CbB4277391777e2eC7
  0x8454136cef08bd373e50f0f0313955ec7b7d16981a2e605fc48b99558369a620
Writer 0x70dbCE2459FC9771a2110c14F4F93C08e16975d4
  0x9b4cdd19059374cf58abdf3399bef1f2f0e25321423cc0fd9a25519aa5ddc37b
Publisher 0x38c06bce3459949570A337BDC734CD5225d31985
  0x6c9050b30ab5e85c75e775d632262b437f621354355bb148fdb856e6dd5d5079
```

Add accounting assertions: deposited `30`, payout scheduled `30`, finalized payout `30`, refund scheduled `0`, reserved `0`.

- [ ] **Step 5: Parse and inspect the artifact**

Run:

```powershell
Get-Content deployments\studio-next-happy-path.json -Raw | ConvertFrom-Json | ConvertTo-Json -Depth 20 | Out-Null
git diff --check -- deployments/studio-next-happy-path.json
```

Expected: both commands exit successfully with no output from `git diff --check`.

- [ ] **Step 6: Commit the evidence artifact**

```powershell
git add deployments/studio-next-happy-path.json
git commit -m "docs: record Studio Next happy-path evidence"
```

---

### Task 2: Make the README describe the active Studio Next application

**Files:**
- Modify: `README.md:41-103`
- Modify: `README.md:104-138`
- Modify: `README.md:139-189`

**Interfaces:**
- Consumes: `deployments/studio-next-happy-path.json` from Task 1.
- Produces: the primary public reviewer walkthrough and evidence matrix.

- [ ] **Step 1: Add exact release dependencies to Requirements**

State that the existing frontend uses Transaction Kit RC2 and `genlayer-js` RC1 with the exact versions from Global Constraints. Keep install instructions as `npm ci`.

- [ ] **Step 2: Correct the environment example**

Replace the blank Studio Next build example with:

```text
NEXT_PUBLIC_CONTRACT_ADDRESS=0xf7136eDe8ba1761562fEcb2147609F3A2932c449
NEXT_PUBLIC_CONTRACT_VERSION=v3
```

- [ ] **Step 3: Replace the obsolete Live application statement and judge demo**

The new walkthrough must say production is connected to Studio Next and instruct reviewers to:

1. Open `https://firstfault.vercel.app`.
2. Paste `firstfault-studio-next-final-20260917-1` into Workflow ID.
3. Select Inspect case; wallet connection is not required for readback.
4. Verify three submitted evidence artifacts, exact Writer→Publisher output lineage, `30 GEN` deposited, `0 GEN` reserved, and finalized payout proof.
5. Open the accept parent and all three child transaction links.

- [ ] **Step 4: Add Studio Next happy-path rows to the evidence matrix**

Add concise rows for creation/funding/start, the three worker submissions, acceptance, and three finalized payouts. Link each row to the hashes from Task 1 and state the authoritative readback consequence.

- [ ] **Step 5: Update the machine-readable evidence list**

Add `deployments/studio-next-happy-path.json` before the historical Studionet evidence files.

- [ ] **Step 6: Verify no active-production contradiction remains**

Run:

```powershell
rg -n "still serves the historical Studionet|promoting the public site remains|NEXT_PUBLIC_CONTRACT_ADDRESS=$|firstfault-v3-writer-breach-20260910-1" README.md
git diff --check -- README.md
```

Expected: the first command returns no matches; `git diff --check` succeeds.

- [ ] **Step 7: Commit the README refresh**

```powershell
git add README.md
git commit -m "docs: promote Studio Next production evidence"
```

---

### Task 3: Refresh the Agent Tank Portal submission copy

**Files:**
- Modify: `docs/SUBMISSION.md:1-141`

**Interfaces:**
- Consumes: the same identifiers and links as Tasks 1 and 2.
- Produces: paste-ready Portal fields that do not contradict README or production.

- [ ] **Step 1: Replace active-network language and proof links**

Change active references from Studionet/chain `61999` to Studio Next/chain `61997`. Set the contract and deployment links to the Studio Next address and transaction from Global Constraints. Historical Studionet proof may be mentioned only as earlier development evidence.

- [ ] **Step 2: Rewrite the live judge demo around the completed Studio Next workflow**

Use the same five-step read-only walkthrough as README. Describe the verified Research → Writer → Publisher lineage and accept-all settlement of `10 + 10 + 10 = 30 GEN`.

- [ ] **Step 3: Preserve the GenLayer judging explanation**

Keep the semantic first-breach problem and validator design explanation. Explicitly distinguish it from the featured happy path: the deployed contract uses validator consensus for disputed natural-language evidence, while the Studio Next happy path proves fees, persistent state, custody, authorization, evidence lineage, and external settlement.

- [ ] **Step 4: Replace the mandatory video and Portal field values**

Set:

```text
Demo video: https://www.youtube.com/watch?v=yV5kURhk76g
Contract link: https://explorer-studio-dev.genlayer.com/address/0xf7136eDe8ba1761562fEcb2147609F3A2932c449
Website: https://firstfault.vercel.app
GitHub: https://github.com/tranhop26/firstfault
```

Update the summary, overview, three how-to steps, and expected verification outcome so all values fit their documented Portal character limits.

- [ ] **Step 5: Scan for obsolete active proof**

Run:

```powershell
rg -n "dByU9s1dngc|chain ID `61999`|firstfault-v3-writer-breach-20260910-1|explorer-studio\.genlayer\.com/address/0x9236" docs/SUBMISSION.md
git diff --check -- docs/SUBMISSION.md
```

Expected: no obsolete matches and no whitespace errors.

- [ ] **Step 6: Commit the Portal copy**

```powershell
git add docs/SUBMISSION.md
git commit -m "docs: refresh Agent Tank Studio Next submission"
```

---

### Task 4: Run release and submission verification

**Files:**
- Verify: `package.json`
- Verify: `frontend/package.json`
- Verify: `deployments/studio-next-v3.json`
- Verify: `deployments/studio-next-happy-path.json`
- Verify: `README.md`
- Verify: `docs/SUBMISSION.md`

**Interfaces:**
- Consumes: all documentation and evidence changes from Tasks 1-3.
- Produces: an evidence-backed go/no-go result for branch integration.

- [ ] **Step 1: Verify release dependency pins and deployment evidence**

Run:

```powershell
npm --prefix frontend test -- lib/genlayer/releaseDependencies.test.ts lib/contracts/verifyDeployment.test.ts lib/contracts/deploymentManifest.test.ts
```

Expected: every selected Vitest test passes.

- [ ] **Step 2: Run frontend type checking**

```powershell
npm run lint
```

Expected: TypeScript exits zero.

- [ ] **Step 3: Run the full non-Localnet test suite**

```powershell
npm --prefix frontend test -- --exclude lib/contracts/FirstFault.localnet.test.ts
```

Expected: all tests pass; the unavailable Localnet suite is the only excluded file.

- [ ] **Step 4: Run the production build**

```powershell
npm run build
```

Expected: Next.js production build exits zero.

- [ ] **Step 5: Verify documentation consistency and repository hygiene**

```powershell
Get-Content deployments\studio-next-happy-path.json -Raw | ConvertFrom-Json | Out-Null
rg -n "yV5kURhk76g|firstfault-studio-next-final-20260917-1|0xf7136eDe8ba1761562fEcb2147609F3A2932c449|61997" README.md docs/SUBMISSION.md deployments/studio-next-happy-path.json
git diff --check
git status --short
```

Expected: current Studio Next identifiers appear in all three artifacts, no diff errors exist, and only intentional changes are present.

---

### Task 5: Prepare the reviewed branch for public integration

**Files:**
- Verify: complete branch diff against `origin/main`

**Interfaces:**
- Consumes: all verified commits from Tasks 1-4.
- Produces: a pushed, reviewable branch ready for a normal pull request or merge.

- [ ] **Step 1: Review the complete branch delta**

```powershell
git fetch origin
git log --oneline origin/main..HEAD
git diff --stat origin/main...HEAD
git status --short
```

Expected: the branch includes the Studio Next migration and wallet/finality fixes plus the refreshed submission evidence; the worktree is clean.

- [ ] **Step 2: Push the verified branch without rewriting history**

```powershell
git push origin fix/multi-wallet-provider-selection
```

Expected: a normal fast-forward push succeeds. Do not force push.

- [ ] **Step 3: Report the integration checkpoint**

Provide the final commit hashes, verification results, production URL, contract URL, workflow ID, acceptance parent, three child payout links, and demo video. Stop before creating or merging a pull request unless the user explicitly chooses that integration action after reviewing the completed diff.
