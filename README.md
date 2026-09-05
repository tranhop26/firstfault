# FirstFault

FirstFault is an Agent Tank MVP for settling a paid three-agent workflow: Research → Writer → Publisher. The buyer funds three milestone holds, workers submit evidence-bound outputs, and the Intelligent Contract—not the frontend or an operator—controls the final state and simulated Studionet GEN transfers.

## Trust problem and GenLayer decision

The buyer cannot trust workers to mark weak work complete. Workers cannot trust the buyer to reject valid work after delivery, and downstream agents cannot safely judge which upstream output caused a failed result.

When the buyer disputes the completed workflow, GenLayer validators evaluate the stored briefs, output lineage, HTTPS evidence, timestamps, actor bindings, and hashes. Consensus returns exactly one of:

- `ACCEPT_ALL`: all three milestones are compliant.
- `FIRST_BREACH`: the earliest material causal breach and the status of every step.
- `UNRESOLVED`: evidence or consensus is insufficient; no favorable default is allowed.

The contract applies the consequence on-chain. A compliant milestone schedules payment to its worker, a materially breached milestone schedules its amount back to the buyer, and unresolved value remains reserved. Studionet GEN is simulated test value, not production money.

## Architecture

```text
Next.js interface
    ↓ genlayer-js writes and finalized/readback checks
contracts/firstfault.py
    ↓ validator semantic consensus for disputed evidence
authoritative workflow, accounting, recovery and transfer state
```

- `contracts/firstfault.py` — frozen Intelligent Contract and source of truth.
- `tests/direct/` — authorization, transitions, evidence, adjudication, custody, replay, refund, and recovery tests.
- `tests/integration/` — real Localnet consensus and balance-conservation flows.
- `frontend/` — responsive wallet interface with separate disconnected, pending, finalized, success, error, and readback states.
- `scripts/` and `deploy/` — finalized receipt, source/schema readback, atomic manifest, and Studionet deployment path.

The UI never advances a workflow ahead of contract readback. Settlement is shown as complete only after the parent transaction and every expected external transfer child are finalized and reconciled.

## State and recovery

The main path progresses from draft and funding through work submission and buyer review. Acceptance schedules all compliant payouts; dispute adjudication schedules the contract-determined payout/refund split; cancellation closes an eligible draft workflow or refunds an eligible funded workflow; and insufficient evidence enters `UNRESOLVED` with reserved custody unchanged.

FirstFault V1 is `INTENTIONALLY_FROZEN`. It has no admin verdict, upgrader, emergency withdrawal, or privileged migration. An unresolved hold can use one evidence-bound cure or a unanimous four-party mutual settlement. See [docs/RECOVERY.md](docs/RECOVERY.md) for the full recovery and replacement-contract runbook.

## Requirements

- Python 3.12 or newer
- Node.js 20 or newer
- Docker Desktop plus GenLayer Localnet for live integration tests
- GenLayer CLI and `genvm-linter`
- A funded Studionet development wallet only when performing a confirmed deployment

Install dependencies:

```shell
python -m pip install -r requirements.txt
npm install
```

## Environment

Copy `.env.example` for deployment/local operation and `frontend/.env.example` to `frontend/.env.local` for the web app.

| Variable | Purpose |
|---|---|
| `GENLAYER_DEPLOYER_PRIVATE_KEY` | Deployment key read only from the environment; never commit or print it |
| `GENLAYER_RPC_URL` | Deployment RPC; defaults to `https://studio.genlayer.com/api` |
| `NEXT_PUBLIC_GENLAYER_RPC_URL` | Browser RPC |
| `NEXT_PUBLIC_GENLAYER_CHAIN_ID` | Studionet chain ID `61999` |
| `NEXT_PUBLIC_CONTRACT_ADDRESS` | Address copied only from verified `deployments/studionet.json` |

An empty contract address is intentional before deployment. The frontend reports that live interaction is unavailable; it does not substitute mock contract data.

## Test and build

```shell
genvm-lint check contracts/firstfault.py
pytest tests/direct -q
npm --prefix frontend test -- --exclude lib/contracts/FirstFault.localnet.test.ts
npm run verify:deployment
npm run lint
npm run lint:deploy
npm run build
```

With Localnet running at `http://127.0.0.1:4000/api`:

```shell
gltest tests/integration -v -s
npm --prefix frontend test -- lib/contracts/FirstFault.localnet.test.ts
```

Start the frontend:

```shell
npm run dev
```

## Verified Studionet deployment

