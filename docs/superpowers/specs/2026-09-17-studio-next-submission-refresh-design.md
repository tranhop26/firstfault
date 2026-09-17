# Studio Next Submission Refresh Design

## Goal

Make the public FirstFault repository and Agent Tank submission copy accurately describe the deployed Studio Next application and its verified end-to-end happy path, without changing contract or frontend behavior.

## Scope

The refresh modifies documentation and machine-readable evidence only:

- Update `README.md` so the live application is identified as Studio Next on chain ID `61997`, using contract `0xf7136eDe8ba1761562fEcb2147609F3A2932c449`.
- Replace the obsolete Studionet judge walkthrough with the Studio Next workflow `firstfault-studio-next-final-20260917-1`.
- Update `docs/SUBMISSION.md` so all Portal-facing copy, proof links, network language, how-to steps, and limitations match Studio Next.
- Set the mandatory demo video to `https://www.youtube.com/watch?v=yV5kURhk76g`.
- Add a dedicated machine-readable Studio Next happy-path evidence file containing the deployment, workflow, actor, action, evidence-lineage, acceptance, and finalized child-transfer proofs.
- Extend the README evidence matrix with the Studio Next happy path while retaining Studionet records under an explicit historical label.
- Commit the documentation/evidence change on `fix/multi-wallet-provider-selection`, then prepare the branch for integration into the public default branch.

The refresh does not redeploy the contract, submit another transaction, change production configuration, modify application code, or run a new dispute.

## Evidence Model

The new evidence record will distinguish contract intent from execution proof:

- Network: Studio Next, RPC `https://studio-next.genlayer.com/api`, chain ID `61997`.
- Contract deployment: address `0xf7136eDe8ba1761562fEcb2147609F3A2932c449` and deployment transaction `0x48491dfc5f18ab2cdc6c74e37e9a427261c3964e5220c61c5e5178108af76a0a`.
- Workflow: `firstfault-studio-next-final-20260917-1` with three distinct bound worker roles.
- Lifecycle proof: create, prepare funding, fund, start, three evidence submissions, and buyer acceptance.
- Acceptance proof: parent transaction `0xd396f50e33e776b056251f6ff86bf40d7dbb35de39d0df1b98ba3f8a30f80c4d`, finalized with successful GenVM execution.
- Settlement proof: three triggered external transfers, each independently verified as finalized, with exact recipient and `10 GEN` value.
- Custody conservation: `30 GEN deposited = 30 GEN finalized payouts + 0 GEN reserved`.

Every transaction recorded as successful must have both finality and execution/value evidence. Child hashes will be mapped to recipients from their own Explorer details rather than inferred from display order.

## Public Documentation Structure

`README.md` will lead with the active Studio Next deployment and a wallet-free judge walkthrough. Historical Studionet evidence remains available but cannot be described as the current production network. The requirements section will state the exact release dependencies already installed:

- `@genlayer/transaction-kit@0.1.0-rc.2`
- `@genlayer/transaction-kit-react@0.1.0-rc.2`
- `genlayer-js@2.0.0-rc.1`

`docs/SUBMISSION.md` will provide copy that can be pasted into the Portal without contradicting the production site. It will explain why decentralized judgment matters even though the featured Studio Next proof is an accept-all happy path: the contract stores evidence lineage and includes validator adjudication for disputes, while the happy path proves real custody, fees, contract state, and exact external transfer consequences.

## Verification

Before completion:

1. Validate every referenced Studio Next transaction and recipient mapping against Explorer evidence already produced in the verified run.
2. Parse the new evidence file as JSON.
3. Search public submission files for stale claims that production still uses Studionet or chain ID `61999`.
4. Run the relevant release-dependency and deployment-evidence tests.
5. Run frontend type checking, the non-Localnet test suite, and the production build.
6. Confirm the worktree contains only the intended documentation/evidence changes before committing.

## Repository Integration

The documentation commit remains reviewable on `fix/multi-wallet-provider-selection`. Integration into `main` must preserve the already-pushed branch history and avoid force pushes or destructive resets. A normal pull request or fast-forward/merge is acceptable only after the final diff and verification results are reviewed.
