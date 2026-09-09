# FirstFault V3 Custody Safety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an intentionally frozen FirstFault V3 successor that accepts Studio-safe string addresses and cannot retain value from a rejected funding attempt.

**Architecture:** V3 copies the reviewed V2 workflow semantics, replaces the external actor-address boundary with validated strings, and introduces a nonpayable funding intent before the single payable entry point. Every payable call records a uniquely indexed outcome; valid value becomes workflow custody, while every rejected nonzero value schedules a full transfer back to its sender. The frontend performs prepare, readback, fund, outcome readback, and child-transfer reconciliation as separate states.

**Tech Stack:** Python 3.12, GenLayer Intelligent Contracts, `gltest` direct mode, GenLayer Localnet and Studionet, TypeScript, `genlayer-js`, React 19, Next.js 16, Vitest.

## Global Constraints

- V3 is `INTENTIONALLY_FROZEN`; do not add an owner, upgrader, emergency withdrawal, admin verdict, or silent migration path.
- V1 remains the production contract until V3 passes all live proof gates and the user separately confirms the production change.
- V2 at `0x24c060E5394b5bD14a5546B055A7F049f9842987` is historical evidence and is unsafe for production.
- Preserve V2 adjudication, cure, retry, timeout, mutual settlement, snapshot, and replay semantics unless this plan explicitly changes an API boundary.
- Keep `fund_workflow` as the only payable public method.
- Once `fund_workflow` starts, caller-controlled validation failures return a recorded outcome and must not raise.
- Every rejected nonzero funding call schedules an exact full refund to `gl.message.sender_address`.
- Use Studionet chain ID `61999`; label all Studionet GEN as simulated value.
- Never place a contract-address placeholder in source or `.env`.
- Require action-time identity confirmation before GitHub push, Studionet deployment, or Vercel deployment.

---

### Task 1: V3 source and string-address boundary

**Files:**
- Create: `contracts/firstfault_v3.py`
- Create: `tests/direct/test_v3_addresses.py`

**Interfaces:**
- Consumes: V2 workflow state and methods from `contracts/firstfault_v2.py`.
- Produces: `_parse_actor(value: str, field: str) -> Address` and `create_workflow(... actor strings ...) -> None`.

- [ ] **Step 1: Copy V2 as the frozen semantic baseline**

Copy `contracts/firstfault_v2.py` to `contracts/firstfault_v3.py`. Change only the class docstring and version constants needed to identify V3; keep the dependency header and every V2 workflow method.

- [ ] **Step 2: Write failing address-boundary tests**

```python
def test_v3_create_accepts_studio_safe_actor_strings(direct_vm, direct_deploy, direct_accounts):
    contract = direct_deploy("contracts/firstfault_v3.py")
    buyer, orchestrator, researcher, writer, publisher = direct_accounts[:5]
    direct_vm.sender = buyer
    contract.create_workflow(
        "v3-addresses", to_hex(orchestrator), to_hex(researcher),
        to_hex(writer), to_hex(publisher), "r", "w", "p",
        11, 17, 23, EVIDENCE_NOW + 10, EVIDENCE_NOW + 20,
        EVIDENCE_NOW + 30, "create-v3-addresses",
    )
    assert json.loads(contract.get_workflow("v3-addresses"))["orchestrator"] == to_hex(orchestrator)

def create_v3(contract, direct_vm, direct_accounts, orchestrator=None):
    buyer, default_orchestrator, researcher, writer, publisher = direct_accounts[:5]
    direct_vm.sender = buyer
    contract.create_workflow(
        "v3-invalid-address", orchestrator or to_hex(default_orchestrator),
        to_hex(researcher), to_hex(writer), to_hex(publisher),
        "r", "w", "p", 11, 17, 23,
        EVIDENCE_NOW + 10, EVIDENCE_NOW + 20, EVIDENCE_NOW + 30,
        "create-v3-invalid-address",
    )

@pytest.mark.parametrize("bad", ["", "0x0", "0x" + "0" * 40, "0x" + "g" * 40])
def test_v3_rejects_invalid_actor_strings(direct_vm, direct_deploy, direct_accounts, bad):
    contract = direct_deploy("contracts/firstfault_v3.py")
    with direct_vm.expect_revert("Invalid orchestrator address"):
        create_v3(contract, direct_vm, direct_accounts, orchestrator=bad)
```

- [ ] **Step 3: Run the focused tests and verify the old signature fails**

Run: `python -m pytest tests/direct/test_v3_addresses.py -q`