Status: **Verified on Studionet.** The frozen contract is deployed at [`0x2271AE904A97865491e4b24c49532f71B711eD5f`](https://explorer-studio.genlayer.com/address/0x2271AE904A97865491e4b24c49532f71B711eD5f) by wallet `0x21b45103dd05c43969daF3CbB4277391777e2eC7`. Deployment transaction [`0x47b36d…19e1920`](https://explorer-studio.genlayer.com/tx/0x47b36dcc4b7843534f06f299272e96722086bff2f2c2c0daa983ed14119e1920) finalized successfully. Live readback matched source commit `5ef8accf3f19bac356f73f31610aed8f95e47050`, SHA-256 `96be404cb2a2338ed293f452c0a0e133d967db4c17ccdc4a0077d803ab5907ae`, and the exact 17-method schema recorded in `deployments/studionet.json`.

## Live application

Production: [https://firstfault.vercel.app](https://firstfault.vercel.app). Vercel deployed commit `35b65b5cf852791779bbcedd2ca0231c82ee14f9` from `main`, with `frontend` as the root directory and the verified Studionet address above. The live application returned HTTP 200, reconstructed workflow `firstfault-demo-20260905-1` from the successful create transaction, and displayed a recoverable `Workflow could not be read` state for a nonexistent workflow. Machine-readable web evidence is recorded in `deployments/vercel.json`.

After confirming the exact wallet, network, source hash, and intended transaction, set the key in the process environment and run:

```shell
npm run deploy
```

The script fails closed when the key, chain, receipt, address, source, schema, explorer link, or manifest path is invalid. It refuses to overwrite an existing manifest. The private key is excluded from preflight, errors, logs, and evidence.

If a transaction hash was printed but receipt waiting, readback, or manifest writing later failed, do not deploy again. Set that exact hash and rerun the same command; this resumes finality/readback verification without calling `deployContract`:

```powershell
$env:GENLAYER_DEPLOYMENT_TX_HASH = "0x..."
npm run deploy
```

The resumed receipt must identify the same transaction hash before evidence can be written.

## Evidence matrix

| Actor | Action | Contract method | Transaction | Finalized/success | Readback |
|---|---|---|---|---|---|
| Deployer | Deploy frozen FirstFault source | Contract deployment | [`0x47b36d…19e1920`](https://explorer-studio.genlayer.com/tx/0x47b36dcc4b7843534f06f299272e96722086bff2f2c2c0daa983ed14119e1920) | `FINALIZED` / `FINISHED_WITH_RETURN` | [Address](https://explorer-studio.genlayer.com/address/0x2271AE904A97865491e4b24c49532f71B711eD5f), exact source hash and 17-method schema verified |
| Buyer | Create workflow | `create_workflow` | [`0x058022…fb084`](https://explorer-studio.genlayer.com/tx/0x0580228b6382bf4d75123ff393fb975016c89cf150b6ac7b0026ebc3ce7fb084) | `FINALIZED` / `SUCCESS`, 5/5 validators agreed | `firstfault-demo-20260905-1` is `DRAFT`; actors, briefs, 10/10/10 holds and zero custody read back from contract |
| Buyer | Repeat an existing workflow ID | `create_workflow` | [`0xa48670…f40b7f`](https://explorer-studio.genlayer.com/tx/0xa486707f0b85c57c334b3cf57e18cb71d86a39b894d05e639f5061314af40b7f) | `FINALIZED` / `ERROR`; rollback `Workflow already exists` | Original workflow remains `DRAFT` and accounting remains unchanged |
| Reviewer | Inspect the successful workflow from the live app | `get_workflow`, `get_step`, `get_accounting` | Read-only production call tied to [`0x058022…fb084`](https://explorer-studio.genlayer.com/tx/0x0580228b6382bf4d75123ff393fb975016c89cf150b6ac7b0026ebc3ce7fb084) | Vercel deployment of commit `35b65b5` returned HTTP 200 | Live UI reconstructed `DRAFT`, all three workers, briefs, step states, 10/10/10 holds and zero custody |
| Workers | Submit Research → Writer → Publisher outputs | `submit_step` | Not exercised on Studionet | Covered by Localnet integration tests | `get_step` Studionet evidence pending |
| Buyer | Accept completed workflow | `accept_workflow` | Not exercised on Studionet | Covered by Localnet integration tests | Workflow/accounting Studionet evidence pending |
| Buyer and validators | Dispute and determine first fault | `open_dispute`, `adjudicate` | Not exercised on Studionet | Covered by Localnet consensus tests | Verdict/accounting Studionet evidence pending |
| Any caller after timeout | Preserve custody safely | `timeout_dispute_to_unresolved` | Not exercised on Studionet | Covered by direct and Localnet tests | `UNRESOLVED` Studionet evidence pending |

Machine-readable deployment and exercised-flow evidence is recorded in `deployments/studionet.json`, `deployments/studionet-evidence.json`, and `deployments/vercel.json`.

## Known limitations

- V1 is frozen; replacing faulty behavior requires a separately deployed and reviewed successor. Existing holds cannot be silently migrated.
- `UNRESOLVED` deliberately retains reserved value until a contract-governed recovery path succeeds.
- Localnet and Studionet activity demonstrates development behavior, not production-value settlement.
- Studionet proof transactions for the remaining settlement, dispute, and `UNRESOLVED` flows are still pending; the live application, create transaction, duplicate-rejection transaction, production readback, and production read-error state are already exercised and verified.

## License

MIT — see [LICENSE](LICENSE).
