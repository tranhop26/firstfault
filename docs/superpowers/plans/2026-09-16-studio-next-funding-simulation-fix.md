# Studio Next Funding Simulation Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Studio Next `prepare_funding` produce a trustworthy fee quote and recognize finalized `SUCCESS` execution evidence.

**Architecture:** Keep the frozen Intelligent Contract and address unchanged. Add a narrow compatibility path in the TypeScript contract boundary: retry only the known timestamp-expiry simulation with an explicit current GenVM datetime, normalize Studio's recommended fee preset, and reuse the existing confirmation/submission pipeline. Use one execution-evidence predicate for both readback and submitted writes.

**Tech Stack:** TypeScript 5.9, Vitest 3.2, Next.js 16, `genlayer-js@2.0.0-rc.1`, Transaction Kit RC2, Studio Next chain `61997`.

## Global Constraints

- Do not modify or redeploy `contracts/firstfault_v3.py`.
- Keep contract `0xf7136eDe8ba1761562fEcb2147609F3A2932c449` and chain `61997`.
- Retry only decoded result `Invalid funding intent expiry` with original encoded RPC params present.
- Estimation remains read-only; fail closed for malformed data.
- Preserve the 15-minute real intent lifetime and all action-time confirmations.
- Use a new workflow for live proof because the existing research deadline elapsed.

## File structure

- Modify `frontend/lib/contracts/FirstFault.ts`: simulation recovery, preset normalization, receipt success normalization.
- Modify `frontend/lib/contracts/FirstFault.test.ts`: regression and fail-closed tests.
- No contract, ABI, dependency, or environment files change.

### Task 1: Recover the exact Studio timestamp simulation failure

**Files:**
- Modify: `frontend/lib/contracts/FirstFault.ts:150-274`
- Test: `frontend/lib/contracts/FirstFault.test.ts:75-180`

**Interfaces:**
- Consumes: `estimateTransactionFeesForWrite(request)` and error shape `{ cause: { data: { params, receipt: { result } } } }`.
- Produces: `estimateWriteFees(request)` returning `{ distribution, messageAllocations?, feeValue }`.
- Produces: a retry through `client.request({ method: "sim_estimateTransactionFees", params: [...] })`.

- [ ] **Step 1: Write the failing timestamp-retry test**

Use fake time `2026-09-16T15:29:22.506Z` and define `const account = "0x0000000000000000000000000000000000000009" as Address;`. Make `estimateTransactionFeesForWrite` reject with:

```ts
const originalParams = { type: "write", to: contractAddress, from: account, data: "0x1234" };
client.estimateTransactionFeesForWrite.mockRejectedValueOnce({
  cause: {
    data: {
      params: originalParams,
      receipt: { result: "AUludmFsaWQgZnVuZGluZyBpbnRlbnQgZXhwaXJ5" },
    },
  },
});
```

Make `client.request` resolve with a receipt containing this preset:

```ts
{
  receipt: {
    execution_result: "SUCCESS",
    genvm_result: {
      fee_accounting: {
        recommended_fee_preset: {
          distribution: {
            leaderTimeunitsAllocation: 100,
            validatorTimeunitsAllocation: 200,
            appealRounds: 0,
            executionBudgetPerRound: 153459600000000,
            executionConsumed: 0,
            totalMessageFees: 0,
            rotations: [3],
            maxPriceGenPerTimeUnit: 2,
            storageFeeMaxGasPrice: 300000000,
            receiptFeeMaxGasPrice: 300000000,
          },
          feeValue: 613838400010352,
          messageAllocations: [],
        },
      },
    },
  },
}
```

Call `prepareFunding`. Assert the retry reuses `originalParams` and adds only:

```ts
sim_config: { genvm_datetime: "2026-09-16T15:29:22.506Z" }
```

Assert `writeContract` receives `feeValue: 613838400010352n`, `executionBudgetPerRound: 153459600000000n`, and `rotations: [3n]`.

- [ ] **Step 2: Run the focused test and verify RED**

```powershell
npm --prefix frontend test -- lib/contracts/FirstFault.test.ts -t "retries the known funding expiry simulation"
```

Expected: FAIL because the initial estimation error is propagated and `client.request` is not called.

- [ ] **Step 3: Add characterization tests for fail-closed behavior**