Expected: failure because V3 still expects `Address` values or lacks `_parse_actor`.

- [ ] **Step 4: Implement strict parsing before storage**

```python
def _parse_actor(self, value: str, field: str) -> Address:
    normalized = value.strip()
    if len(normalized) != 42 or not normalized.startswith("0x"):
        raise gl.vm.UserError("Invalid " + field + " address")
    for character in normalized[2:]:
        if character not in "0123456789abcdefABCDEF":
            raise gl.vm.UserError("Invalid " + field + " address")
    if normalized.lower() == "0x" + "0" * 40:
        raise gl.vm.UserError("Invalid " + field + " address")
    return Address(normalized)
```

Change the four actor parameters of `create_workflow` to `str`, parse all four before `_consume_nonce`, and store only parsed `Address` objects. Run the distinct-worker check on parsed addresses.

- [ ] **Step 5: Verify and commit**

Run:

```shell
python -m pytest tests/direct/test_v3_addresses.py -q
genvm-lint check contracts/firstfault_v3.py
```

Expected: all focused tests and GenVM validation pass.

Commit: `feat: add Studio-safe FirstFault V3 address boundary`

---

### Task 2: Funding intent and successful custody entry

**Files:**
- Modify: `contracts/firstfault_v3.py`
- Create: `tests/direct/test_v3_funding.py`

**Interfaces:**
- Consumes: validated V3 workflows in `DRAFT`.
- Produces: `prepare_funding(workflow_id: str, intent_id: str, expires_at: u256, nonce: str) -> None`, `fund_workflow(workflow_id: str, intent_id: str) -> u256`, `get_funding_intent(workflow_id: str) -> str`, `get_funding_outcome(attempt_index: u256) -> str`, and `get_global_accounting() -> str`.

- [ ] **Step 1: Write the successful-intent test**

```python
def test_exact_prepared_funding_becomes_reserved(v3_draft, direct_vm, buyer):
    contract, workflow_id = v3_draft
    direct_vm.sender = buyer
    contract.prepare_funding(workflow_id, "intent-1", EVIDENCE_NOW + 300, "prepare-1")
    direct_vm.value = TOTAL
    attempt = contract.fund_workflow(workflow_id, "intent-1")
    direct_vm.value = 0

    workflow = json.loads(contract.get_workflow(workflow_id))
    outcome = json.loads(contract.get_funding_outcome(attempt))
    totals = json.loads(contract.get_global_accounting())
    assert workflow["state"] == "FUNDED"
    assert workflow["deposited"] == str(TOTAL)
    assert workflow["reserved"] == str(TOTAL)
    assert outcome["result"] == "FUNDED"
    assert outcome["retained"] == str(TOTAL)
    assert totals["total_accepted_funding"] == str(TOTAL)
```

- [ ] **Step 2: Run it red**

Run: `python -m pytest tests/direct/test_v3_funding.py::test_exact_prepared_funding_becomes_reserved -q`

Expected: failure because the intent and outcome storage do not exist.

- [ ] **Step 3: Add the storage models and counters**

```python
@allow_storage
@dataclass
class FundingIntent:
    workflow_id: str
    intent_id: str
    buyer: Address
    expected_amount: bigint
    expires_at: u256
    version: u256
    chain_id: u256
    contract_address: Address
    nonce: str
    intent_hash: str
    consumed: bool

@allow_storage
@dataclass
class FundingOutcome:
    attempt_index: u256
    workflow_id: str
    intent_id: str
    sender: Address
    intent_version: u256
    received: bigint
    retained: bigint
    refund_scheduled: bigint
    reason: str
    result: str
    attempted_at: u256
```

Add `funding_intents`, `funding_outcomes`, `funding_attempt_count`, `total_accepted_funding`, `total_rejected_funding_received`, and the three cumulative scheduled-transfer totals to V3 storage.

- [ ] **Step 4: Implement preparation and the valid funding branch**

`prepare_funding` derives the exact amount from immutable steps, binds `gl.message.chain_id`, `gl.message.contract_address`, workflow, buyer, amount, expiry, nonce, and version in a canonical intent hash, limits expiry to 3,600 seconds, consumes the nonce, and rejects a second unexpired intent. `get_funding_intent` returns those fields as canonical JSON for exact frontend readback.

At the start of `fund_workflow`, increment `funding_attempt_count`. For a fully matching active intent, mark it consumed, retain all value, update workflow accounting and cumulative accepted funding, set state `FUNDED`, record `FundingOutcome(result="FUNDED", reason="")`, and return the attempt index.

