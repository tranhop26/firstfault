# FirstFault Verified Deployment Evidence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a fail-closed Studionet deployment path that verifies the finalized FirstFault source and schema before atomically recording a deployment manifest, then replace inherited sample documentation with truthful FirstFault instructions.

**Architecture:** Keep network I/O in a small deployment orchestrator and keep receipt, source, schema, and manifest validation in pure functions covered by Vitest. The CLI entry creates the authenticated Studionet client from an environment-only key, submits exactly one contract deployment, waits for finality, performs live readback, and writes evidence only after every gate succeeds.

**Tech Stack:** TypeScript 5.9, Node.js `crypto` and `fs/promises`, `genlayer-js` 1.1.8, Vitest 3.2, Python 3.12, GenLayer direct mode and Localnet integration tests.

## Global Constraints

- Network is GenLayer Studionet with chain ID `61999`.
- Canonical evidence links use `https://explorer-studio.genlayer.com/address/{contractAddress}` and `https://explorer-studio.genlayer.com/tx/{deploymentTransactionHash}`.
- Contract source is exactly `contracts/firstfault.py` and constructor arguments are an empty array.
- Contract classification is `INTENTIONALLY_FROZEN`; no privileged upgrade or administrative verdict path may be introduced.
- `GENLAYER_DEPLOYER_PRIVATE_KEY` is environment-only and must never be logged, serialized, persisted, committed, or included in an error.
- No manifest may be written before `FINALIZED`, successful execution, non-zero address extraction, exact source readback equality, and exact 17-method schema equality.
- A live contract address remains empty in committed environment examples; no fake address or transaction hash may be advertised as deployment evidence.
- GitHub push, Studionet deployment, and Vercel deployment each require a fresh action-time identity check and explicit user confirmation.
- Studionet GEN must be described as simulated test value, never production money.

---

## File Structure

- Create `scripts/deploymentEvidence.ts`: pure constants, hashing, private-key shape validation, source/schema comparison, and evidence result types.
- Modify `scripts/verifyDeployment.ts`: finalized receipt validation plus injected-client live source/schema readback.
- Create `scripts/writeDeploymentManifest.ts`: manifest validation, safe log projection, overwrite refusal, and atomic JSON write.
- Create `scripts/deployFirstFault.ts`: testable one-transaction deployment orchestration with dependency injection.
- Modify `deploy/deployScript.ts`: environment-backed executable entry that constructs the authenticated Studionet client.
- Modify `frontend/lib/contracts/verifyDeployment.test.ts`: receipt, source, schema, key, and live-readback unit coverage.
- Create `frontend/lib/contracts/deploymentManifest.test.ts`: manifest validation, secret exclusion, overwrite, and atomic-write coverage.
- Create `frontend/lib/contracts/deployFirstFault.test.ts`: success ordering and fail-closed orchestration coverage using an in-memory client.
- Modify `package.json` and `package-lock.json`: add the `tsx` deployment runner and explicit deployment verification commands.
- Modify `tsconfig.json`: type-check only the root deployment and verification scripts with strict Node.js types.
- Modify `.env.example` and `frontend/.env.example`: FirstFault-only variable documentation with empty contract address.
- Replace `README.md`: FirstFault architecture, state and custody semantics, commands, deployment evidence, and limitations.

### Task 1: Pure deployment evidence and live verification

**Files:**
- Create: `scripts/deploymentEvidence.ts`
- Modify: `scripts/verifyDeployment.ts`
- Modify: `frontend/lib/contracts/verifyDeployment.test.ts`

**Interfaces:**
- Produces: `EXPECTED_FIRSTFAULT_METHODS: readonly string[]`.
- Produces: `normalizeSource(value: string): string`, converting CRLF to LF and making no other content change.
- Produces: `sha256Hex(value: string): string`.
- Produces: `assertPrivateKey(value: string | undefined): asserts value is \`0x${string}\``.
- Produces: `verifySourceAndSchema(expectedSource: string, deployedSource: string, schema: ContractSchemaLike): LiveDeploymentEvidence`.
- Produces: `verifyDeploymentReceipt(receipt: DeploymentReceiptLike): { contractAddress: Address; executionResult: "FINISHED_WITH_RETURN" }`.
- Produces: `verifyLiveDeployment(client: DeploymentReadClient, contractAddress: Address, expectedSource: string): Promise<LiveDeploymentEvidence>`.