```ts
it("does not retry unrelated fee simulation errors", async () => {
  const account = "0x0000000000000000000000000000000000000009" as Address;
  client.estimateTransactionFeesForWrite.mockRejectedValueOnce(new Error("Buyer only"));
  const adapter = new FirstFault(contractAddress, account, undefined, undefined, "v3");
  await expect(adapter.prepareFunding("v3-demo", "intent-1", 2000n, "prepare-1"))
    .rejects.toThrow("Buyer only");
  expect(client.request).not.toHaveBeenCalled();
  expect(client.writeContract).not.toHaveBeenCalled();
});

it("fails closed when Studio omits the recommended preset", async () => {
  const account = "0x0000000000000000000000000000000000000009" as Address;
  client.estimateTransactionFeesForWrite.mockRejectedValueOnce(expirySimulationError);
  client.request.mockResolvedValueOnce({ receipt: { execution_result: "SUCCESS" } });
  const adapter = new FirstFault(contractAddress, account, undefined, undefined, "v3");
  await expect(adapter.prepareFunding("v3-demo", "intent-1", 2000n, "prepare-1"))
    .rejects.toThrow("Studio fee simulation returned no valid recommended preset");
  expect(client.writeContract).not.toHaveBeenCalled();
});
```

Extract the repeated exact error object from Step 1 into test-local constant `expirySimulationError`; do not add test-only exports to production code.

- [ ] **Step 4: Implement minimal decoding and validation**

Add:

```ts
type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | undefined {
  return typeof value === "object" && value !== null ? value as UnknownRecord : undefined;
}

function decodeStudioContractResult(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const bytes = Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
    return new TextDecoder().decode(bytes.slice(1));
  } catch {
    return undefined;
  }
}
```

Implement `fundingExpirySimulationParams(error)` by reading `error.cause.data.receipt.result`, requiring the exact decoded error, and returning only `data.params` when it is a record.

Implement `normalizeStudioRecommendedPreset(result)`. Accept `result.receipt ?? result`, require `genvm_result.fee_accounting.recommended_fee_preset`, validate all distribution integers and rotations, convert them and `feeValue` to `bigint`, and preserve `messageAllocations`. Do not invent defaults. Use one strict converter:

```ts
function requiredBigInt(record: UnknownRecord, key: string): bigint {
  const value = record[key];
  if (typeof value === "bigint") return value;
  try {
    if (typeof value === "string") return BigInt(value);
    if (typeof value === "number" && Number.isSafeInteger(value)) return BigInt(value);
  } catch {
    throw new Error("Studio fee simulation returned no valid recommended preset");
  }
  throw new Error("Studio fee simulation returned no valid recommended preset");
}
```

Build the returned distribution explicitly from these required keys: `leaderTimeunitsAllocation`, `validatorTimeunitsAllocation`, `appealRounds`, `executionBudgetPerRound`, `executionConsumed`, `totalMessageFees`, `rotations`, `maxPriceGenPerTimeUnit`, `storageFeeMaxGasPrice`, and `receiptFeeMaxGasPrice`. Require `rotations` to be an array and map each element through the same integer validation. Require `messageAllocations` to be an array when present.

- [ ] **Step 5: Implement the narrow retry**

Add private `estimateWriteFees(request)`. Call normal estimation first. On failure, rethrow unless `request.functionName === "prepare_funding"` and `fundingExpirySimulationParams` succeeds. Retry:

```ts
const result = await (this.client as unknown as {
  request(args: { method: string; params: [UnknownRecord] }): Promise<unknown>;
}).request({
  method: "sim_estimateTransactionFees",
  params: [{
    ...params,
    sim_config: { genvm_datetime: new Date().toISOString() },
  }],
});
return normalizeStudioRecommendedPreset(result);
```

Change only the browser branch in `write()` to use `this.estimateWriteFees(request)`. Keep endpoint/localnet behavior unchanged.

- [ ] **Step 6: Verify GREEN**

```powershell
npm --prefix frontend test -- lib/contracts/FirstFault.test.ts -t "funding expiry simulation|unrelated fee simulation|recommended preset"
```

Expected: all targeted tests PASS.

- [ ] **Step 7: Commit**

```powershell
git add frontend/lib/contracts/FirstFault.ts frontend/lib/contracts/FirstFault.test.ts
git commit -m "fix: recover Studio Next funding fee simulation"
```

### Task 2: Recognize Studio Next successful receipts

**Files:**
- Modify: `frontend/lib/contracts/FirstFault.ts:174-193,264-272`
- Test: `frontend/lib/contracts/FirstFault.test.ts:468-479`

**Interfaces:**
- Consumes: accepted/finalized `GenLayerTransaction` plus `FINISHED_WITH_RETURN` or leader `SUCCESS`.
- Produces: `submittedWriteSucceeded(receipt)` requiring decided status and successful execution evidence.