- [ ] **Step 5: Verify and commit**

Run: `python -m pytest tests/direct/test_v3_funding.py -q`

Expected: successful funding test passes and no refund transfer is emitted.

Commit: `feat: add FirstFault V3 funding intents`

---

### Task 3: Non-trapping rejected funding and conservation

**Files:**
- Modify: `contracts/firstfault_v3.py`
- Modify: `tests/direct/test_v3_funding.py`

**Interfaces:**
- Consumes: Task 2 funding intents and outcome indices.
- Produces: `_reject_funding(...) -> u256` with reason codes `WORKFLOW_NOT_FOUND`, `WRONG_BUYER`, `INVALID_STATE`, `INTENT_NOT_FOUND`, `INTENT_EXPIRED`, `INTENT_CONSUMED`, `INTENT_MISMATCH`, and `WRONG_AMOUNT`.

- [ ] **Step 1: Write a table-driven failing refund matrix**

```python
@pytest.mark.parametrize("case", [
    "WORKFLOW_NOT_FOUND", "WRONG_BUYER", "INVALID_STATE",
    "INTENT_NOT_FOUND", "INTENT_EXPIRED", "INTENT_CONSUMED",
    "INTENT_MISMATCH", "WRONG_AMOUNT",
])
def test_rejected_value_is_fully_refunded(case, prepared_v3_case, direct_vm):
    contract, sender, workflow_id, intent_id, value = prepared_v3_case(case)
    transfers = capture_transfers(direct_vm)
    direct_vm.sender = sender
    direct_vm.value = value
    attempt = contract.fund_workflow(workflow_id, intent_id)
    direct_vm.value = 0

    outcome = json.loads(contract.get_funding_outcome(attempt))
    assert outcome["result"] == "REFUND_SCHEDULED"
    assert outcome["reason"] == case
    assert outcome["retained"] == "0"
    assert outcome["refund_scheduled"] == str(value)
    assert transfers == [(sender, value)]
```

Add assertions that rejected calls leave the workflow's `deposited`, `reserved`, and state unchanged. Repeat consumed intents and invalid amounts to prove double funding cannot retain value.

- [ ] **Step 2: Run the refund matrix red**

Run: `python -m pytest tests/direct/test_v3_funding.py -q`

Expected: rejected branches still raise or fail to schedule a refund.

- [ ] **Step 3: Implement one no-throw rejection helper**

```python
def _reject_funding(self, attempt_index: u256, workflow_id: str,
                    intent_id: str, intent_version: u256,
                    reason: str, attempted_at: u256) -> u256:
    received = bigint(gl.message.value)
    self.total_rejected_funding_received += received
    self.total_rejected_funding_refund_scheduled += received
    self._store_funding_outcome(
        attempt_index, workflow_id, intent_id, gl.message.sender_address,
        intent_version, received, 0, received, reason,
        "REFUND_SCHEDULED", attempted_at,
    )
    if received > 0:
        _Recipient(gl.message.sender_address).emit_transfer(value=u256(received))
    return attempt_index
```

Perform all caller-controlled checks with conditionals that return through this helper. Do not call `_workflow`, `_require_sender`, `_require_state`, `_consume_nonce`, or any helper that raises after the payable entry begins.

- [ ] **Step 4: Add exact conservation assertions**

Assert after mixed accepted/rejected attempts:

```python
assert totals["total_accepted_funding"] == str(current_reserved + payouts + workflow_refunds)
assert totals["total_rejected_funding_received"] == totals["total_rejected_funding_refund_scheduled"]
assert sum(value for _, value in rejected_refunds) == rejected_inflows
```

- [ ] **Step 5: Verify and commit**

Run:

```shell
python -m pytest tests/direct/test_v3_funding.py -q
python -m pytest tests/direct -q
genvm-lint check contracts/firstfault_v3.py
```

Expected: all V3 funding tests and all existing direct tests pass.

Commit: `fix: refund every rejected V3 funding call`

---

### Task 4: Preserve V2 liveness, evidence, and settlement behavior

**Files:**
- Create: `tests/direct/v3_helpers.py`
- Create: `tests/direct/test_v3_regression.py`
- Modify: `contracts/firstfault_v3.py`

**Interfaces:**
- Consumes: V3 string addresses and prepare/fund sequence.
- Produces: reusable `create_and_fund_v3(...)` test helper and parity evidence for all promoted V2 branches.

