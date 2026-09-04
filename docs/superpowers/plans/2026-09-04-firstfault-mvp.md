# FirstFault MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and verify a complete GenLayer Studionet MVP that holds simulated GEN for three agent steps, adjudicates the first material breach, and settles only according to finalized contract truth.

**Architecture:** One intentionally frozen Python Intelligent Contract owns workflow state, evidence binding, nondeterministic judgment, and custody accounting. A Next.js frontend and integration runner are clients only; they sign real transactions, track parent finality and triggered transfers, then reconstruct the UI from contract readback.

**Tech Stack:** Python 3.12+, GenLayer SDK runner pinned by the current Studio template, `genlayer-test`/pytest, GenVM linter, GenLayerJS `^1.1.8`, Next.js 16, React 19, TypeScript, TanStack Query, MetaMask, Vitest, Testing Library.

## Global Constraints

- Network is GenLayer Studionet for contract, frontend, funded wallet, manifest, explorer evidence, and demo; never describe it as testnet.
- Studionet GEN is simulated value, not production money or production escrow.
- The contract is `INTENTIONALLY_FROZEN`; no upgrade method, owner verdict override, or mutable adjudication prompt.
- Use the exact version header and `Depends` hash from the current Studio default template at implementation time.
- Use `from genlayer import *` and exactly one `gl.Contract` subclass per module. Current pinned-runner exception: name the FirstFault subclass `FirstFault`, not literal `Contract`, because the installed `genvm-lint` ABI reflection excludes a module class named `Contract`; retain this name until the linter/toolchain is upgraded and the literal-name form validates.
- Persistent money uses `bigint`; bounded counters use sized integers; no bare `int`, `dict`, `list`, or `float` in storage. Before authoritative child-transfer reconciliation, money is represented as `reserved`, `payout_scheduled`, or `refund_scheduled`; scheduled value is not `paid` or `refunded`.
- Public mappings and project policy use `str` keys. Custom storage structures use `@allow_storage @dataclass`.
- Do not assign `TreeMap()` or `DynArray()` inside `__init__`.
- Every nondeterministic call lives inside `gl.eq_principle.*` or `gl.vm.run_nondet`; custom semantic validation defaults to `gl.vm.run_nondet`.
- Read contract storage before the nondeterministic closure and capture immutable values through the closure.
- The validator compares `outcome`, `first_breach_step`, and per-step semantic statuses, not JSON shape or free-form reason text.
- Payout/refund recipients and amounts come only from deterministic storage. The LLM never supplies transfer instructions.
- Decision methods schedule external transfers; there is no application-level `settle()` method.
- Missing, stale, unavailable, malformed, contradictory, or insufficient leader evidence cannot cause payout or refund; it yields `REQUEST_MORE_INFO` or `UNRESOLVED`. A validator disagreement is a GenVM transaction rollback, so the contract remains `DISPUTED` with its hold unchanged; after the frozen dispute timeout, `timeout_dispute_to_unresolved` deterministically exposes the safe recovery state without any transfer.
- Frontend state never advances beyond contract state and must distinguish disconnected, approval, submitted, pending/accepted, finalized, triggered-transfer pending, success, error, unresolved, and readback.
- Never place a private key, token, or secret in source, logs, commits, README, or any `NEXT_PUBLIC_*` variable.
- Before GitHub push, contract deployment, or Vercel deployment, stop for action-time confirmation of the exact GitHub account/repository, deployment wallet, and Vercel team/project.

## Design Contracts Carried into Every Task

- **Trust problem:** the buyer cannot trust worker completion claims; workers cannot trust a buyer's rejection or an orchestrator's forwarded input; no frontend, backend, caller, or deployer may select the verdict.
- **GenLayer decision:** determine the earliest step whose output materially breached its immutable brief and contributed to the final rejection, or return `UNRESOLVED`.
- **On-chain consequence:** release each compliant hold to its stored worker, refund the breached hold to the stored buyer, or preserve disputed holds when unresolved.
- **Evidence binding:** every artifact is bound to chain, contract, workflow, step, actor, brief version/hash, upstream/output hash, source, observation/submission time, deadline, schema version, and nonce.