- [ ] **Step 1: Expand receipt and live-readback tests with exact failures**

Add fixtures and assertions to `frontend/lib/contracts/verifyDeployment.test.ts`:

```ts
const ADDRESS = "0x1111111111111111111111111111111111111111" as const;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const SOURCE = "class FirstFault: pass\n";
const method = () => ({});
const validSchema = () => ({
  methods: Object.fromEntries(EXPECTED_FIRSTFAULT_METHODS.map((name) => [name, method()])),
});

test.each([
  [{ statusName: "ACCEPTED", txExecutionResultName: "FINISHED_WITH_RETURN", to_address: ADDRESS }, "not finalized"],
  [{ statusName: "FINALIZED", txExecutionResultName: "FINISHED_WITH_ERROR", to_address: ADDRESS }, "execution failed"],
  [{ statusName: "FINALIZED", txExecutionResultName: "FINISHED_WITH_RETURN", to_address: ZERO_ADDRESS }, "no contract address"],
])("rejects invalid deployment receipt %#", (receipt, message) => {
  expect(() => verifyDeploymentReceipt(receipt)).toThrow(message);
});

test("rejects a deployed source mismatch", () => {
  expect(() => verifySourceAndSchema("class FirstFault: pass\n", "class Other: pass\n", validSchema()))
    .toThrow("source mismatch");
});

test("rejects missing or additional public methods", () => {
  const missing = validSchema();
  delete missing.methods.adjudicate;
  expect(() => verifySourceAndSchema(SOURCE, SOURCE, missing)).toThrow("schema mismatch");
  const additional = validSchema();
  additional.methods.admin_upgrade = method();
  expect(() => verifySourceAndSchema(SOURCE, SOURCE, additional)).toThrow("schema mismatch");
});

test("accepts only a 0x-prefixed 32-byte private key without exposing it", () => {
  expect(() => assertPrivateKey(undefined)).toThrow("0x-prefixed 32-byte key");
  expect(() => assertPrivateKey("0x12")).toThrow("0x-prefixed 32-byte key");
  expect(() => assertPrivateKey(`0x${"a".repeat(64)}`)).not.toThrow();
});

test("reads code and schema from the exact receipt address", async () => {
  const client = {
    getContractCode: vi.fn().mockResolvedValue(SOURCE),
    getContractSchema: vi.fn().mockResolvedValue(validSchema()),
  };
  const result = await verifyLiveDeployment(client, ADDRESS, SOURCE);
  expect(client.getContractCode).toHaveBeenCalledWith(ADDRESS);
  expect(client.getContractSchema).toHaveBeenCalledWith(ADDRESS);
  expect(result.sourceSha256).toBe(result.deployedSourceSha256);
  expect(result.expectedMethods).toEqual(EXPECTED_FIRSTFAULT_METHODS);
});
```

- [ ] **Step 2: Run the focused test and confirm the new imports fail**

Run: `npm --prefix frontend test -- lib/contracts/verifyDeployment.test.ts`

Expected: FAIL because `verifySourceAndSchema`, `verifyLiveDeployment`, and `EXPECTED_FIRSTFAULT_METHODS` do not exist.

- [ ] **Step 3: Implement strict evidence primitives**

Create `scripts/deploymentEvidence.ts` with these definitions:

```ts
import { createHash } from "node:crypto";

export const EXPECTED_FIRSTFAULT_METHODS = [
  "accept_workflow", "adjudicate", "approve_mutual_settlement", "cancel_workflow",
  "create_workflow", "execute_mutual_settlement", "fund_workflow", "get_accounting",
  "get_recovery", "get_step", "get_workflow", "open_dispute",
  "propose_mutual_settlement", "start_workflow", "submit_cure", "submit_step",
  "timeout_dispute_to_unresolved",
] as const;

export type ContractSchemaLike = { methods: Record<string, unknown> };
export type LiveDeploymentEvidence = {
  sourceSha256: string;
  deployedSourceSha256: string;
  expectedMethods: readonly string[];
};

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function normalizeSource(value: string): string {
  return value.replace(/\r\n/g, "\n");
}

export function assertPrivateKey(value: string | undefined): asserts value is `0x${string}` {
  if (!value || !/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error("GENLAYER_DEPLOYER_PRIVATE_KEY must be a 0x-prefixed 32-byte key");
  }
}

export function verifySourceAndSchema(
  expectedSource: string,
  deployedSource: string,
  schema: ContractSchemaLike,
): LiveDeploymentEvidence {
  const sourceSha256 = sha256Hex(normalizeSource(expectedSource));
  const deployedSourceSha256 = sha256Hex(normalizeSource(deployedSource));
  if (sourceSha256 !== deployedSourceSha256) throw new Error("Deployed source mismatch");
  const actual = Object.keys(schema.methods).sort();
  if (JSON.stringify(actual) !== JSON.stringify(EXPECTED_FIRSTFAULT_METHODS)) {
    throw new Error("Deployed schema mismatch");
  }
  return { sourceSha256, deployedSourceSha256, expectedMethods: EXPECTED_FIRSTFAULT_METHODS };
}
```

Modify `scripts/verifyDeployment.ts` so `verifyDeploymentReceipt` returns the normalized address and result, and add:

```ts
export type DeploymentReadClient = {
  getContractCode(address: Address): Promise<string>;
  getContractSchema(address: Address): Promise<ContractSchemaLike>;
};

export async function verifyLiveDeployment(
  client: DeploymentReadClient,
  contractAddress: Address,
  expectedSource: string,
) {
  const [deployedSource, schema] = await Promise.all([
    client.getContractCode(contractAddress),
    client.getContractSchema(contractAddress),
  ]);
  return verifySourceAndSchema(expectedSource, deployedSource, schema);
}
```

Address extraction must check `receipt.txDataDecoded.contractAddress`, `receipt.data.contract_address`, `receipt.to_address`, and `receipt.recipient` in that order, then reject a missing, malformed, or zero address. Update the existing `verifyDeployment(hash, endpoint)` wrapper to return `{ receipt, contractAddress: verified.contractAddress }` after adapting to the new normalized receipt return type.

- [ ] **Step 4: Run focused tests and TypeScript lint**

Run: `npm --prefix frontend test -- lib/contracts/verifyDeployment.test.ts`

Expected: all deployment verification tests PASS.

Run: `npm run lint`

Expected: TypeScript exits with code `0`.

- [ ] **Step 5: Commit the verified readback unit**

```shell
git add scripts/deploymentEvidence.ts scripts/verifyDeployment.ts frontend/lib/contracts/verifyDeployment.test.ts
git commit -m "feat: verify finalized FirstFault deployment readback"
```

### Task 2: Validated atomic manifest

**Files:**
- Create: `scripts/writeDeploymentManifest.ts`
- Create: `frontend/lib/contracts/deploymentManifest.test.ts`

**Interfaces:**
- Consumes: `EXPECTED_FIRSTFAULT_METHODS` and `LiveDeploymentEvidence` from `scripts/deploymentEvidence.ts`.
- Produces: `DeploymentManifestInput` and `DeploymentManifest`.
- Produces: `buildDeploymentManifest(input: DeploymentManifestInput): DeploymentManifest`.
- Produces: `deploymentLogFields(manifest: DeploymentManifest): SafeDeploymentLog`.
- Produces: `assertDeploymentManifestAbsent(path: string, fileOps?: Pick<ManifestFileOps, "access">): Promise<void>`.
- Produces: `writeDeploymentManifestAtomically(path: string, input: DeploymentManifestInput, fileOps?: ManifestFileOps): Promise<DeploymentManifest>`.

- [ ] **Step 1: Add manifest validation and filesystem tests**

Create `frontend/lib/contracts/deploymentManifest.test.ts` with this valid fixture:

```ts
const validInput = (): DeploymentManifestInput => ({
  contractAddress: "0x1111111111111111111111111111111111111111",
  deploymentTransactionHash: `0x${"a".repeat(64)}`,
  deployerAddress: "0x2222222222222222222222222222222222222222",
  sourceSha256: "b".repeat(64),
  deployedSourceSha256: "b".repeat(64),
  expectedMethods: EXPECTED_FIRSTFAULT_METHODS,
  executionResult: "FINISHED_WITH_RETURN",
  deployedAt: "2026-09-05T00:00:00.000Z",
  explorerUrl: "https://explorer-studio.genlayer.com/address/0x1111111111111111111111111111111111111111",
  transactionExplorerUrl: `https://explorer-studio.genlayer.com/tx/0x${"a".repeat(64)}`,
  predecessor: null,
  successor: null,
});

