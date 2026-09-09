# FirstFault V3 production promotion design

## Goal

Promote the verified FirstFault V3 Studionet deployment to the public frontend without changing the deployed contract or losing the recoverable V1 production configuration. The promotion succeeds only when a Vercel Preview reads the V3 workflow and accounting correctly before production is changed.

## Selected approach

Use a staged Vercel promotion.

1. Create a dedicated promotion branch from the merged `v2-dev` head.
2. Configure only that branch's Vercel Preview environment for V3.
3. Verify the preview against the fixed V3 deployment and live evidence.
4. Merge the reviewed promotion patch.
5. Change the Vercel Production environment to the same verified values and deploy once.
6. Verify the production URL and record the resulting deployment evidence.

This keeps the public site on V1 until the V3 preview has passed. No new Intelligent Contract deployment or GEN transfer is part of this promotion.

## Configuration

The V3 preview and production builds must use exactly these public variables:

- `NEXT_PUBLIC_GENLAYER_RPC_URL=https://studio.genlayer.com/api`
- `NEXT_PUBLIC_GENLAYER_CHAIN_ID=61999`
- `NEXT_PUBLIC_CONTRACT_ADDRESS=0x9236A835741DF7f891613B5578753647C140124E`
- `NEXT_PUBLIC_CONTRACT_VERSION=v3`

The repository's Vercel evidence manifest remains a record of the last verified production deployment. It must not be rewritten to claim V3 before the production deployment and browser checks have succeeded.

## Preview verification

The branch-scoped Preview environment must be configured before the preview is rebuilt. Verification uses the terminal V3 workflow `firstfault-v3-funded-20260909-1` and requires:

- The page loads without a wallet and identifies the V3 contract address.
- The workflow reads as `ACCEPTED_PENDING_FINALITY`.
- Deposited value is `3000000000000000000`, reserved value is `0`, and payout scheduled is `3000000000000000000`.
- Research, Writer, and Publisher evidence lineage matches the fixed on-chain hashes.
- The UI reports three finalized child transfers of `1000000000000000000` each to the assigned workers.
- The funding UI exposes the V3 intent flow and does not present direct unguarded funding as the normal path.

No write transaction is required for preview verification.

## Production promotion

After preview verification and review, set the Production environment to the same four values and deploy the merged commit. The deployment is complete only when the canonical production URL returns HTTP 200 and the same V3 workflow readback passes without a wallet.

Update `deployments/vercel.json` only after those checks. Its `deploymentCommit`, environment, verification timestamp, and V3 live readback must describe the actual production deployment rather than the preview.

## Failure handling and rollback

If preview verification fails, leave production on V1 and fix the promotion branch. If the production deployment succeeds but the V3 readback fails, restore the prior Production environment values and redeploy the last known V1 production commit recorded in `deployments/vercel.json`.

Rollback values are:

- Contract address: `0x2271AE904A97865491e4b24c49532f71B711eD5f`
- Contract version: `v1`
- Last verified production commit: `f38ea60c3a3a3fde38126c5116c53b88c970518b`

Rollback does not alter either deployed contract or any on-chain workflow.

## Tests and evidence gates

Before requesting any external action:

- Run the V3 deployment, source-revision, adapter, UI, and live-evidence tests.
- Run the production build.
- Confirm the promotion branch contains no secrets and no placeholder addresses.

External actions remain separate confirmation gates: GitHub push, Preview environment update/redeployment, Production environment update, and Production deployment. After production verification, commit the updated Vercel evidence manifest and its validation test through the normal PR path.
