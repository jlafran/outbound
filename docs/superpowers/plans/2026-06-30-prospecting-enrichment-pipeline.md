# Prospecting Enrichment Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enrich Brave-discovered dental companies from their official websites, associate real decision makers, score each lead from auditable evidence, and generate a personalized draft without adding paid providers.

**Architecture:** Add a safe HTTP crawler and HTML extractor ahead of contact verification. Feed structured website evidence and Brave people results into isolated association, scoring, and message-building modules, then persist their output in the existing prospecting snapshot. External failures remain per-company and No2Bounce submissions remain capped.

**Tech Stack:** Next.js 15, TypeScript, native `fetch`, Cheerio, Brave Search API, No2Bounce, Vitest, PostgreSQL snapshot persistence.

---

### Task 1: Enrichment result types

**Files:**
- Modify: `src/features/prospecting/prospecting-types.ts`
- Test: `tests/unit/prospecting-types.test.ts`

- [ ] Write a failing type/runtime fixture test requiring `websiteResearch`, `scoreBreakdown`, `recommendedContact`, and `messageDraft` on an enriched lead.
- [ ] Run `pnpm vitest run tests/unit/prospecting-types.test.ts`; confirm RED because the enrichment schema/parser is absent.
- [ ] Add Zod schemas and inferred types for crawl page states, website people, evidence, score components, recommended contact, and message draft. Keep existing result fields backward compatible.
- [ ] Run the test and confirm GREEN.

### Task 2: Safe official website crawler

**Files:**
- Create: `src/features/prospecting/official-website-crawler.ts`
- Test: `tests/unit/official-website-crawler.test.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

- [ ] Add Cheerio with `pnpm add cheerio` and keep the lockfile.
- [ ] Write failing tests with injected DNS and fetch adapters proving that private IPs, credentials, non-HTTP schemes, cross-domain redirects, oversized/non-HTML responses, and robots-disallowed paths are rejected.
- [ ] Write failing tests proving that the crawler visits the candidate URL, homepage, and at most three prioritized same-domain links, with five content pages maximum.
- [ ] Run `pnpm vitest run tests/unit/official-website-crawler.test.ts`; confirm RED because the crawler is absent.
- [ ] Implement `OfficialWebsiteCrawler.crawl({ domain, candidateUrl })`, per-request timeout, byte limit, redirect validation, public-address validation, robots parsing, same-domain canonicalization, and prioritized link selection.
- [ ] Re-run the crawler tests and confirm GREEN.

### Task 3: Structured website research extraction

**Files:**
- Create: `src/features/prospecting/website-research-extractor.ts`
- Test: `tests/unit/website-research-extractor.test.ts`

- [ ] Write fixture-driven failing tests for visible/mailto emails, tel/WhatsApp links, LinkedIn/Instagram, company description, location, services, appointment forms, branches, named people with roles, and source-specific evidence.
- [ ] Run `pnpm vitest run tests/unit/website-research-extractor.test.ts`; confirm RED because extraction is absent.
- [ ] Implement extraction from Cheerio-loaded HTML, normalizing and deduplicating values while retaining the exact page URL for every evidence item.
- [ ] Detect near-empty script-shell pages as `javascript_required` without executing scripts.
- [ ] Re-run extractor tests and confirm GREEN.

### Task 4: Decision-maker association

**Files:**
- Create: `src/features/prospecting/decision-maker-associator.ts`
- Test: `tests/unit/decision-maker-associator.test.ts`
- Modify: `src/features/prospecting/dental-aesthetics-profile.ts`

- [ ] Write failing tests for high confidence from official-site role evidence, medium confidence from exact company-name Brave/LinkedIn evidence, and rejection of a role-only homonym.
- [ ] Run `pnpm vitest run tests/unit/decision-maker-associator.test.ts`; confirm RED.
- [ ] Export shared role normalization and implement weighted association evidence, company token matching, deduplication, confidence, and reasons.
- [ ] Re-run tests and confirm GREEN.

### Task 5: Explainable scoring and deterministic messages

**Files:**
- Create: `src/features/prospecting/prospecting-lead-scorer.ts`
- Create: `src/features/prospecting/personalized-message-builder.ts`
- Test: `tests/unit/prospecting-lead-scorer.test.ts`
- Test: `tests/unit/personalized-message-builder.test.ts`

- [ ] Write failing scoring tests covering the seven components, penalties, deduped evidence, and the hard rule that `actionable` requires a validated company, associated decision maker, and usable channel.
- [ ] Implement `scoreProspectingLead(input)` returning `{ total, status, components, penalties, reasons }` with the ranges approved in the design.
- [ ] Write failing message tests proving that the first sentence cites a real signal, hypotheses use conditional language, unsupported claims are absent, and no specific evidence means no draft.
- [ ] Implement `buildPersonalizedMessage(input)` returning subject/body/CTA/evidence/confidence/warnings without an LLM.
- [ ] Run both test files and confirm GREEN.

### Task 6: Integrate the full pipeline and cap verification cost

**Files:**
- Modify: `src/features/prospecting/dental-prospecting-service.ts`
- Modify: `src/features/prospecting/prospecting-actions.ts`
- Test: `tests/unit/dental-prospecting-service.test.ts`

- [ ] Add failing service tests showing Brave discovery followed by website crawling/extraction, decision association, explainable score, and evidence-based message in one lead.
- [ ] Add a failing test showing a crawl failure affects only one company.
- [ ] Add a failing test showing email candidates are ordered by public personal email, published decision-maker email, then generated patterns; at most three are submitted and verification stops after the first valid email.
- [ ] Inject the crawler into `DentalAestheticsProspectingService`, integrate the four modules, and construct the crawler in the server action.
- [ ] Re-run all prospecting service tests and confirm GREEN.

### Task 7: Persisted review UI and production verification

**Files:**
- Modify: `src/app/(app)/campaigns/[id]/prospecting-test/page.tsx`
- Modify: `tests/integration/prospecting-repository.test.ts`
- Test: `tests/unit/prospecting-enrichment-view.test.tsx`

- [ ] Add a failing persistence test proving the enriched snapshot survives a repository round trip without new external calls.
- [ ] Extract a focused lead-enrichment view component and write a failing render test for crawl status, official contacts, decision confidence, score breakdown, recommended channel, message, evidence, and missing-data reason.
- [ ] Update the page to render the component while preserving run/refresh actions.
- [ ] Run repository and UI tests and confirm GREEN.
- [ ] Run `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm run build`, and `git diff --check`.
- [ ] Commit, push `main`, wait for Vercel `READY`, then verify the authenticated production route without triggering an extra run automatically.

