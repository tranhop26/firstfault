# FirstFault V2 Studionet successor

`contracts/firstfault_v2.py` is the separately deployed, intentionally frozen
Studionet successor. The verified Studionet V1 source, manifest, address, and
evidence files remain unchanged.

## Behavior changed

| Trigger | V1 result | V2 result |
|---|---|---|
| Orchestrator starts after the Research deadline | Starts an already expired workflow | Reverts before consuming the nonce |
| A worker misses a deadline | Workflow remains `IN_PROGRESS` | Anyone may open adjudication; submitted upstream work is judged, the missing step breaches, and later unsubmitted steps are `BLOCKED` |
| Buyer does not review completed work for 24 hours | Workflow remains `READY_FOR_REVIEW` | Anyone may open adjudication over the already accepted evidence set |
| Time passes after evidence is accepted | Evidence becomes ineligible after one hour | Stored evidence remains eligible; transaction timestamps still cannot be from the future |
| A fresh cure reopens adjudication | Old dispute timestamp can immediately satisfy timeout | A new adjudication round and timeout clock are recorded |
| Semantic consensus is unavailable or safely times out | A cure is required to try again | Anyone may retry the same accepted evidence after the one-hour retry delay |
| Several workers need a cure | The first cure consumes the workflow-wide slot | Each worker has one append-only cure slot; an accepted cure remains eligible across retries |
| A Research or cure URL changes later | Adjudication sees the latest page | Submission consensus stores normalized source text, its hash, and snapshot schema; adjudication reads that immutable snapshot |

Timeout calls do not transfer value. They open a new adjudication round. For an
incomplete chain, an unsubmitted expired step is an objective breach and later
unsubmitted steps are dependency-blocked; any earlier submitted work still goes
through semantic review before the contract schedules its payout or refund.

## Frontend contract

The frontend keeps V1 as the default. Set `NEXT_PUBLIC_CONTRACT_VERSION=v2` only
with the address of a separately deployed and verified V2 contract. V2 mode adds
worker-deadline, buyer-review, and same-evidence retry actions only when their
on-chain clocks have elapsed. The recovery panel reads worker cures and the
current settlement proposal from the contract, checks that the four
allocation fields total the exact reserved value, and enables execution only
after all four readback approvals are true.

Every GEN input is converted to 18-decimal base units before a write, while
contract readback is formatted back to GEN for display. A fresh browser can scan
the contract's finalized incoming transaction history and reconstruct the exact
parent plus external child-transfer proof, including partial mutual allocations.
The evidence ledger shows the live source link separately from the source text
and hash captured by validator consensus.

## Verification

Run:

```shell
genvm-lint check contracts/firstfault_v2.py
python -m pytest tests/direct -q
npm --prefix frontend test -- --exclude lib/contracts/FirstFault.localnet.test.ts
npm run lint
npm run build
```

The browser Localnet adapter test additionally requires a running GenLayer
Localnet at `http://127.0.0.1:4000/api`.

V2 was deployed separately at
[`0x24c060E5394b5bD14a5546B055A7F049f9842987`](https://explorer-studio.genlayer.com/address/0x24c060E5394b5bD14a5546B055A7F049f9842987).
Transaction
[`0x189c6d…1db2d`](https://explorer-studio.genlayer.com/tx/0x189c6d629cde61aff8893c3d8dcc45ea9908a0a4da95d6a3b7b5b5db3fd1db2d)
finalized successfully from deployer
`0x21b45103dd05c43969daF3CbB4277391777e2eC7`. RPC readback matched source
commit `e171fc108c92d3e9d346686c5f87c2e760c05aee`, normalized SHA-256
`8bff11b1506437ef5c1ebab01ce084e0a63f57c1d78319953f19263987dc83c5`,
and the exact 20-method schema recorded in `deployments/studionet-v2.json`.

## Guarded Studionet deployment path

`npm run deploy:v2` is the only repository entry point for a V2 Studionet
deployment. It reads `contracts/firstfault_v2.py`, requires that file to be
tracked and unchanged at the current Git commit, checks live chain ID `61999`,
and refuses to run when `deployments/studionet-v2.json` already exists. The V2
contract has no constructor arguments.

Immediately before running the command, confirm the exact deployer wallet,
Studionet endpoint, Git commit, normalized source SHA-256, and proposed
transaction. Supply the key only through `GENLAYER_DEPLOYER_PRIVATE_KEY`; it is
excluded from preflight, errors, safe logs, and the manifest. The existing
`npm run deploy` command remains the frozen V1 path.

After submission, the V2 path prints the transaction hash before waiting for
finality. If waiting or readback is interrupted, set
`GENLAYER_V2_DEPLOYMENT_TX_HASH` to that exact printed transaction hash and run
`npm run deploy:v2` again. Resume mode verifies the original transaction,
deployer, finalized successful receipt, deployed address, source, and exact
20-method schema without submitting a second deployment.

Only a successful readback writes `deployments/studionet-v2.json`. The manifest
records the verified V1 address as predecessor, the exact source commit and
hash, and the separately deployed V2 address and transaction. Creating this
manifest does not enable V2 in the frontend. Live workflow evidence and a
separately confirmed frontend deployment are required before changing the
production contract version.

## Source snapshot boundary

Research and cure submissions render the canonical HTTPS URL inside a
nondeterministic block. The leader proposes normalized text and each validator
independently fetches and requires the exact same result. Empty, oversized,
unavailable, or consensus-divergent content is not committed. The accepted text,
SHA-256 hash, URL, snapshot schema, actor, timestamps, and nonce are bound into
the evidence domain. Later adjudication uses only stored snapshots and never
re-fetches the mutable live page.

This proves what validator consensus captured from that URL at submission. It
does not prove the publisher's legal identity, a web server signature, or that
the source was authoritative for every possible brief; those remain semantic
and provenance-policy concerns.