- [ ] **Step 1: Add a V3 setup helper**

```python
def create_and_fund_v3(contract, vm, buyer, orchestrator, workers, workflow_id):
    vm.sender = buyer
    terms = evidence_terms()
    contract.create_workflow(
        workflow_id, to_hex(orchestrator), *(to_hex(x) for x in workers),
        terms["research_brief"], terms["writer_brief"],
        terms["publisher_brief"], terms["research_amount"],
        terms["writer_amount"], terms["publisher_amount"],
        terms["research_deadline"], terms["writer_deadline"],
        terms["publisher_deadline"], "create-" + workflow_id,
    )
    contract.prepare_funding(workflow_id, "intent-" + workflow_id,
                             EVIDENCE_NOW + 300, "prepare-" + workflow_id)
    vm.value = TOTAL
    contract.fund_workflow(workflow_id, "intent-" + workflow_id)
    vm.value = 0
```

- [ ] **Step 2: Write parity tests before changing inherited behavior**

Cover successful submission and acceptance, missed-worker adjudication,
buyer-review timeout, semantic `FIRST_BREACH`, safe `UNRESOLVED`, same-evidence
retry, per-worker cure, mutual settlement, nonce replay, and source snapshot
immutability using the V3 setup helper. Assert that acceptance, adjudication,
cancellation, and mutual settlement each update the contract-wide payout/refund
totals, and that accepted funding always equals current reserved value plus the
two workflow scheduled-transfer totals.

- [ ] **Step 3: Run parity tests red and fix only explicit API differences**

Run: `python -m pytest tests/direct/test_v3_regression.py -q`

Expected: failures identify V2 helpers or totals that still assume one-step funding. Update V3 only; do not weaken V2 tests or semantic checks.

- [ ] **Step 4: Run the complete contract suite**

Run: `python -m pytest tests/direct -q`

Expected: all V1, V2, and V3 direct tests pass.

- [ ] **Step 5: Commit**

Commit: `test: prove FirstFault V3 workflow parity`

---

### Task 5: Versioned frontend adapter and truthful transaction results

**Files:**
- Modify: `frontend/lib/genlayer/client.ts`
- Modify: `frontend/lib/contracts/FirstFault.ts`
- Modify: `frontend/lib/contracts/FirstFault.test.ts`
- Modify: `frontend/lib/hooks/useFirstFault.ts`

**Interfaces:**
- Consumes: V3 methods from Tasks 1–3.
- Produces: contract version `"v1" | "v2" | "v3"`, `prepareFunding`, `fundPreparedWorkflow`, `getFundingIntent`, `getFundingOutcome`, and `getGlobalAccounting` adapter methods.

- [ ] **Step 1: Write failing encoding and execution-result tests**

```typescript
it("sends plain actor strings to V3 create_workflow", async () => {
  const adapter = new FirstFault(contractAddress, buyer, undefined, onSubmitted, "v3");
  await adapter.createWorkflow(input);
  expect(client.writeContract).toHaveBeenCalledWith(expect.objectContaining({
    functionName: "create_workflow",
    args: expect.arrayContaining([input.orchestrator, input.researcher, input.writer, input.publisher]),
  }));
});

it("rejects FINALIZED when GenVM execution failed", async () => {
  client.waitForTransactionReceipt.mockResolvedValue({
    statusName: "FINALIZED",
    consensus_data: { leader_receipt: [{ execution_result: "ERROR" }] },
  });
  await expect(adapter.prepareFunding("wf", "intent", 2000n, "nonce"))
    .rejects.toThrow("finalized with failed execution");
});
```

- [ ] **Step 2: Run the focused tests red**

Run: `npm --prefix frontend test -- lib/contracts/FirstFault.test.ts`

- [ ] **Step 3: Implement version-aware calls**

Keep `CalldataAddress` for V1/V2. For V3, pass actor strings unchanged. Add:

```typescript
prepareFunding(workflowId: string, intentId: string, expiresAt: bigint, nonce: string)
fundPreparedWorkflow(workflowId: string, intentId: string, value: bigint)
getFundingIntent(workflowId: string): Promise<FirstFaultFundingIntent>
getFundingOutcome(attemptIndex: bigint): Promise<FirstFaultFundingOutcome>
getGlobalAccounting(): Promise<FirstFaultGlobalAccounting>
```

Require `txExecutionResultName === FINISHED_WITH_RETURN` or leader
`execution_result === "SUCCESS"`; finality alone never passes.

