# Agent Tank Branding Design

**Status:** User-approved visual direction, pending written-spec review  
**Scope:** Frontend presentation only; no contract, custody, state, or transaction behavior changes.

## Purpose

Make FirstFault immediately recognizable as an Agent Tank 2026 hackathon entry while keeping FirstFault as the primary product identity. The treatment must not imply that FirstFault is an official GenLayer product, endorsed winner, or deployed production service.

## Approved treatment

- Add a compact co-brand badge beside the FirstFault wordmark: `Built for GenLayer` over `AGENT TANK 2026`.
- Use Agent Tank-inspired dark navy, cyan, and restrained neon-lime accents so the badge remains distinct on FirstFault's orange header.
- Keep the badge visually smaller than the FirstFault logo and separate it with a subtle divider.
- Add `Agent Tank Hackathon Entry` as a small hero label without replacing the existing FirstFault proposition.
- Change the footer attribution to `Built for Agent Tank · Powered by GenLayer Studionet`.
- Preserve the existing explicit statement that all displayed GEN is simulated Studionet value.

## Asset and trademark boundary

Use a custom code-native badge and neutral GenLayer wordmark treatment. Do not copy portal photography, the lobster character, portal artwork, or imply official certification. If an official GenLayer logo asset is later supplied or its reuse is explicitly licensed, the badge mark may be replaced without changing its layout or wording.

## Responsive behavior

On desktop, the badge sits beside the FirstFault logo in the main header. On narrow screens, it moves below the wordmark or collapses to `AGENT TANK 2026`; it must never reduce the workflow search field below usable width. Hero and footer labels wrap without horizontal scrolling.

## Verification

- Component test asserts all three identifying phrases are visible.
- Desktop and 390px mobile screenshots confirm no overlap or horizontal overflow.
- Type check and production build remain clean.
- Browser console contains no uncaught errors.
