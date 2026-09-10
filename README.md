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

- `contracts/firstfault.py` — deployed, frozen V1 Intelligent Contract and source of truth.
- `contracts/firstfault_v2.py` — separately deployed, frozen Studionet successor with deadline, recovery, and consensus-captured source snapshot fixes; see [docs/FIRSTFAULT_V2.md](docs/FIRSTFAULT_V2.md).
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
| `NEXT_PUBLIC_CONTRACT_ADDRESS` | Address copied from the verified manifest for the selected contract version |
| `NEXT_PUBLIC_CONTRACT_VERSION` | Adapter version matching the deployed address: `v1`, `v2`, or `v3` |

An empty contract address is intentional before deployment. The frontend reports that live interaction is unavailable; it does not substitute mock contract data.

The active production build uses:

```text
NEXT_PUBLIC_GENLAYER_RPC_URL=https://studio.genlayer.com/api
NEXT_PUBLIC_GENLAYER_CHAIN_ID=61999
NEXT_PUBLIC_CONTRACT_ADDRESS=0x9236A835741DF7f891613B5578753647C140124E
NEXT_PUBLIC_CONTRACT_VERSION=v3
```

## Test and build

```shell
genvm-lint check contracts/firstfault.py
python -m pytest tests/direct -q
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

Status: **Verified on Studionet.** FirstFault V1 is deployed at [`0x2271AE904A97865491e4b24c49532f71B711eD5f`](https://explorer-studio.genlayer.com/address/0x2271AE904A97865491e4b24c49532f71B711eD5f) by wallet `0x21b45103dd05c43969daF3CbB4277391777e2eC7`. Deployment transaction [`0x47b36d…19e1920`](https://explorer-studio.genlayer.com/tx/0x47b36dcc4b7843534f06f299272e96722086bff2f2c2c0daa983ed14119e1920) finalized successfully. Live readback matched source commit `5ef8accf3f19bac356f73f31610aed8f95e47050`, SHA-256 `96be404cb2a2338ed293f452c0a0e133d967db4c17ccdc4a0077d803ab5907ae`, and the exact 17-method schema recorded in `deployments/studionet.json`.

FirstFault V2 is separately deployed at [`0x24c060E5394b5bD14a5546B055A7F049f9842987`](https://explorer-studio.genlayer.com/address/0x24c060E5394b5bD14a5546B055A7F049f9842987) by the same wallet. Deployment transaction [`0x189c6d…1db2d`](https://explorer-studio.genlayer.com/tx/0x189c6d629cde61aff8893c3d8dcc45ea9908a0a4da95d6a3b7b5b5db3fd1db2d) is `FINALIZED` with a successful execution result. Live RPC readback matched commit `e171fc108c92d3e9d346686c5f87c2e760c05aee`, SHA-256 `8bff11b1506437ef5c1ebab01ce084e0a63f57c1d78319953f19263987dc83c5`, and the exact 20-method schema in `deployments/studionet-v2.json`. V2 is retained as historical deployment evidence and is not the active production contract.

FirstFault V3 is deployed at [`0x9236A835741DF7f891613B5578753647C140124E`](https://explorer-studio.genlayer.com/address/0x9236A835741DF7f891613B5578753647C140124E) by the same wallet. Deployment transaction [`0x9e3d32…b62fdc`](https://explorer-studio.genlayer.com/tx/0x9e3d328e3ec5a325ab25fffa26b006b692f7891d11de05703436304830b62fdc) is `FINALIZED` with successful execution. Live RPC readback matched commit `6e4b3b8a632ee519d571674af0b5e64bfc6d74e1`, SHA-256 `7164c7edf6bd2def6dce69615b4acce0f8899ffa7fa094b8cd59f6c1df426617`, and the exact 24-method schema in `deployments/studionet-v3.json`. V3 is the active production contract after its custody paths, terminal readback, transfer finality and frontend integration were verified.

## Live application

Production: [https://firstfault.vercel.app](https://firstfault.vercel.app). It serves the V3 contract [`0x9236A835741DF7f891613B5578753647C140124E`](https://explorer-studio.genlayer.com/address/0x9236A835741DF7f891613B5578753647C140124E) from `main`, with `frontend` as the Vercel root directory. The current runtime includes the Studionet receipt compatibility fix merged in `68d9b89a708daf7ae547a9b998f58e981d3a0b3a`, and the canonical URL returned HTTP 200 during the final verification. Machine-readable production, rollback, and dispute evidence is recorded in `deployments/vercel.json` and `deployments/studionet-v3-dispute-evidence.json`.

### Judge demo — no wallet required

1. Open [FirstFault Production](https://firstfault.vercel.app).
2. Paste `firstfault-v3-writer-breach-20260910-1` into **Workflow ID**.
3. Select **Inspect case**.
4. Confirm `FIRST_BREACH`, **Earliest material breach: step 2** (Writer), and **Transfers finalized** with one parent and three child transaction links.

This workflow holds 1 simulated GEN for each of Research, Writing, and Publishing. Research is `COMPLIANT`; Writer is `MATERIAL_BREACH` for inventing an unsupported audience metric; Publisher is `COMPLIANT` because its brief required exact reproduction. The contract scheduled 1 simulated GEN to Researcher, 1 to Publisher, and the Writer hold back to Buyer. All three transfers finalized with credited value, and the contract balance returned to zero.

## Golden Studionet dispute

Workflow `firstfault-golden-writer-breach-20260905-1` exercised the complete Studionet contract path with three distinct worker accounts and 51 simulated GEN in custody. A fresh wallet-free production read reconstructed the final verdict and all three finalized transfer links; that browser evidence is recorded in `deployments/vercel.json`. Research bound the IANA example-domain source and reported that it contained no audience metric. Writer then invented a claim of 250,000 weekly users, while Publisher reproduced Writer's artifact exactly as its brief required. GenLayer reached `MAJORITY_AGREE` and returned `FIRST_BREACH` at Writer (step index `1`): Research `COMPLIANT`, Writer `MATERIAL_BREACH`, Publisher `COMPLIANT`.

Adjudication transaction [`0x1a785c…717fc9`](https://explorer-studio.genlayer.com/tx/0x1a785cd36e5c9ae8bdb0839d47d9554587a3066a301f58478ac8d69b7f717fc9) finalized with three child transfers: 11 to Researcher, 17 refunded to Buyer for Writer's breach, and 23 to Publisher. All children finalized with credited value, the contract balance returned to zero, and `11 + 17 + 23 = 51`. Exact hashes, evidence lineage, consensus votes, readback and transfer proof are recorded in `deployments/studionet-golden-demo.json`.

## Live accept-all and UNRESOLVED branches

Two additional three-wallet workflows exercise the remaining promoted branches with 1/1/1 simulated GEN holds. [`firstfault-live-accept-20260905-1`](https://explorer-studio.genlayer.com/tx/0x49a65263371e25c2b3cc40ce44d11c564a1d650b030ddf09ba9788839b33ba23) accepted all work and triggered three finalized, value-credited transfers of 1 GEN to Researcher, Writer and Publisher. [`firstfault-live-unresolved-20260905-1`](https://explorer-studio.genlayer.com/tx/0xdf2b9f74f65b9e59678ecd9bcdb2594fe9d9fb3409b59dbe1f433bef4d6985e2) timed out after the contract-enforced 3,600-second recovery delay and finalized as `UNRESOLVED / CONSENSUS_TIMEOUT`; all 3 GEN remain reserved and no transfer was scheduled.

Fresh production reads reconstructed both branches. Across them, custody conserves exactly: `6 deposited = 3 finalized transfers + 3 reserved`, while the contract balance is 3. Exact action transactions, evidence lineage, child-transfer proof, terminal readbacks and conservation are fixed in `deployments/studionet-live-branches.json`.

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
| Deployer | Deploy frozen FirstFault V2 successor | Contract deployment | [`0x189c6d…1db2d`](https://explorer-studio.genlayer.com/tx/0x189c6d629cde61aff8893c3d8dcc45ea9908a0a4da95d6a3b7b5b5db3fd1db2d) | `FINALIZED` / `FINISHED_WITH_RETURN` | [V2 address](https://explorer-studio.genlayer.com/address/0x24c060E5394b5bD14a5546B055A7F049f9842987), exact source hash and 20-method schema verified |
| Deployer | Deploy frozen FirstFault V3 successor | Contract deployment | [`0x9e3d32…b62fdc`](https://explorer-studio.genlayer.com/tx/0x9e3d328e3ec5a325ab25fffa26b006b692f7891d11de05703436304830b62fdc) | `FINALIZED` / `FINISHED_WITH_RETURN` | [V3 address](https://explorer-studio.genlayer.com/address/0x9236A835741DF7f891613B5578753647C140124E), exact source hash and 24-method schema verified |
| Buyer | Create workflow | `create_workflow` | [`0x058022…fb084`](https://explorer-studio.genlayer.com/tx/0x0580228b6382bf4d75123ff393fb975016c89cf150b6ac7b0026ebc3ce7fb084) | `FINALIZED` / `SUCCESS`, 5/5 validators agreed | `firstfault-demo-20260905-1` is `DRAFT`; actors, briefs, 10/10/10 holds and zero custody read back from contract |
| Buyer | Repeat an existing workflow ID | `create_workflow` | [`0xa48670…f40b7f`](https://explorer-studio.genlayer.com/tx/0xa486707f0b85c57c334b3cf57e18cb71d86a39b894d05e639f5061314af40b7f) | `FINALIZED` / `ERROR`; rollback `Workflow already exists` | Original workflow remains `DRAFT` and accounting remains unchanged |
| Reviewer | Inspect the successful workflow from the live app | `get_workflow`, `get_step`, `get_accounting` | Read-only production call tied to [`0x058022…fb084`](https://explorer-studio.genlayer.com/tx/0x0580228b6382bf4d75123ff393fb975016c89cf150b6ac7b0026ebc3ce7fb084) | Vercel deployment of commit `35b65b5` returned HTTP 200 | Live UI reconstructed `DRAFT`, all three workers, briefs, step states, 10/10/10 holds and zero custody |
| Researcher | Submit IANA-backed research | `submit_step` | [`0xbc0e5c…9d488`](https://explorer-studio.genlayer.com/tx/0xbc0e5cae9fc8767020c660fc46cc5c1e58fd01b1b9b22522cc509817d569d488) | `FINALIZED` / `SUCCESS` | Research output and primary-source evidence hash read back as `SUBMITTED` |
| Writer | Submit unsupported 250,000-user claim | `submit_step` | [`0xe7c7bf…acc69`](https://explorer-studio.genlayer.com/tx/0xe7c7bf6c77329d9f07017c0463187f512275258461c74167a716c66f66facc69) | `FINALIZED` / `SUCCESS` | Writer output binds exactly to the Research output hash |
| Publisher | Reproduce Writer artifact exactly | `submit_step` | [`0x1bf028…38527`](https://explorer-studio.genlayer.com/tx/0x1bf028a26051ca0e7fcf029ed08204f21d2a49fa51025a9bd5cc069d3ae38527) | `FINALIZED` / `SUCCESS` | Publisher output hash equals Writer output hash; workflow becomes `READY_FOR_REVIEW` |
| Buyer | Accept completed workflow | `accept_workflow` | [`0x49a652…33ba23`](https://explorer-studio.genlayer.com/tx/0x49a65263371e25c2b3cc40ce44d11c564a1d650b030ddf09ba9788839b33ba23) | `FINALIZED` / `SUCCESS` | 3 payout scheduled, reserved 0; three value-credited child transfers finalized |
| Contract | Execute accept-all payouts | Triggered external transfers | [`Researcher`](https://explorer-studio.genlayer.com/tx/0x23b1d7065ed84e570e9c16b5ac5ba88c91d1cb200f9cabf625385a9253285c0f), [`Writer`](https://explorer-studio.genlayer.com/tx/0x386cbc3588c147ae194ebe089a28b994be491786afbb40fe845d324a6867ca96), [`Publisher`](https://explorer-studio.genlayer.com/tx/0x0a5f40c761490b72de76f6fcf6fe009c4c4fcebab7c2777499490e0f6c78c9a5) | All `FINALIZED`, value credited | Exact stored recipients receive 1 simulated GEN each |
| Buyer | Open concrete source-backed rejection | `open_dispute` | [`0xe954b0…f26998`](https://explorer-studio.genlayer.com/tx/0xe954b0505fcdf06213ce696905db55a3330edf9404818d9a66add75e94f26998) | `FINALIZED` / `SUCCESS` | Workflow becomes `DISPUTED`; all 51 remains reserved |
| Buyer and validators | Determine first material breach | `adjudicate` | [`0x1a785c…717fc9`](https://explorer-studio.genlayer.com/tx/0x1a785cd36e5c9ae8bdb0839d47d9554587a3066a301f58478ac8d69b7f717fc9) | `FINALIZED` / `SUCCESS`; 3 agree, 1 disagree, 1 idle | `FIRST_BREACH`, step `1`; 34 payout + 17 refund scheduled, reserved 0 |
| Contract | Execute adjudication value consequence | Triggered external transfers | [`17 refund`](https://explorer-studio.genlayer.com/tx/0xb47500b7b0d1c819d5522e4384434be9dce304f39c947e43ca34b6e0784e326d), [`11 payout`](https://explorer-studio.genlayer.com/tx/0xc03a8adb99a2fbeed8d924c19b3acebd89a925dec1c071366e2df4ba9fff1304), [`23 payout`](https://explorer-studio.genlayer.com/tx/0xb01ae878c44e5a257f6c9764a0273473fba6945b1b9bb221788986109bfda1d5) | All `FINALIZED`, value credited | Exact recipients and values total 51; contract balance reads 0 |
| V3 Buyer and validators | Decide the current production demo dispute | `adjudicate` | [`0xd3fecd…f4f512`](https://explorer-studio.genlayer.com/tx/0xd3fecdeafbb30c7382a32dced6f8eab2438aa90e4eba25565cc24047def4f512) | `FINALIZED` / `MAJORITY_AGREE`; 3 agree, 2 disagree | `FIRST_BREACH`, Writer at step index `1`; 2 simulated GEN payout + 1 refund scheduled, reserved 0 |
| V3 contract | Execute the production-demo settlement | Triggered external transfers | [`Research payout`](https://explorer-studio.genlayer.com/tx/0xa7dc45c69507f18dbec622493ca81b57b6831d71d09934c223bef4b8489db671), [`Publisher payout`](https://explorer-studio.genlayer.com/tx/0xc0c607bcccff569ac847a95817477956b513fd3d1456357d606ce28f0dc8bbb1), [`Writer-hold refund`](https://explorer-studio.genlayer.com/tx/0x689368c746f8afe06c637a7e47cd64fe0c0d026392f038bde5711c81a9f4949a) | All `FINALIZED`, value credited | Three transfers of 1 simulated GEN total the 3 GEN deposit; contract balance reads 0 |
| Buyer after timeout | Preserve custody safely | `timeout_dispute_to_unresolved` | [`0xdf2b9f…6985e2`](https://explorer-studio.genlayer.com/tx/0xdf2b9f74f65b9e59678ecd9bcdb2594fe9d9fb3409b59dbe1f433bef4d6985e2) | `FINALIZED` / `SUCCESS` | `UNRESOLVED / CONSENSUS_TIMEOUT`; all 3 remains reserved, no payout/refund |

Machine-readable deployment and exercised-flow evidence is recorded in `deployments/studionet.json`, `deployments/studionet-v2.json`, `deployments/studionet-v3.json`, `deployments/studionet-evidence.json`, `deployments/studionet-golden-demo.json`, `deployments/studionet-live-branches.json`, `deployments/studionet-v3-live-evidence.json`, `deployments/studionet-v3-dispute-evidence.json`, and `deployments/vercel.json`.

## Known limitations

- Every deployed version is intentionally frozen; changing behavior requires a separately deployed and reviewed successor. Existing holds cannot be silently migrated.
- `UNRESOLVED` deliberately retains reserved value until a contract-governed recovery path succeeds.
- Localnet and Studionet activity demonstrates development behavior, not production-value settlement.
- Contract accounting deliberately distinguishes scheduled value from external transfer finality. The contract ledger records exact scheduled amounts and recipients; finalized child receipts with `valueCredited=true` are the execution proof surfaced by the frontend.

## License

MIT — see [LICENSE](LICENSE).
