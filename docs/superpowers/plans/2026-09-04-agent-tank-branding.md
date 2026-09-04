# Agent Tank Branding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add unmistakable but non-misleading Agent Tank 2026 co-branding to the FirstFault frontend.

**Architecture:** A reusable code-native `AgentTankBadge` renders the event identity without importing portal artwork. The existing page places it beside the primary wordmark, repeats a compact event label in the hero, and uses truthful Studionet attribution in the footer.

**Tech Stack:** React 19, Next.js 16, TypeScript, CSS, Vitest, Testing Library.

## Global Constraints

- FirstFault remains the primary product identity.
- Copy must say `Built for GenLayer`, `AGENT TANK 2026`, and `Agent Tank Hackathon Entry`.
- Do not claim official-product status, endorsement, winning, production deployment, or production settlement.
- Do not copy portal photography, the lobster character, or portal artwork.
- Preserve the explicit simulated Studionet GEN disclosure.
- The 390px layout must not overflow horizontally or make workflow search unusable.

---

### Task 1: Add and verify Agent Tank co-branding

**Files:**
- Create: `frontend/components/AgentTankBadge.tsx`
- Modify: `frontend/components/firstfault/firstfault-ui.test.tsx`
- Modify: `frontend/app/page.tsx`
- Modify: `frontend/app/globals.css`

**Interfaces:**
- Produces: `AgentTankBadge({ compact?: boolean }): JSX.Element`.
- Consumes: the existing `.ff-logo`, `.ff-mainbar-inner`, `.ff-kicker`, and footer layout.

- [ ] **Step 1: Write the failing component test**

Add a test that renders `AgentTankBadge` and asserts visible text `Built for GenLayer` and `AGENT TANK 2026`. Add a page-level static label assertion for `Agent Tank Hackathon Entry` through the smallest real exported component that renders the hero label.

- [ ] **Step 2: Verify the test fails for the missing component**

Run `npm --prefix frontend test -- components/firstfault/firstfault-ui.test.tsx`.

Expected: FAIL because `AgentTankBadge` does not exist.

- [ ] **Step 3: Implement the code-native badge**

Create a semantic badge with an abstract `GL` mark, the two required text lines, and `aria-label="Built for GenLayer Agent Tank 2026"`. Render the full badge beside the FirstFault wordmark and the compact form in the footer. Add `Agent Tank Hackathon Entry` before the existing hero kicker.

- [ ] **Step 4: Add responsive styling**

Use dark navy, cyan, and neon-lime within the badge only. At widths below 620px, hide the `Built for GenLayer` line, retain `AGENT TANK 2026`, and keep the search field on its own full-width row.

- [ ] **Step 5: Verify automated gates**

Run:

```text
npm --prefix frontend test -- components/firstfault/firstfault-ui.test.tsx lib/firstfault/status.test.ts lib/contracts/verifyDeployment.test.ts
npm --prefix frontend run lint
npm --prefix frontend run build
```

Expected: 11 or more focused tests pass, TypeScript exits zero, and the production build exits zero.

- [ ] **Step 6: Verify desktop and mobile behavior**

Open the local app, inspect desktop and 390×844 viewports, confirm the three required phrases, no horizontal overflow, no overlap with search or wallet controls, and no uncaught console errors.

- [ ] **Step 7: Commit**

Stage only the badge, test, page, and CSS files, then commit with:

```text
feat: add Agent Tank hackathon co-branding
```