test("builds the frozen Studionet manifest without secrets", () => {
  const manifest = buildDeploymentManifest(validInput());
  expect(manifest.network).toBe("studionet");
  expect(manifest.chainId).toBe(61999);
  expect(manifest.classification).toBe("INTENTIONALLY_FROZEN");
  expect(manifest.sourceSha256).toBe(manifest.deployedSourceSha256);
  expect(JSON.stringify(manifest)).not.toContain("privateKey");
});

test.each([
  ["contractAddress", "0x0", "contract address"],
  ["deploymentTransactionHash", "0x12", "transaction hash"],
  ["sourceSha256", "A".repeat(64), "source SHA-256"],
  ["deployedSourceSha256", "b".repeat(64), "source mismatch"],
])("rejects invalid %s", (field, value, message) => {
  expect(() => buildDeploymentManifest({ ...validInput(), [field]: value })).toThrow(message);
});

test("refuses to replace an existing manifest", async () => {
  const directory = await mkdtemp(join(tmpdir(), "firstfault-manifest-"));
  const path = join(directory, "studionet.json");
  await writeFile(path, "existing", "utf8");
  await expect(writeDeploymentManifestAtomically(path, validInput())).rejects.toThrow("already exists");
  expect(await readFile(path, "utf8")).toBe("existing");
});