---

## Target File Structure

```text
firstfault/
├── contracts/
│   └── firstfault.py
├── tests/
│   ├── direct/
│   │   ├── conftest.py
│   │   ├── test_lifecycle.py
│   │   ├── test_evidence.py
│   │   ├── test_custody.py
│   │   ├── test_adjudication.py
│   │   └── test_recovery.py
│   └── integration/
│       ├── fixtures.py
│       └── test_firstfault.py
├── frontend/
│   ├── app/page.tsx
│   ├── components/firstfault/
│   │   ├── WorkflowComposer.tsx
│   │   ├── WorkflowTimeline.tsx
│   │   ├── EvidencePanel.tsx
│   │   ├── VerdictPanel.tsx
│   │   └── TransactionStatus.tsx
│   ├── lib/contracts/FirstFault.ts
│   ├── lib/hooks/useFirstFault.ts
│   └── lib/firstfault/status.ts
├── deploy/deployScript.ts
├── scripts/verifyDeployment.ts
├── docs/
│   ├── DEPLOYMENT_MANIFEST.md
│   ├── PROOF_MATRIX.md
│   ├── RECOVERY.md
│   └── LIMITATIONS.md
├── .env.example
└── README.md
```

### Task 1: Convert the Boilerplate into a Clean FirstFault Baseline

**Files:**
- Delete: `contracts/football_bets.py`
- Delete: `contracts/PatternTest.py`
- Delete: `tests/direct/test_create_bet.py`
- Delete: `tests/direct/test_patterns.py`
- Delete: `tests/direct/test_resolve_bet.py`
- Delete: `tests/direct/test_views.py`
- Delete: `tests/integration/test_football_bets.py`
- Delete: `tests/integration/test_new_features.py`
- Modify: `package.json`
- Modify: `frontend/package.json`
- Create: `.env.example`

**Interfaces:**
- Produces a clean repository whose remaining checks cannot pass because of the football example.
- Adds `npm test` for Vitest and keeps `npm run lint`/`npm run build` as required gates.

- [ ] **Step 1: Record the unmodified baseline**

  Run `python -m pytest tests/direct -v`, `npm ci`, `npm run lint`, and `npm run build`. Save the exact counts in the implementation log; baseline failures must be distinguished from FirstFault failures.

- [ ] **Step 2: Remove example-domain source and tests**

  Delete only the football/pattern files listed above. Retain reusable wallet, UI primitive, and GenLayer client files.

- [ ] **Step 3: Add frontend test dependencies and scripts**

  Add `vitest`, `jsdom`, `@testing-library/react`, and `@testing-library/jest-dom` as frontend dev dependencies. Add these scripts to `frontend/package.json`:

  ```json
  {
    "test": "vitest run",
    "test:watch": "vitest"
  }
  ```

  Add `"test": "cd frontend && npm test"` to the root `package.json` so the repository-wide gate works from the project root.

- [ ] **Step 4: Add a secret-free environment contract**

  `.env.example` contains only:

  ```dotenv
  NEXT_PUBLIC_GENLAYER_RPC_URL=https://studio.genlayer.com/api
  NEXT_PUBLIC_GENLAYER_CHAIN_ID=61999
  NEXT_PUBLIC_CONTRACT_ADDRESS=
  ```

  The empty address is documentation only; runtime code must show a configuration error rather than substituting a fake address.

- [ ] **Step 5: Verify repository hygiene and commit**

  Run `git diff --check`, `git status --short`, and a secret-pattern scan over tracked candidates. Commit as `chore: prepare FirstFault project baseline`.

---

### Task 2: Implement the Authoritative Workflow State Machine

**Files:**
- Create: `contracts/firstfault.py`
- Modify: `tests/direct/conftest.py`
- Create: `tests/direct/test_lifecycle.py`