- [ ] **Step 1: Write the failing receipt test**

```ts
it("accepts a finalized Studio Next write with SUCCESS execution evidence", async () => {
  const account = "0x0000000000000000000000000000000000000009" as Address;
  client.waitForTransactionReceipt.mockResolvedValueOnce({
    ...parent,
    statusName: "FINALIZED",
    txExecutionResultName: "SUCCESS",
    consensus_data: { leader_receipt: [{ execution_result: "SUCCESS" }] },
  });
  const adapter = new FirstFault(contractAddress, account, undefined, undefined, "v3");
  await expect(adapter.prepareFunding("v3-demo", "intent-1", 2000n, "prepare-1"))
    .resolves.toMatchObject({ statusName: "FINALIZED" });
});
```

- [ ] **Step 2: Verify RED**

```powershell
npm --prefix frontend test -- lib/contracts/FirstFault.test.ts -t "accepts a finalized Studio Next write"
```

Expected: FAIL with the current `without FINISHED_WITH_RETURN` error.

- [ ] **Step 3: Implement minimal normalization**

Change `executionSucceeded` in this order:

```ts
if (receipt.txExecutionResultName === ExecutionResult.FINISHED_WITH_RETURN) return true;
const leaderExecution = receipt.consensus_data?.leader_receipt?.[0]?.execution_result;
if (leaderExecution) return leaderExecution === "SUCCESS";
if (receipt.txExecutionResultName) return false;
```

Then retain the historical finalized-majority fallback. Change `submittedWriteSucceeded` to `return decided && executionSucceeded(receipt)`. Update the error text to `without successful execution evidence`.

- [ ] **Step 4: Verify success and explicit failure**

```powershell
npm --prefix frontend test -- lib/contracts/FirstFault.test.ts -t "Studio Next write|GenVM execution failed"
```

Expected: Studio `SUCCESS` resolves and leader `ERROR` rejects.

- [ ] **Step 5: Run the complete boundary suite and commit**

```powershell
npm --prefix frontend test -- lib/contracts/FirstFault.test.ts
git add frontend/lib/contracts/FirstFault.ts frontend/lib/contracts/FirstFault.test.ts
git commit -m "fix: accept Studio Next success receipts"
```

### Task 3: Repository-wide verification

**Files:** verify only.

- [ ] **Step 1: Run all tests**

```powershell
npm test
```

Expected: exit code 0 and all Vitest suites PASS.

- [ ] **Step 2: Type-check and build**

```powershell
npm run lint
npm run build
```

Expected: both exit code 0.

- [ ] **Step 3: Review state and diff**

```powershell
git status --short
git diff HEAD~2 --check
git diff HEAD~2 -- frontend/lib/contracts/FirstFault.ts frontend/lib/contracts/FirstFault.test.ts
```

Expected: no unrelated files or whitespace errors.

- [ ] **Step 4: Review before completion**

Use `requesting-code-review`; fix verified findings with fresh RED/GREEN cycles. Then use `verification-before-completion` and rerun the commands above before claiming success.

### Task 4: Deploy and verify a fresh live workflow

**Files:** no source changes expected.

- [ ] **Step 1: Confirm GitHub identity and push scope**

Show branch, commits, remote repository, and authenticated identity. Obtain explicit confirmation, then run:

```powershell
git push origin fix/multi-wallet-provider-selection
```

- [ ] **Step 2: Confirm Vercel target in Chrome**

Using Chrome control only, inspect the signed-in Vercel account/team and project connected to `firstfault.vercel.app`. Present them and obtain action-time deployment confirmation.

- [ ] **Step 3: Deploy and verify identity**

Deploy the reviewed commit. Verify production URL, commit, chain `61997`, and contract `0xf7136eDe8ba1761562fEcb2147609F3A2932c449`.

- [ ] **Step 4: Create a fresh workflow**

Use a new ID and fresh future deadlines. Before submission, present account, chain, contract, zero transferred value, and maximum fee; submit only after confirmation.

- [ ] **Step 5: Prepare funding**

Verify the production UI now returns a fee quote instead of the expiry error. Present the maximum fee and submit only after confirmation. Confirm authoritative funding-intent readback.

- [ ] **Step 6: Fund**

Present the simulated GEN transfer and fee separately; submit only after confirmation. Verify explorer finality, retained value, reserved accounting, and `FUNDED` state.

- [ ] **Step 7: Capture evidence**

Record deployment identity, wallet, chain, contract, transaction hashes, explorer links, execution evidence, and contract readbacks. Label all Studio Next GEN as simulated test value.
