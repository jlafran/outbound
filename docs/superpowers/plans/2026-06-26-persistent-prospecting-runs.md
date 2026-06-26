# Persistent Prospecting Runs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist every dental prospecting run and refresh pending No2Bounce checks without repeating Brave searches or paid verification submissions.

**Architecture:** Store an immutable-ish JSON snapshot per run plus normalized mutable email-verification rows. Extend the verifier with tracking-aware submit and refresh behavior, then orchestrate runs through a focused application service and server actions. Keep all database access server-side and scoped by workspace and campaign.

**Tech Stack:** Next.js 15 App Router, TypeScript, Drizzle ORM, PostgreSQL/Supabase, Vitest, PGlite, No2Bounce HTTP API.

---

### Task 1: Tracking-aware email verifier

**Files:**
- Modify: `src/features/prospecting/email-verifier.ts`
- Modify: `src/features/prospecting/prospecting-types.ts`
- Modify: `src/features/prospecting/dental-prospecting-service.ts`
- Test: `tests/unit/email-verifier.test.ts`
- Test: `tests/unit/dental-prospecting-service.test.ts`

- [ ] Add failing tests asserting that pending No2Bounce results include `provider: "no2bounce"` and `trackingId`, and that `refresh("track-123")` performs only a GET.
- [ ] Run `pnpm vitest run tests/unit/email-verifier.test.ts tests/unit/dental-prospecting-service.test.ts` and confirm the tests fail because tracking metadata and `refresh` do not exist.
- [ ] Extend `EmailVerificationResult` to include optional `provider` and `trackingId`, and add optional `refresh(trackingId)` to `EmailVerifier`.
- [ ] Return tracking metadata from `verifyNo2BounceSingle`, implement GET-only `refresh`, and copy metadata into each prospecting email candidate.
- [ ] Re-run the two unit files and confirm they pass.

### Task 2: Prospecting persistence schema and migration

**Files:**
- Create: `src/db/schema/prospecting.ts`
- Modify: `src/db/schema/index.ts`
- Create: `tests/integration/prospecting-migration.test.ts`
- Generate: `drizzle/0014_*.sql`

- [ ] Write a failing PGlite migration test requiring `prospecting_runs`, `prospecting_email_verifications`, their foreign keys, uniqueness constraints, indexes, checks, and enabled RLS.
- [ ] Run `pnpm vitest run tests/integration/prospecting-migration.test.ts` and confirm failure because migration `0014` is absent.
- [ ] Define Drizzle enums/tables with workspace-scoped campaign/run foreign keys, JSON snapshot, tracking ID, timestamps, partial pending index, and checks.
- [ ] Run `pnpm db:generate` to create migration `0014`, then add `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` for both new public tables.
- [ ] Re-run the migration test and confirm it passes.

### Task 3: Repository and snapshot synchronization

**Files:**
- Create: `src/features/prospecting/prospecting-repository.ts`
- Create: `tests/integration/prospecting-repository.test.ts`

- [ ] Write failing tests for starting/completing a run, retrieving the latest completed run by workspace/campaign, listing pending verifications, and synchronizing an updated status into both the row and JSON snapshot.
- [ ] Run `pnpm vitest run tests/integration/prospecting-repository.test.ts` and confirm failure because the repository does not exist.
- [ ] Implement `ProspectingRepository` with memory and Drizzle adapters. Use one transaction for `completeRun` and one transaction for `updateVerification` plus snapshot synchronization.
- [ ] Ensure failed runs remain auditable but `getLatestCompletedRun` returns the last usable result.
- [ ] Re-run the repository test and confirm it passes.

### Task 4: Application service

**Files:**
- Create: `src/features/prospecting/prospecting-run-service.ts`
- Create: `tests/unit/prospecting-run-service.test.ts`
- Modify: `src/features/app/app-services.ts`

- [ ] Write failing service tests showing that a new run is persisted around one prospecting execution and that refreshing pending rows calls `refresh(trackingId)` rather than `verify(email)`.
- [ ] Run `pnpm vitest run tests/unit/prospecting-run-service.test.ts` and confirm failure because the service is missing.
- [ ] Implement `ProspectingRunService.run` and `refreshPending`, with dependency injection for ID/time generation, the dental service, repository, and verifier.
- [ ] Add the repository/service to production and memory app-service composition without exposing provider secrets.
- [ ] Re-run the service tests and existing prospecting unit tests.

### Task 5: Server actions and persisted UI

**Files:**
- Create: `src/features/prospecting/prospecting-actions.ts`
- Modify: `src/app/(app)/campaigns/[id]/prospecting-test/page.tsx`
- Create: `tests/unit/prospecting-actions.test.ts`

- [ ] Write failing action tests for authenticated workspace-scoped run and refresh submissions, including campaign-not-found and missing-provider errors.
- [ ] Run `pnpm vitest run tests/unit/prospecting-actions.test.ts` and confirm failure because actions are missing.
- [ ] Implement server actions that call the application service, revalidate, and redirect to a clean URL with a safe status query parameter.
- [ ] Replace `?run=1` execution in the page with persisted reads, `Ejecutar nueva corrida`, and conditional `Actualizar verificaciones pendientes` forms.
- [ ] Display run date/status, pending count, and explicit notice that refreshing does not submit new checks.
- [ ] Run the action tests, typecheck, and a production build.

### Task 6: Production database and end-to-end verification

**Files:**
- Modify only generated migration metadata if required by Drizzle.

- [ ] Run the full relevant test set, `pnpm typecheck`, `pnpm lint`, and `pnpm run build`; fix any failures and re-run from scratch.
- [ ] Apply migration `0014` to the configured Supabase database with `pnpm db:migrate`.
- [ ] Query `pg_tables`, `pg_indexes`, and row-security flags to verify both tables and expected indexes.
- [ ] Commit the implementation, push `main`, and wait for the Vercel production deployment.
- [ ] Open the production route, verify the previous/latest run loads without external calls, execute one controlled run, and verify refresh performs GET-only for pending tracking IDs.