**Interfaces:**
- `create_workflow(workflow_id: str, orchestrator: Address, researcher: Address, writer: Address, publisher: Address, research_brief: str, writer_brief: str, publisher_brief: str, research_amount: u256, writer_amount: u256, publisher_amount: u256, research_deadline: u256, writer_deadline: u256, publisher_deadline: u256, nonce: str) -> None`
- `start_workflow(workflow_id: str, nonce: str) -> None`
- `get_workflow(workflow_id: str) -> str` returns canonical JSON with decimal strings for money.
- `get_step(workflow_id: str, step_index: u8) -> str` returns canonical JSON.

- [ ] **Step 1: Write lifecycle tests before the contract**

  Cover unique creation, buyer identity from `gl.message.sender_address`, exactly three assigned workers, positive amounts, increasing step deadlines, buyer-only cancellation before start, orchestrator-only start, duplicate nonce rejection, invalid state transitions, and immutable terminal state.

- [ ] **Step 2: Run the focused test and verify RED**

  Run `python -m pytest tests/direct/test_lifecycle.py -v`. The expected failure is absence of `contracts/firstfault.py`, not a fixture/import error.

- [ ] **Step 3: Add storage structures**

  Define `Workflow` and `Step` with `@allow_storage @dataclass`. Store them in `TreeMap[str, Workflow]` and `TreeMap[str, Step]`, using `workflow_id + ":" + str(step_index)` as the step key. Store `deposited`, `reserved`, `payout_scheduled`, `refund_scheduled`, `paid`, and `refunded` as `bigint`; store state/outcome as explicit strings.

- [ ] **Step 4: Implement deterministic guards and views**

  Add private helpers `_workflow`, `_step`, `_require_sender`, `_consume_nonce`, `_require_state`, and `_canonical_json`. Every write verifies actor and state before mutation. Public views serialize storage to canonical JSON rather than returning storage maps.

- [ ] **Step 5: Run GREEN gates and commit**

  Run `genvm-lint check contracts/firstfault.py` and `python -m pytest tests/direct/test_lifecycle.py -v`. Commit as `feat: add authoritative FirstFault state machine`.

---

### Task 3: Add Payable Per-Step Custody and Conservation

**Files:**
- Modify: `contracts/firstfault.py`
- Create: `tests/direct/test_custody.py`

**Interfaces:**
- `fund_workflow(workflow_id: str, nonce: str) -> None` is `@gl.public.write.payable`.
- `accept_workflow(workflow_id: str, nonce: str) -> None` is buyer-only and schedules three stored worker transfers.
- `get_accounting(workflow_id: str) -> str` returns `deposited`, `reserved`, `payout_scheduled`, `refund_scheduled`, `paid`, and `refunded` as decimal strings.

- [ ] **Step 1: Write custody tests first**

  Test zero, partial, excess, duplicate, and unauthorized funding; cancellation refund before start; rejection after start; repeated acceptance; one terminal disposition per hold; and:

  ```python
  assert deposited == reserved + payout_scheduled + refund_scheduled + paid + refunded
  ```

- [ ] **Step 2: Verify RED**

  Run `python -m pytest tests/direct/test_custody.py -v`; failures must identify missing payable/accounting behavior.

- [ ] **Step 3: Implement exact funding and deterministic accounting**

  Require `gl.message.value == research_amount + writer_amount + publisher_amount`. Move value from deposited to reserved exactly once. Use `gl.get_contract_at(worker).emit_transfer(value=u256(amount))` for scheduled native transfers, after confirming the pinned SDK signature.

- [ ] **Step 4: Implement acceptance and pre-start cancellation**

  `accept_workflow` is buyer-only, consumes all three holds into `payout_scheduled`, writes `ACCEPTED_PENDING_FINALITY`/`PAYOUT_SCHEDULED` before scheduling messages, and rejects any repeated decision. Cancellation moves the entire unstarted reserved amount into `refund_scheduled` with `CANCELED_PENDING_FINALITY`/`REFUND_SCHEDULED`. Scheduled transfers are not recorded as `paid` or `refunded` until a later authoritative reconciliation task.

