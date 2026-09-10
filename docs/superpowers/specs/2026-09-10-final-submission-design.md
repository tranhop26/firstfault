# FirstFault final submission design

## Goal

Make the public repository and hackathon submission describe the verified FirstFault V3 system accurately, give judges a fast read-only demo path, and remove claims made stale by the V3 production promotion and live dispute proof.

## Selected approach

Use the repository as the canonical source for submission copy:

1. Update `README.md` so setup, active deployment, demo instructions, evidence matrix, and limitations match V3.
2. Add `docs/SUBMISSION.md` with concise, ready-to-paste fields: title, tagline, problem, solution, GenLayer role, workflow, technical implementation, proof, links, and limitations.
3. Review the existing submission form in the browser and map the canonical copy into its actual fields.
4. Fill the form only after the repository copy is complete and reviewable. Stop immediately before any final save, publish, or submit action that changes the public entry and request action-time confirmation.

This documentation pass does not change the Intelligent Contract, frontend behavior, Vercel environment, wallet state, or Studionet custody.

## Authoritative facts

- Production URL: `https://firstfault.vercel.app`
- Repository: `https://github.com/tranhop26/firstfault`
- Network: Studionet, chain ID `61999`
- Active contract: `0x9236A835741DF7f891613B5578753647C140124E`
- Contract version: V3, intentionally frozen
- Contract source commit: `6e4b3b8a632ee519d571674af0b5e64bfc6d74e1`
- Contract source SHA-256: `7164c7edf6bd2def6dce69615b4acce0f8899ffa7fa094b8cd59f6c1df426617`
- Deployment transaction: `0x9e3d328e3ec5a325ab25fffa26b006b692f7891d11de05703436304830b62fdc`
- Judge demo workflow: `firstfault-v3-writer-breach-20260910-1`
- Demonstrated outcome: Research `COMPLIANT`, Writer `MATERIAL_BREACH`, Publisher `COMPLIANT`; 1 GEN Research payout, 1 GEN Publisher payout, and 1 GEN Writer-hold refund to Buyer, all finalized and value-credited.

The README will identify the stable production URL and the runtime fix merge commit. It will not claim that a Vercel deployment ID remains the latest deployment, because documentation-only merges also trigger new deployments.

## README structure

Keep the existing technical depth and make these focused changes:

- Change the V3 environment guidance from V1/V2-only wording to the active V3 configuration.
- Add a short “Judge demo” section near the live application section with the exact workflow ID and expected screen result.
- Replace the stale Live application paragraph with the canonical URL, active contract, and machine-readable evidence locations.
- Add the live V3 dispute actions and finalized transfer consequence to the evidence matrix.
- Remove the false limitation that V3 lacks fixed live evidence and Production still uses V1.
- Keep the statements that Studionet GEN is simulated, contracts are frozen, and scheduled accounting is distinct from transfer receipts.

## Submission document

`docs/SUBMISSION.md` will be short enough to paste into a hackathon form and will lead with the trust problem and the on-chain decision:

- Buyer cannot unilaterally reject valid work.
- Workers cannot self-certify weak output.
- Downstream agents cannot silently absorb an upstream error.
- GenLayer validators determine the earliest material causal breach from bound evidence.
- The contract applies payouts, refunds, or the safe `UNRESOLVED` state.

The demo steps will require no wallet:

1. Open Production.
2. Paste `firstfault-v3-writer-breach-20260910-1` into Workflow ID.
3. Select Inspect case.
4. Confirm `FIRST_BREACH`, earliest breach at Writer step 2, and `Transfers finalized` with three explorer links.

## Verification

- Scan public documentation for stale V1/V2 production claims and obsolete deployment IDs.
- Check every repository, production, contract, deployment-transaction, and evidence link.
- Confirm all advertised contract, workflow, hash, allocation, and limitation claims against committed manifests.
- Run the non-Localnet frontend suite, TypeScript checks, and production build even though the change is documentation-only.
- Inspect the final diff for secrets, internal task material outside the already tracked Superpowers documents, placeholders, and unsupported claims.

## External action gates

Repository edits and local commits are reversible. Pushing the documentation branch, creating or merging its PR, changing the submission form, and publishing/saving the public submission each require the identity and action checks defined by the GenLayer workflow. Form content will be prepared completely before requesting the final submission action.