- [ ] **Step 4: Update the hook state machine**

Expose separate phases `PREPARING_FUNDING`, `INTENT_READY`, `FUNDING_PENDING`,
`FUNDING_FINALIZED`, `REFUND_PENDING`, and `SUCCESS`. After each write, read the
authoritative intent/outcome/workflow before advancing.

- [ ] **Step 5: Verify and commit**

Run:

```shell
npm --prefix frontend test -- lib/contracts/FirstFault.test.ts
npm run lint
```

Commit: `feat: add FirstFault V3 frontend adapter`

---

### Task 6: Funding intent and refund UI

**Files:**
- Create: `frontend/components/firstfault/FundingPanel.tsx`
- Modify: `frontend/app/page.tsx`
- Modify: `frontend/components/firstfault/firstfault-ui.test.tsx`
- Modify: `frontend/app/globals.css`

**Interfaces:**
- Consumes: Task 5 hook phases, funding intent, outcome, and child receipts.
- Produces: a user-visible prepare/fund/reconcile sequence with exact simulated GEN amounts and explorer evidence.

- [ ] **Step 1: Write failing UI tests**

```tsx
it("requires a prepared intent before enabling V3 funding", () => {
  render(<FundingPanel version="v3" amount="3000000000000000000"
    intent={null} outcome={null} phase="READY" onPrepare={onPrepare}
    onFund={onFund} />);
  expect(screen.getByRole("button", { name: /fund 3 simulated GEN/i }))
    .toBeDisabled();
});

it("shows a finalized execution error as failed", () => {
  render(<TransactionStatus status={{ phase: "ERROR", label: "Execution failed",
    detail: "Transaction finalized but GenVM rejected the call." }}
    parentHash={parent} childHashes={[]} />);
  expect(screen.getByText(/GenVM rejected/i)).toBeTruthy();
});
```

Add a rejected-funding test that shows the received amount, reason, refund child
status, and explorer links without increasing displayed workflow custody.

- [ ] **Step 2: Run the UI tests red**

Run: `npm --prefix frontend test -- components/firstfault/firstfault-ui.test.tsx`

- [ ] **Step 3: Implement the focused panel**

Render immutable intent bindings, expiry, exact amount, and version. Enable the
payable action only when readback matches the connected buyer and current
workflow. Reconcile a rejected parent only when the child has the exact parent,
contract sender/origin, original caller recipient, full value, `FINALIZED`, and
value credited.

- [ ] **Step 4: Verify accessible behavior and commit**

Run:

```shell
npm --prefix frontend test -- components/firstfault/firstfault-ui.test.tsx
npm --prefix frontend test -- --exclude lib/contracts/FirstFault.localnet.test.ts
npm run lint
npm run build
```

Commit: `feat: show safe V3 funding lifecycle`

---

### Task 7: Real Localnet custody regression

**Files:**
- Modify: `frontend/lib/contracts/FirstFault.localnet.test.ts`
- Create: `tests/integration/test_firstfault_v3.py`
- Modify: `tests/integration/fixtures.py`

**Interfaces:**
- Consumes: compiled V3 source and frontend adapter.
- Produces: node-backed proof for typed addresses, accepted funding, rejected funding refund, final payouts, and balance conservation.

- [ ] **Step 1: Write the failing node-backed scenario**

Deploy V3, create a workflow with three string addresses, prepare and fund with
3 simulated GEN, submit three steps, accept, and reconcile three 1-GEN child
transfers. Then submit 2 GEN against a nonexistent workflow, require an execution
success containing `REFUND_SCHEDULED`, and reconcile one exact 2-GEN refund child.

- [ ] **Step 2: Run against a clean Localnet**

Run:

```shell
gltest tests/integration/test_firstfault_v3.py -v -s
npm --prefix frontend test -- lib/contracts/FirstFault.localnet.test.ts
```

Expected: the new scenario initially fails until every V3 RPC type and child
receipt is handled correctly.

- [ ] **Step 3: Fix only observed integration gaps**

Keep contract state behind receipt finality and exact readback. Do not add sleeps;
poll explicit transaction states with bounded retries.

- [ ] **Step 4: Re-run and commit**

Expected: both Localnet suites pass, contract ending balance and all inflows/outflows reconcile exactly.

Commit: `test: verify V3 custody on Localnet`

---

### Task 8: Guarded V3 deployment and manifest