- [ ] **Step 5: Run GREEN gates and commit**

  Run the linter and `python -m pytest tests/direct/test_custody.py -v`. Commit as `feat: hold simulated GEN by workflow step`.

---

### Task 4: Bind Evidence and Agent Dependencies

**Files:**
- Modify: `contracts/firstfault.py`
- Create: `tests/direct/test_evidence.py`
- Create: `frontend/lib/firstfault/evidence.ts`

**Interfaces:**
- `submit_step(workflow_id: str, step_index: u8, output_text: str, upstream_hash: str, source_url: str, observed_at: u256, nonce: str) -> None`
- Canonical evidence domain: chain ID, contract address, workflow ID, step index, actor, brief hash, output hash, upstream hash, source URL, observed timestamp, submission timestamp, deadline, schema version, nonce.

- [ ] **Step 1: Write failing evidence tests**

  Cover wrong worker, wrong step, reused nonce, duplicate submit, changed brief, wrong upstream hash, late output, stale observation, missing Research source, oversized text, and replaying the same artifact in another workflow.

- [ ] **Step 2: Verify RED**

  Run `python -m pytest tests/direct/test_evidence.py -v`; expected failures identify the absent submission API.

- [ ] **Step 3: Implement canonical hashing and dependency binding**

  Hash UTF-8 canonical strings with SHA-256 imported inside the method/helper. Research requires an empty upstream hash; Writer requires Research's stored output hash; Publisher requires Writer's stored output hash. The contract computes hashes and timestamps authoritatively.

- [ ] **Step 4: Implement the matching frontend preview helper**

  `evidence.ts` may preview the same canonical input for the user, but labels it preview-only. Contract-generated hashes remain authoritative.

- [ ] **Step 5: Run GREEN gates and commit**

  Run direct evidence tests and `npm run lint`. Commit as `feat: bind evidence to agent workflow steps`.

---

### Task 5: Add Semantic First-Breach Adjudication

**Files:**
- Modify: `contracts/firstfault.py`
- Create: `tests/direct/test_adjudication.py`

**Interfaces:**
- `open_dispute(workflow_id: str, rejection_reason: str, nonce: str) -> None`
- `adjudicate(workflow_id: str, nonce: str) -> None`
- `timeout_dispute_to_unresolved(workflow_id: str, nonce: str) -> None` is permissionless after the frozen delay from contract-derived `dispute_opened_at`.
- Verdict JSON fields: `outcome`, `first_breach_step`, `step_statuses`, `reasons`, `cited_evidence_hashes`.

- [ ] **Step 1: Write nondeterministic behavior tests first**

  Mock leader/validator outcomes for: all compliant, Writer first breach, insufficient evidence, contradictory evidence, source unavailable, malformed JSON, confidence below threshold, semantically different validator verdict, repeated adjudication, and a caller attempting to choose the prompt or payout.

- [ ] **Step 2: Verify RED**

  Run `python -m pytest tests/direct/test_adjudication.py -v`. Install LLM/web mocks before every nondeterministic transaction; mock registration parameters are a bare dictionary.

- [ ] **Step 3: Freeze the semantic rubric in contract source**

  The prompt evaluates each output against its own `MUST` requirements and exact upstream artifact, distinguishes cosmetic defects from material breach, checks causal contribution to final rejection, and cites only stored evidence. It cannot accept a caller-provided prompt.

- [ ] **Step 4: Implement `gl.vm.run_nondet` validation**

  Read all workflow/step evidence before the closure. The leader may render the Research source URL and returns canonical decision JSON. The validator rejects non-`gl.vm.Return`, independently evaluates the same evidence, and compares outcome, first-breach index, and all three step statuses while ignoring prose differences.

- [ ] **Step 5: Validate results deterministically**

  Reject unknown outcomes, invalid/duplicate step indexes, missing citations, `FIRST_BREACH` without one breached step, contradictory statuses, and any model-generated address or amount. Source failure or low confidence stores `UNRESOLVED` and schedules no transfer. A semantic validator disagreement rolls back the nondeterministic transaction, preserving `DISPUTED`, nonce, and holds; the separately deterministic timeout transition reaches `UNRESOLVED` only after its frozen delay.

