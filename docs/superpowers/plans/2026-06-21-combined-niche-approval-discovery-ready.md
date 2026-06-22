# Combined Niche Approval and Discovery Ready Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make successful niche approval immediately finish in `discovery_ready`, while allowing a failed second transition to be retried without approving or auditing twice.

**Architecture:** Keep the two campaign domain transitions unchanged and orchestrate them in `approveNichesSubmission`. The orchestration reads current campaign state to distinguish a fresh approval from an already-approved retry, maps a readiness failure to a specific friendly error, and leaves the UI with one approval step.

**Tech Stack:** TypeScript, Next.js Server Actions, React, Vitest, Playwright.

---

### Task 1: Approval orchestration tests

**Files:**
- Modify: `tests/integration/dashboard-actions.test.ts`
- Test: `tests/integration/dashboard-actions.test.ts`

- [x] Add a test proving one approval submission persists `discovery_ready` and returns the twice-incremented version.
- [x] Add a test that fails the first `discovery_ready` transition, proving the first submission returns a friendly recoverable error while leaving an approved `niche_review`.
- [x] Retry the same approval submission and prove it reaches `discovery_ready` without calling approval again, preventing a duplicate audit.
- [x] Run `pnpm test tests/integration/dashboard-actions.test.ts` and confirm the new tests fail for the current two-step behavior.

### Task 2: Minimal orchestration implementation

**Files:**
- Modify: `src/features/campaigns/campaign-action-logic.ts`

- [x] Read the persisted campaign after parsing the mutation.
- [x] For unapproved `niche_review`, call `approveNiches`, then call `moveToDiscoveryReady` with the returned version.
- [x] For already-approved `niche_review`, skip `approveNiches` and call `moveToDiscoveryReady` with the persisted version.
- [x] Return a stable friendly recovery message when readiness fails after approval.
- [x] Run `pnpm test tests/integration/dashboard-actions.test.ts` and confirm the focused tests pass.

### Task 3: Remove the extra visible workflow step

**Files:**
- Modify: `src/features/campaigns/campaign-actions.ts`
- Modify: `src/app/(app)/campaigns/[id]/campaign-workflow.tsx`
- Modify: `tests/e2e/campaign-dry-run.spec.ts`

- [x] Remove the separate readiness Server Action export and client action state.
- [x] Render the approval form for every `niche_review`, initializing selection from persisted approved niches so a retry can submit.
- [x] Remove the `Preparar discovery` button and update E2E to assert it is absent after approval.
- [x] Assert `Lista para discovery` and `Generar datos dry-run` immediately after clicking `Aprobar nichos`.

### Task 4: Full verification and commit

**Files:**
- Review all modified files.

- [x] Run the focused test and full `pnpm test`.
- [x] Run `pnpm test:e2e` and confirm both tests pass.
- [x] Run `pnpm lint`, `pnpm typecheck`, and `pnpm build`.
- [x] Run `git diff --check`, inspect the diff, and verify no visible `Preparar discovery` workflow remains.
- [x] Commit with `fix: advance approved campaigns to discovery ready`.