**Files:**
- Create: `scripts/v3DeploymentEvidence.ts`
- Create: `scripts/writeV3DeploymentManifest.ts`
- Create: `scripts/deployFirstFaultV3.ts`
- Create: `deploy/deployV3.ts`
- Create: `frontend/lib/contracts/v3DeploymentEvidence.test.ts`
- Create: `frontend/lib/contracts/v3DeploymentManifest.test.ts`
- Create: `frontend/lib/contracts/deployFirstFaultV3.test.ts`
- Modify: `package.json`
- Modify: `docs/FIRSTFAULT_V3_CUSTODY_DESIGN.md`

**Interfaces:**
- Consumes: clean tracked `contracts/firstfault_v3.py` and the verified V2 predecessor manifest.
- Produces: `npm run deploy:v3` and immutable `deployments/studionet-v3.json` after finality, source, deployer, and exact 24-method schema verification.

- [ ] **Step 1: Write the deployment gates red**

Require exact methods: the V2 20-method set plus `prepare_funding`,
`get_funding_intent`, `get_funding_outcome`, and `get_global_accounting`. Require normalized source
hash equality, deployer equality, chain ID `61999`, successful execution, V2
predecessor, no manifest overwrite, atomic exclusive publish, and exact-hash
resume without redeployment.

- [ ] **Step 2: Run the focused tests red**

Run:

```shell
npm --prefix frontend test -- lib/contracts/v3DeploymentEvidence.test.ts lib/contracts/v3DeploymentManifest.test.ts lib/contracts/deployFirstFaultV3.test.ts
```

- [ ] **Step 3: Implement the fail-closed deployment path**

Follow the V2 deployment modules but use V3 names, source, method set, and
manifest. Add `"deploy:v3": "tsx deploy/deployV3.ts"`. Keep private keys out of
arguments, files, logs, errors, and manifests.

- [ ] **Step 4: Verify and commit**

Run:

```shell
python -m pytest tests/direct -q
npm --prefix frontend test -- --exclude lib/contracts/FirstFault.localnet.test.ts
genvm-lint check contracts/firstfault_v3.py
npm run lint
npm run lint:deploy
npm run build
```

Commit: `feat: prepare guarded FirstFault V3 deployment`

---

### Task 9: Review, live evidence, and production stop

**Files:**
- Create after confirmed deployment: `deployments/studionet-v3.json`
- Create after exercised flows: `deployments/studionet-v3-live-evidence.json`
- Modify after fixed evidence exists: `README.md`
- Modify after fixed evidence exists: `docs/FIRSTFAULT_V3_CUSTODY_DESIGN.md`

**Interfaces:**
- Consumes: all verified code and deployment tooling.
- Produces: fixed proof matrix for deployment, happy path, invalid-funding refund, missed-worker recovery, review timeout, and consensus retry.

- [ ] **Step 1: Perform the final local review**

Confirm the exact Git commit, source SHA-256, clean status, V1/V2 file integrity,
24-method schema expectation, Git author, GitHub account, remote owner, deployment
wallet, and absence of `studionet-v3.json`. Scan staged/untracked files for
secrets and internal task artifacts.

- [ ] **Step 2: Stop for Studionet deployment confirmation**

State the exact wallet, chain `61999`, source commit/hash, constructor arguments,
and proposed `deploy:v3` action. Do not submit until the user confirms this exact
identity and action context.

- [ ] **Step 3: Deploy, verify, and record**

Wait for `FINALIZED`; require `FINISHED_WITH_RETURN`; read back deployed source
and exact schema; write the manifest only after all checks pass.

- [ ] **Step 4: Stop before each value-bearing live proof action**

Prepare concrete workflow IDs, addresses, values, intent IDs, and expected
effects. Obtain action-time confirmation before funding, rejected-funding refund,
acceptance payouts, adjudication payouts/refunds, or mutual settlement transfers.

- [ ] **Step 5: Fix the proof package**

Record every parent and child transaction hash, status, execution result,
readback, actor, amount, source hash, contract balance, and conservation equation
in `studionet-v3-live-evidence.json`. Map each advertised claim to the proof
matrix or list it as a limitation.

- [ ] **Step 6: Run final verification and commit evidence**

Run the complete direct, frontend, Localnet, lint, deploy-typecheck, build,
manifest, source-hash, explorer, and browser checks. Commit only public source,
tests, manifests, and reviewer-facing documentation.

- [ ] **Step 7: Stop for GitHub push confirmation**

State the exact commit range, active account, remote, branch, and PR. Push only
after the user confirms. Do not merge or change Vercel production in this task.