- [ ] **Step 6: Schedule verdict-bound transfers**

  For `FIRST_BREACH`, schedule each stored compliant worker payout and breached-hold buyer refund. Update `reserved`, `payout_scheduled`, and `refund_scheduled` exactly once before scheduling external messages; do not mark scheduled transfers `paid` or `refunded` without later authoritative reconciliation.

- [ ] **Step 7: Run GREEN gates and commit**

  Run the linter plus direct adjudication and custody tests. Commit as `feat: adjudicate first material agent breach`.

---

### Task 6: Add Safe Unresolved Recovery

**Files:**
- Modify: `contracts/firstfault.py`
- Create: `tests/direct/test_recovery.py`
- Create: `docs/RECOVERY.md`

**Interfaces:**
- `submit_cure(workflow_id: str, evidence_text: str, source_url: str, observed_at: u256, nonce: str) -> None`
- `propose_mutual_settlement(workflow_id: str, research_amount: u256, writer_amount: u256, publisher_amount: u256, buyer_refund: u256, nonce: str) -> None`
- `approve_mutual_settlement(workflow_id: str, nonce: str) -> None`
- `execute_mutual_settlement(workflow_id: str, nonce: str) -> None`

- [ ] **Step 1: Write recovery tests first**

  Test no transfer on unresolved, one cure only, appended rather than replaced evidence, cure replay rejection, allocation conservation, proposal replacement invalidating approvals, approval by every affected party, execution once, no owner override, no upgrade method, and terminal-state immutability.

- [ ] **Step 2: Verify RED**

  Run `python -m pytest tests/direct/test_recovery.py -v` and confirm failures are missing recovery behavior.

- [ ] **Step 3: Implement one cure and unanimous settlement**

  Cure returns the workflow to adjudication once. Mutual settlement amounts must sum exactly to reserved value; buyer and all three workers approve the exact proposal version on-chain before execution schedules transfers.

- [ ] **Step 4: Document frozen recovery**

  State that V1 cannot be upgraded or administratively migrated. A faulty V1 is disabled for new workflows and replaced by a separately deployed V2; existing holds follow only V1 terminal paths.

- [ ] **Step 5: Run GREEN gates and commit**

  Run all direct tests and the linter. Commit as `feat: add safe unresolved recovery paths`.

---

### Task 7: Prove the Real Contract Lifecycle with Integration Tests

**Files:**
- Modify: `tests/integration/fixtures.py`
- Create: `tests/integration/test_firstfault.py`
- Create: `frontend/lib/contracts/FirstFault.localnet.test.ts`
- Create: `scripts/verifyDeployment.ts`

**Interfaces:**
- Uses separate funded buyer, orchestrator, Research, Writer, and Publisher accounts.
- Produces transaction hashes, parent lifecycle statuses, triggered transaction IDs, before/after balances, and readback for happy, breach, and unresolved cases.
- The TypeScript Localnet test uses the same `FirstFault.ts` client adapter as the browser, proving the frontend contract boundary rather than a second handwritten API.

- [ ] **Step 1: Write integration scenarios before wiring the runner**

  Encode three fixtures: all compliant; Writer introduces a forbidden unsupported metric while Publisher only formats; insufficient/contradictory Writer evidence.

- [ ] **Step 2: Verify the tests fail for missing integration wiring**

  Run `gltest tests/integration/test_firstfault.py -v -s --network localnet`. The failure must be missing deployment/client behavior, not an unmocked LLM call.

- [ ] **Step 3: Implement real client transactions**

  Use `.connect(account).method(args=[...]).transact(value=X)` for value-bearing test writes. Install nondeterministic mocks before adjudication. Never reuse one admin signer for all roles.

- [ ] **Step 4: Add the frontend-to-contract Localnet test**

  Deploy a fresh contract on Localnet, create and fund one workflow through `frontend/lib/contracts/FirstFault.ts`, submit the three steps with separate funded Localnet accounts, and assert the same adapter reads `READY_FOR_REVIEW`. Test-only Localnet accounts are generated and funded by the simulator; no key is committed or exposed to browser code.