test("writes valid JSON atomically and leaves no temporary file", async () => {
  const directory = await mkdtemp(join(tmpdir(), "firstfault-manifest-"));
  const path = join(directory, "studionet.json");
  const manifest = await writeDeploymentManifestAtomically(path, validInput());
  expect(JSON.parse(await readFile(path, "utf8"))).toEqual(manifest);
  expect((await readdir(directory)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
});

test("removes the temporary file when rename fails", async () => {
  const operations = fakeFileOps({ rename: vi.fn().mockRejectedValue(new Error("disk failure")) });
  await expect(writeDeploymentManifestAtomically("C:/evidence/studionet.json", validInput(), operations))
    .rejects.toThrow("disk failure");
  expect(operations.rm).toHaveBeenCalledWith(expect.stringMatching(/\.tmp$/), { force: true });
});
```

Define the injected filesystem fixture as:

```ts
const missing = Object.assign(new Error("missing"), { code: "ENOENT" });
const fakeFileOps = (overrides: Partial<ManifestFileOps> = {}): ManifestFileOps => ({
  mkdir: vi.fn(async () => undefined),
  access: vi.fn(async () => { throw missing; }),
  writeFile: vi.fn(async () => undefined),
  rename: vi.fn(async () => undefined),
  rm: vi.fn(async () => undefined),
  ...overrides,
});
```

- [ ] **Step 2: Run the focused manifest test and confirm it fails**

Run: `npm --prefix frontend test -- lib/contracts/deploymentManifest.test.ts`

Expected: FAIL because `scripts/writeDeploymentManifest.ts` does not exist.

- [ ] **Step 3: Implement manifest validation and exclusive atomic write**

Implement `buildDeploymentManifest` with fixed fields `schemaVersion: 1`, `project: "FirstFault"`, `network: "studionet"`, `chainId: 61999`, `classification: "INTENTIONALLY_FROZEN"`, `sourcePath: "contracts/firstfault.py"`, `constructorArgs: []`, `receiptStatus: "FINALIZED"`, and `executionResult: "FINISHED_WITH_RETURN"`. Validate addresses, transaction hash, lowercase digests, equal digests, exact expected methods, HTTPS explorer links, parseable UTC timestamp, and predecessor/successor address-or-null.

Implement `assertDeploymentManifestAbsent` with `access(path)`: resolve only when the error code is `ENOENT`; throw `Deployment manifest already exists` when access succeeds; rethrow any other filesystem error. Call the same guard again inside the atomic writer to close the race window as far as a single-process operator workflow allows.

Define `ManifestFileOps` as the five injected operations `mkdir`, `access`, `writeFile`, `rename`, and `rm`, defaulting to the corresponding `node:fs/promises` functions. In the test, `fakeFileOps(overrides)` returns successful spies for those five functions merged with the supplied override. Implement the write order exactly:

```ts
await mkdir(dirname(path), { recursive: true });
await access(path).then(
  () => { throw new Error("Deployment manifest already exists"); },
  (error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
  },
);
const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
try {
  await writeFile(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  await rename(temporaryPath, path);
} catch (error) {
  await rm(temporaryPath, { force: true });
  throw error;
}
```

`deploymentLogFields` returns only `network`, `contractAddress`, `deploymentTransactionHash`, `deployerAddress`, `sourceSha256`, and `status: "verified"`.

- [ ] **Step 4: Run manifest tests and TypeScript lint**

Run: `npm --prefix frontend test -- lib/contracts/deploymentManifest.test.ts`

Expected: all manifest tests PASS.

Run: `npm run lint`

Expected: exit code `0`.

- [ ] **Step 5: Commit the manifest unit**

```shell
git add scripts/writeDeploymentManifest.ts frontend/lib/contracts/deploymentManifest.test.ts
git commit -m "feat: write verified deployment manifest atomically"
```

### Task 3: One-transaction deployment orchestration and CLI entry

**Files:**
- Create: `scripts/deployFirstFault.ts`
- Create: `frontend/lib/contracts/deployFirstFault.test.ts`
- Modify: `deploy/deployScript.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `tsconfig.json`

**Interfaces:**
- Consumes: `verifyDeploymentReceipt`, `verifyLiveDeployment`, `assertDeploymentManifestAbsent`, and `writeDeploymentManifestAtomically`.
- Produces: `DeploymentClient`, `DeployFirstFaultInput`, and `deployFirstFault(input): Promise<DeploymentManifest>`.
- Produces: exported `main(): Promise<void>` plus direct invocation in `deploy/deployScript.ts`.

- [ ] **Step 1: Add orchestration tests that prove ordering and fail-closed behavior**

Create `frontend/lib/contracts/deployFirstFault.test.ts` with injected mocks and these cases:

```ts
const TX_HASH = `0x${"a".repeat(64)}` as const;
const ADDRESS = "0x1111111111111111111111111111111111111111" as const;
const DEPLOYER = "0x2222222222222222222222222222222222222222" as const;
const SOURCE = "class FirstFault: pass\n";

function makeHarness(overrides: Partial<DeploymentClient> = {}) {
  const calls: string[] = [];
  const client: DeploymentClient = {
    getChainId: vi.fn(async () => 61999),
    deployContract: vi.fn(async () => { calls.push("deploy"); return TX_HASH; }),
    waitForTransactionReceipt: vi.fn(async () => {
      calls.push("finalized");
      return { statusName: "FINALIZED", txExecutionResultName: "FINISHED_WITH_RETURN", to_address: ADDRESS };
    }),
    getContractCode: vi.fn(async () => { calls.push("code"); return SOURCE; }),
    getContractSchema: vi.fn(async () => {
      calls.push("schema");
      return { methods: Object.fromEntries(EXPECTED_FIRSTFAULT_METHODS.map((name) => [name, {}])) };
    }),
    ...overrides,
  };
  const writeManifest = vi.fn(async (_path, input) => {
    calls.push("manifest");
    return buildDeploymentManifest(input);
  });
  const input: DeployFirstFaultInput = {
    client,
    source: SOURCE,
    manifestPath: "C:/firstfault/deployments/studionet.json",
    deployerAddress: DEPLOYER,
    explorerUrl: "https://explorer-studio.genlayer.com",
    now: () => new Date("2026-09-05T00:00:00.000Z"),
    assertManifestAbsent: vi.fn(async () => { calls.push("manifest-absent"); }),
    writeManifest,
  };
  return { calls, client, input, writeManifest };
}

test("deploys once, waits for FINALIZED, verifies readback, then writes evidence", async () => {
  const { calls, client, input } = makeHarness();
  const result = await deployFirstFault(input);
  expect(client.deployContract).toHaveBeenCalledTimes(1);
  expect(client.deployContract).toHaveBeenCalledWith({ code: SOURCE, args: [] });
  expect(client.waitForTransactionReceipt).toHaveBeenCalledWith(expect.objectContaining({ status: "FINALIZED" }));
  expect(calls).toEqual(["manifest-absent", "deploy", "finalized", "code", "schema", "manifest"]);
  expect(result.receiptStatus).toBe("FINALIZED");
});

test("writes no manifest when live source differs", async () => {
  const getContractCode = vi.fn(async () => "class Other: pass\n");
  const { input, writeManifest } = makeHarness({ getContractCode });
  await expect(deployFirstFault(input)).rejects.toThrow("source mismatch");
  expect(writeManifest).not.toHaveBeenCalled();
});

test("writes no manifest when finalized execution fails", async () => {
  const waitForTransactionReceipt = vi.fn(async () => ({
    statusName: "FINALIZED",
    txExecutionResultName: "FINISHED_WITH_ERROR",
    to_address: ADDRESS,
  }));
  const { input, writeManifest } = makeHarness({ waitForTransactionReceipt });
  await expect(deployFirstFault(input)).rejects.toThrow("execution failed");
  expect(writeManifest).not.toHaveBeenCalled();
});

test("refuses an existing manifest before querying the network or deploying", async () => {
  const { input, client, writeManifest } = makeHarness();
  input.assertManifestAbsent = vi.fn(async () => { throw new Error("Deployment manifest already exists"); });
  await expect(deployFirstFault(input)).rejects.toThrow("already exists");
  expect(client.getChainId).not.toHaveBeenCalled();
  expect(client.deployContract).not.toHaveBeenCalled();
  expect(writeManifest).not.toHaveBeenCalled();
});

test("rejects a non-Studionet endpoint before deployment", async () => {
  const { input, client, writeManifest } = makeHarness({ getChainId: vi.fn(async () => 61127) });
  await expect(deployFirstFault(input)).rejects.toThrow("Expected Studionet chain ID 61999");
  expect(client.deployContract).not.toHaveBeenCalled();
  expect(writeManifest).not.toHaveBeenCalled();
});
```

The fake receipt uses transaction hash `0x` plus 64 `a` characters, a finalized successful result, and contract address `0x1111111111111111111111111111111111111111`.

- [ ] **Step 2: Run the focused orchestration test and confirm it fails**

Run: `npm --prefix frontend test -- lib/contracts/deployFirstFault.test.ts`

Expected: FAIL because `scripts/deployFirstFault.ts` does not exist.

- [ ] **Step 3: Implement the injected orchestration function**

Create `scripts/deployFirstFault.ts` with a narrow client type containing `getChainId`, `deployContract`, `waitForTransactionReceipt`, `getContractCode`, and `getContractSchema`. The main function must use this sequence without catching validation errors:

```ts
await assertManifestAbsent(manifestPath);
const chainId = await client.getChainId();
if (chainId !== 61999) throw new Error(`Expected Studionet chain ID 61999, received ${chainId}`);
const deploymentTransactionHash = await client.deployContract({ code: source, args: [] });
onSubmitted?.({ deploymentTransactionHash, deployerAddress });
const receipt = await client.waitForTransactionReceipt({
  hash: deploymentTransactionHash,
  status: TransactionStatus.FINALIZED,
  interval: 5_000,
  retries: 120,
});
const { contractAddress, executionResult } = verifyDeploymentReceipt(receipt);
const evidence = await verifyLiveDeployment(client, contractAddress, source);
const explorerBase = explorerUrl.replace(/\/$/, "");
return writeManifest(manifestPath, {
  contractAddress,
  deploymentTransactionHash,
  deployerAddress,
  sourceSha256: evidence.sourceSha256,
  deployedSourceSha256: evidence.deployedSourceSha256,
  expectedMethods: evidence.expectedMethods,
  executionResult,
  deployedAt: now().toISOString(),
  explorerUrl: `${explorerBase}/address/${contractAddress}`,
  transactionExplorerUrl: `${explorerBase}/tx/${deploymentTransactionHash}`,
  predecessor: null,
  successor: null,
});
```

- [ ] **Step 4: Replace the disabled CLI entry with environment-only authentication**

In `deploy/deployScript.ts`, read `contracts/firstfault.py`, validate the key with `assertPrivateKey`, create the account and `createClient({ chain: studionet, account, endpoint })`, assert `studionet.id === 61999`, set the evidence explorer base to the current canonical `https://explorer-studio.genlayer.com`, print a preflight object containing exactly `network`, `chainId`, `deployerAddress`, `sourcePath`, and normalized `sourceSha256`, and call `deployFirstFault`. Do not use the older explorer hostname currently bundled in `genlayer-js` 1.1.8.

The entry must terminate with a sanitized message only:

```ts
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "FirstFault deployment failed");
  process.exitCode = 1;
});
```

Install root development dependencies with `npm install --save-dev tsx@4.20.6 typescript@5.9.3 @types/node@24.9.1`, which updates both `package.json` and `package-lock.json`. Configure the root `tsconfig.json` with `target: "ES2022"`, `module: "ES2022"`, `moduleResolution: "bundler"`, `strict: true`, `noEmit: true`, `types: ["node"]`, and `include: ["deploy/**/*.ts", "scripts/**/*.ts"]`.

Use these package scripts:

```json
"deploy": "tsx deploy/deployScript.ts",
"lint:deploy": "tsc --noEmit --project tsconfig.json",
"verify:deployment": "npm --prefix frontend test -- lib/contracts/verifyDeployment.test.ts lib/contracts/deploymentManifest.test.ts lib/contracts/deployFirstFault.test.ts"
```

- [ ] **Step 5: Run orchestration tests, deployment verification tests, and lint**

Run: `npm run verify:deployment`

Expected: all three deployment-related test files PASS and no real network call occurs.

Run: `npm run lint`

Expected: exit code `0`.

Run: `npm run lint:deploy`

Expected: root deployment scripts pass strict TypeScript checking.

- [ ] **Step 6: Prove the CLI fails safely without a key**

Run in a shell where `GENLAYER_DEPLOYER_PRIVATE_KEY` is unset: `npm run deploy`

Expected: non-zero exit with `GENLAYER_DEPLOYER_PRIVATE_KEY must be a 0x-prefixed 32-byte key`, no transaction submission, and no `deployments/studionet.json`.

- [ ] **Step 7: Commit the deploy path**

```shell
git add scripts/deployFirstFault.ts deploy/deployScript.ts package.json package-lock.json tsconfig.json frontend/lib/contracts/deployFirstFault.test.ts
git commit -m "feat: add fail-closed Studionet deployment path"
```

### Task 4: Truthful FirstFault README and environment templates

**Files:**
- Modify: `README.md`
- Modify: `.env.example`
- Modify: `frontend/.env.example`

**Interfaces:**
- Consumes: commands and manifest fields from Tasks 1–3.
- Produces: operator and judge documentation with no inherited Football Bets claims.

- [ ] **Step 1: Add a documentation regression check before rewriting**

Run:

```powershell
rg -n "Football|football_bets|your_contract_address|Sample GenLayer project" README.md .env.example frontend/.env.example
```

Expected: matches in `README.md` and `frontend/.env.example`, proving the inherited documentation is still present.

- [ ] **Step 2: Replace README with the FirstFault operating guide**

Write concise sections in this exact order:

1. `FirstFault` summary and Agent Tank participation.
2. Trust problem: buyer, researcher, writer, and publisher cannot unilaterally decide completion.
3. GenLayer decision: `ACCEPT_ALL`, earliest `FIRST_BREACH`, or safe `UNRESOLVED` from evidence-bound semantic consensus.
4. On-chain consequence: compliant milestone schedules worker payout, breached milestone schedules buyer refund, unresolved value stays reserved; all Studionet GEN is simulated.
5. Architecture: `contracts/firstfault.py` → `genlayer-js` adapter → Next.js frontend, with contract state authoritative.
6. State and recovery summary, linking `docs/RECOVERY.md` and stating `INTENTIONALLY_FROZEN`.
7. Requirements and environment variables.
8. Commands for direct tests, Localnet integration, frontend tests, lint, build, deployment verification, and deployment.
9. Deployment evidence section that says `Not deployed yet` whenever `deployments/studionet.json` is absent.
10. Proof matrix with empty evidence cells labeled `Awaiting confirmed Studionet deployment`, not invented hashes.
11. Known limitations: frozen V1 has no privileged migration; Localnet/Studionet are not production value; live URL and contract evidence remain pending until verified.

- [ ] **Step 3: Correct both environment examples**

Use these values at the repository root:

```dotenv
GENLAYER_DEPLOYER_PRIVATE_KEY=
GENLAYER_RPC_URL=https://studio.genlayer.com/api
NEXT_PUBLIC_GENLAYER_RPC_URL=https://studio.genlayer.com/api
NEXT_PUBLIC_GENLAYER_CHAIN_ID=61999
NEXT_PUBLIC_CONTRACT_ADDRESS=
```

Use only the three `NEXT_PUBLIC_` variables in `frontend/.env.example`, with comments naming FirstFault and explicitly requiring the address from a verified `deployments/studionet.json`.

- [ ] **Step 4: Verify documentation and secret hygiene**

Run:

```powershell
rg -n "Football|football_bets|your_contract_address|Sample GenLayer project" README.md .env.example frontend/.env.example
```

Expected: no matches.

Run:

```powershell
rg -n "(VERCEL_TOKEN|PRIVATE_KEY)=[^[:space:]]+|0x[0-9a-fA-F]{64}" README.md .env.example frontend/.env.example deploy scripts
```

Expected: no secret assignment or literal private key match.

- [ ] **Step 5: Commit documentation cleanup**

```shell
git add README.md .env.example frontend/.env.example
git commit -m "docs: replace sample guide with FirstFault operations"
```

### Task 5: Full local regression and external-action handoff

**Files:**
- Verify: all tracked project files
- Do not add: `.superpowers/`
- Do not create yet: `deployments/studionet.json`

**Interfaces:**
- Consumes: all deliverables from Tasks 1–4.
- Produces: a local verification record and an exact deployment confirmation request; it produces no external mutation.

- [ ] **Step 1: Run contract lint and direct tests**

Run: `genvm-lint check contracts/firstfault.py`

Expected: exit code `0` with no contract violations.

Run: `pytest tests/direct -q`

Expected: all 96 direct tests PASS.

- [ ] **Step 2: Run frontend and deployment suites**

Run: `npm --prefix frontend test -- --exclude lib/contracts/FirstFault.localnet.test.ts`

Expected: all non-Localnet Vitest tests PASS.

Run: `npm run verify:deployment`

Expected: receipt, live readback, manifest, and orchestration tests PASS without network writes.

- [ ] **Step 3: Run Localnet custody integration**

Run: `gltest tests/integration -v -s`

Expected: all 6 integration tests PASS, including compliant payout, writer-breach refund, and `UNRESOLVED` reserved-balance preservation.

Run: `npm --prefix frontend test -- lib/contracts/FirstFault.localnet.test.ts`

Expected: the real frontend adapter Localnet custody test PASS.

- [ ] **Step 4: Run production checks**

Run: `npm run lint`

Expected: exit code `0`.

Run: `npm run build`

Expected: Next.js production build succeeds.

Run: `git diff --check`

Expected: no whitespace errors.

- [ ] **Step 5: Audit repository hygiene and staged scope**

Run:

```powershell
git status --short
git diff --cached --name-only
git ls-files | rg "(^|/)(node_modules|\.next|\.superpowers)(/|$)|\.env$"
rg -n "(GENLAYER_DEPLOYER_PRIVATE_KEY|VERCEL_TOKEN)=[^[:space:]]+" --glob '!node_modules/**' --glob '!.next/**'
```

Expected: `.superpowers/` may remain untracked but is not staged; no dependencies, build outputs, live `.env`, or assigned secrets are tracked; only intended task files differ.

- [ ] **Step 6: Commit any test-only correction, then stop before deployment**

If verification required a code correction, stage only its exact files and commit with `fix: preserve verified deployment invariants`; otherwise create no empty commit.

Before running a command with a real private key, inspect and report the active network, derived deployer address, source SHA-256, current commit, and exact command. Ask the user to confirm that wallet and the single Studionet deployment transaction. Do not deploy on the basis of the earlier design approval.

- [ ] **Step 7: Keep later external actions separately gated**

After a verified Studionet deployment, stop separately before each GitHub push and Vercel deployment. For GitHub, report Git author, active GitHub CLI account, remote owner/repository, branch, and commits. For Vercel, report authenticated account/team, linked project, production target, and contract address that will be configured.
