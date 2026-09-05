# FirstFault verified deployment and evidence design

## Goal

Replace the disabled deployment placeholder with one reproducible Studionet deployment path. A successful run must prove that the finalized address contains the submitted `contracts/firstfault.py` source and the expected public interface before it records a deployment manifest.

This work also replaces the stale Football Bets README and environment comments with FirstFault documentation. It does not deploy the contract, publish to GitHub, or deploy the frontend; each of those remains behind its separate action-time identity confirmation.

## Fixed decisions

- Network: GenLayer Studionet, chain ID `61999`.
- Contract: `INTENTIONALLY_FROZEN`; there is no privileged upgrade method.
- Authentication: `GENLAYER_DEPLOYER_PRIVATE_KEY` is read from the environment, validated in memory, and never printed or persisted.
- Source of truth: `contracts/firstfault.py` is the only deployment source.
- Constructor arguments: none.
- Deployment evidence is valid only after transaction `FINALIZED`, successful execution, a non-zero contract address, deployed-source equality, and expected-schema equality.
- A failed or incomplete verification produces no manifest and cannot update the frontend address.

## Trust and evidence boundary

| Actor | Cannot trust | Can manipulate | Defense | Verification |
|---|---|---|---|---|
| Deployer | Local scripts or stale build artifacts | Endpoint, key, source path | Fixed source path, Studionet chain assertion, source SHA-256 | Preflight output and manifest |
| Project operator | A receipt alone | Copy an unrelated address or hash | Derive address from finalized successful receipt | Receipt verifier tests |
| Judge/user | README deployment claims | Documentation and frontend configuration | Compare live deployed code and schema with repository source | Readback digests and method list |
| Frontend | Local environment value | Point UI at another contract | Address is copied only from verified manifest after deployment | Runtime contract readback |

The deployment verifier establishes one fact: the finalized Studionet address was created by the recorded transaction and exposes the same FirstFault source and expected callable schema as this repository revision. Its consequence is local evidence creation only; deployment itself does not move escrow funds or create a workflow.

## Components

### 1. Deployment entry

`deploy/deployScript.ts` will:

1. Load and validate the endpoint and `GENLAYER_DEPLOYER_PRIVATE_KEY`.
2. Derive and display only the deployer address, Studionet chain ID, source path, and source hash for preflight.
3. Refuse a non-Studionet chain or an existing manifest unless an explicit, separately designed replacement flow is used.
4. Submit exactly one deployment of `contracts/firstfault.py` with no constructor arguments.
5. Wait for `FINALIZED`, require successful execution, and extract a non-zero contract address from the receipt.
6. Read back the deployed source and schema from that address.
7. Delegate verification and manifest creation to focused helpers.

The script must not log the private key, serialize it, include it in errors, or write it to a manifest. An `.env.example` documents names only and contains no address placeholder presented as a real deployment.

### 2. Receipt and live-contract verifier

`scripts/verifyDeployment.ts` will keep receipt validation as a pure testable function and add live readback checks. Verification requires:

- status `FINALIZED`;
- execution `FINISHED_WITH_RETURN` or its equivalent successful leader receipt;
- a valid non-zero contract address;
- exact normalized source equality with `contracts/firstfault.py`;
- the exact expected public FirstFault method set in the live schema: `create_workflow`, `submit_step`, `cancel_workflow`, `fund_workflow`, `start_workflow`, `accept_workflow`, `open_dispute`, `timeout_dispute_to_unresolved`, `submit_cure`, `propose_mutual_settlement`, `approve_mutual_settlement`, `execute_mutual_settlement`, `adjudicate`, `get_workflow`, `get_accounting`, `get_recovery`, and `get_step`;
- no advertised upgrader/admin method.

Missing, malformed, contradictory, or unavailable readback fails closed. It never becomes a successful deploy record.

### 3. Atomic deployment manifest

After every verification passes, a helper writes `deployments/studionet.json` through a temporary file followed by an atomic rename. The committed schema is:

| Field | Required value or derivation |
|---|---|
| `schemaVersion` | Integer `1` |
| `project` | `FirstFault` |
| `network` / `chainId` | `studionet` / `61999` |
| `classification` | `INTENTIONALLY_FROZEN` |
| `contractAddress` | Non-zero address derived from the finalized receipt |
| `deploymentTransactionHash` | Hash returned by the deployment submission |
| `deployerAddress` | Public address derived from the environment key |
| `sourcePath` | `contracts/firstfault.py` |
| `sourceSha256` / `deployedSourceSha256` | Lowercase SHA-256 digests; they must be equal |
| `constructorArgs` | Empty array |
| `expectedMethods` | The exact 17-method public set listed above |
| `receiptStatus` / `executionResult` | `FINALIZED` / `FINISHED_WITH_RETURN` |
| `deployedAt` | ISO-8601 UTC timestamp recorded after live verification |
| `explorerUrl` / `transactionExplorerUrl` | Studionet explorer links derived from the verified address and hash |
| `predecessor` / `successor` | `null` for the first deployment; verified addresses for an explicit replacement |

No example with invented address or transaction hash will be committed as if it were evidence. A schema fixture used by tests must be clearly isolated under test fixtures.

### 4. README and configuration cleanup

The root README will describe FirstFault rather than the inherited sample:

- the three-agent Research → Writer → Publisher workflow;
- the exact GenLayer decision: earliest material causal breach, `ACCEPT_ALL`, or `UNRESOLVED`;
- escrow consequences: compliant milestone payout, breached milestone refund, and funds retained safely when unresolved;
- architecture and contract-authoritative state flow;
- install, local test, Localnet integration, build, and deployment commands;
- required environment variables without secrets;
- `INTENTIONALLY_FROZEN` migration/recovery limits;
- deployment evidence and proof matrix, explicitly marked not deployed until a verified manifest exists.

Both environment examples will use FirstFault names and leave the live contract address empty. The frontend must reject an empty address for live contract interaction rather than substituting fake data.

## Failure and recovery behavior

- Invalid/missing key, endpoint, chain, source, or schema: stop before or immediately after read-only preflight.
- Submission failure or timeout: report the transaction hash if one exists, write no manifest, and allow read-only verification to resume later from that hash.
- Finalized execution failure or missing address: fail permanently for that transaction; write no manifest.
- Source/schema mismatch: quarantine the address as unverified; write no manifest and do not configure the frontend.
- Interrupted manifest write: preserve the prior valid manifest or no manifest; never leave a partial JSON file.
- Existing verified deployment: refuse silent overwrite. Because the contract is frozen, a replacement is a new contract and must explicitly link `predecessor`/`successor`; active escrow is never silently migrated.

## Testing and acceptance

Implementation begins with failing tests for receipt parsing, source/schema comparison, key/address validation, manifest validation, overwrite refusal, and atomic-write failure. Existing contract, frontend, and Localnet suites must continue to pass.

Local acceptance before any external action requires:

- TypeScript lint and build pass;
- direct contract tests pass;
- frontend unit/integration tests pass;
- Localnet happy path, breach/refund, and `UNRESOLVED` custody paths pass;
- deployment helpers pass entirely with fixtures/mocks and create no real transaction;
- secret and repository-hygiene scans show no credentials or internal task artifacts staged.

Actual Studionet acceptance happens only after the user confirms the exact deployment wallet and proposed transaction at action time. After confirmation, the final evidence must include the exact commit, source hash, deployer, contract address, deployment transaction, explorer links, finalized/success status, live source/schema readback, and known limitations. GitHub push and Vercel deployment remain separately gated.

## Non-goals

- No upgrade proxy, admin verdict, or owner-selected settlement result.
- No automatic migration of existing workflows or escrow.
- No backend database as deployment authority.
- No Vercel or GitHub publication in this implementation step.
- No additional product features unrelated to verified deployment and honest documentation.