- [ ] **Step 5: Track finality and triggered transfers**

  Wait for parent finality, inspect execution success, fetch triggered transaction IDs, wait for every child transfer, read recipient balances, and read contract state again. Do not infer payment from the parent status alone.

- [ ] **Step 6: Run all contract gates and commit**

  Run linter, all direct tests, `gltest tests/integration/test_firstfault.py -v -s --network localnet`, and `npm --prefix frontend test -- FirstFault.localnet.test.ts`. Commit as `test: prove FirstFault lifecycle end to end`.

---

### Task 8: Build the Contract-Truthful Frontend

**Files:**
- Modify: `frontend/app/page.tsx`
- Modify: `frontend/app/globals.css`
- Modify: `frontend/lib/genlayer/client.ts`
- Modify: `frontend/lib/genlayer/WalletProvider.tsx`
- Create: `frontend/lib/contracts/FirstFault.ts`
- Create: `frontend/lib/hooks/useFirstFault.ts`
- Create: `frontend/lib/firstfault/status.ts`
- Create: `frontend/lib/firstfault/status.test.ts`
- Create: `frontend/components/firstfault/WorkflowComposer.tsx`
- Create: `frontend/components/firstfault/WorkflowTimeline.tsx`
- Create: `frontend/components/firstfault/EvidencePanel.tsx`
- Create: `frontend/components/firstfault/VerdictPanel.tsx`
- Create: `frontend/components/firstfault/TransactionStatus.tsx`

**Interfaces:**
- `useFirstFault(workflowId)` exposes contract reads, role-authorized writes, transaction lifecycle, triggered transfers, and refresh-safe readback.
- `projectTransactionStatus(receipt, triggeredReceipts, readback)` returns one explicit UI status without claiming success early.

- [ ] **Step 0: Stop for the user's visual-direction choice**

  Before editing any visible UI, present three distinct responsive mockup directions using the already-fixed workflow and status requirements. The user chooses the visual direction; preserve that choice as the UI acceptance reference. Do not let an implementer select the look autonomously.

- [ ] **Step 1: Write status projection and component tests first**

  Assert that submitted/accepted never renders `Paid`; finalized without child success renders `Transfer pending`; error remains visible; unresolved shows held funds; disconnected and wrong-network states disable writes; refresh derives state from readback.

- [ ] **Step 2: Verify RED**

  Run `npm --prefix frontend test -- lib/firstfault/status.test.ts`; expected failure is missing status module.

- [ ] **Step 3: Add typed contract and wallet integration**

  Use `studionet` from `genlayer-js/chains`, derive the chain ID from the SDK, switch/add the network on connect, pass only the connected address to the GenLayer client, and throw a visible configuration error when the contract address is absent.

- [ ] **Step 4: Build the workflow timeline**

  Present three responsive step cards with actor, immutable brief, hold, upstream/output hash, evidence, and contract status. Display role-aware actions, but keep authorization in the contract.

- [ ] **Step 5: Build dispute, verdict, and transaction evidence views**

  Show rejection reason, outcome, first breach, per-step reason/citation, parent transaction link, triggered transfer links, balance verification, and final contract readback. Label all GEN as simulated Studionet value.

- [ ] **Step 6: Reconcile after every write**

  Wait for the appropriate lifecycle stage, invalidate TanStack queries, fetch child transactions, and read contract state again. Page reload must not depend on local optimistic flags.

- [ ] **Step 7: Run frontend gates and commit**

  Run `npm test`, `npm run lint`, and `npm run build`. Exercise mobile and desktop locally with no uncaught browser console errors. Commit as `feat: add FirstFault contract workflow interface`.

---

### Task 9: Add Deployment, CI, README, and Fixed Evidence Files

**Files:**
- Modify: `deploy/deployScript.ts`
- Create: `.github/workflows/ci.yml`
- Create: `docs/DEPLOYMENT_MANIFEST.md`
- Create: `docs/PROOF_MATRIX.md`
- Create: `docs/LIMITATIONS.md`
- Rewrite: `README.md`

**Interfaces:**
- Deployment output contains network ID, deployer address, contract address, transaction hash, source SHA-256, and receipt status.
- CI runs linter, direct tests, frontend tests, TypeScript lint, and production build.

- [ ] **Step 1: Write manifest verifier tests before deployment changes**

  Make the verifier reject missing source hash, missing address, non-Studionet chain ID, non-finalized receipt, failed execution, and a source hash that differs from `contracts/firstfault.py`.

- [ ] **Step 2: Implement deterministic deployment output**

  Deploy only `contracts/firstfault.py`. Fail when execution is not successful; do not treat `FINALIZED` alone as success. Never write a placeholder address into source or `.env`.

- [ ] **Step 3: Add CI and concise judge documentation**

  README covers problem, decision, consequence, architecture, setup, environment names, tests, deployment, three demo branches, simulated-value label, and limitations. Proof matrix columns are actor, action, method, transaction, finality/success, readback, and source/test.

- [ ] **Step 4: Run the full local gate**

  Run:

  ```powershell
  genvm-lint check contracts/firstfault.py
  python -m pytest tests/direct -v
  gltest tests/integration/test_firstfault.py -v -s --network localnet
  npm test
  npm --prefix frontend test -- FirstFault.localnet.test.ts
  npm run lint
  npm run build
  git diff --check
  ```

- [ ] **Step 5: Review repository hygiene and commit**

  Inspect tracked, staged, and untracked files for secrets, caches, build outputs, chat logs, raw research, and local instruction files. Commit as `docs: add reproducible deployment and evidence package`.

---

### Task 10: External Deployment and Submission Gate

**Files:**
- Update after verified deployment: `docs/DEPLOYMENT_MANIFEST.md`
- Update after live scenarios: `docs/PROOF_MATRIX.md`
- Update after hosting: `README.md`

**Interfaces:**
- Produces exact public repository URL/commit, Studionet contract address and deployment transaction, explorer links, Vercel URL, test results, live scenario evidence, and known limitations.

- [ ] **Step 1: Stop and display identity context**

  Check Git author, active GitHub CLI account, proposed repository owner/remote, deployment wallet and Studionet balance, Vercel account/team/project, and the exact push/deploy actions. Ask for explicit confirmation at that moment.

- [ ] **Step 2: Push only after confirmation**

  Re-run the secret/hygiene scan and push the exact reviewed commit to the confirmed public repository.

- [ ] **Step 3: Deploy the contract only after wallet confirmation**

  Deploy to Studionet, wait for finality, confirm execution success, read the deployed address, compare deployed source hash to the pushed commit, and write the verified manifest.

- [ ] **Step 4: Execute live proof branches**

  Run happy, Writer-breach, and unresolved workflows with funded role accounts. Capture parent transactions, triggered transfers, before/after balances, and contract readbacks.

- [ ] **Step 5: Deploy Vercel only after team/project confirmation**

  Use the environment-provided token without printing it. Test wallet connection, wrong-network handling, one successful live transaction, one important error branch, refresh reconciliation, responsive layout, and browser console.

- [ ] **Step 6: Prepare submission without submitting**

  Present the exact repo, commit, live URL, contract address, transaction links, description, proof matrix, and limitations. Obtain a separate final confirmation before submitting the Portal form.

---

## Definition of Done

- Original FirstFault contract source is present in the public repository and is not a renamed example.
- GenLayer validators evaluate semantic compliance and first breach on-chain.
- Happy, Writer-breach, and unresolved branches have direct, integration, and live evidence.
- Custody accounting conserves value and rejects replay, double claim, and double execution.
- Parent transactions, triggered transfers, recipient balances, and contract readback all agree.
- Frontend signs and reads real contract transactions and survives refresh without fake state.
- Lint, all tests, and production build pass on the final commit.
- Exact commit, source hash, Studionet address, deployment transaction, explorer links, Vercel URL, proof matrix, and limitations are fixed and cross-checked.
