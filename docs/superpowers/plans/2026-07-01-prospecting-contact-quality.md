# Prospecting Contact Quality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make prospecting runs produce cleaner contacts, stronger decision-maker discovery, and avoid No2Bounce spend for official website emails.

**Architecture:** Keep the current enrichment pipeline. Add source-aware email handling in the service, sanitize official-site extraction, improve crawl/link priorities for people/contact pages, and render contact readiness/verification labels in the UI.

**Tech Stack:** Next.js App Router, TypeScript, Vitest, Cheerio, Brave Search, No2Bounce.

---

### Task 1: Source-aware email verification

**Files:**
- Modify: `tests/unit/dental-prospecting-service.test.ts`
- Modify: `src/features/prospecting/dental-prospecting-service.ts`
- Modify: `src/features/prospecting/prospecting-types.ts`

- [ ] Add tests proving public official website emails are not verified, while pattern guesses are verified.
- [ ] Update email candidate source names so official website emails are explicit.
- [ ] Change verifier loop to skip official website candidates and submit only pattern/inferred candidates.

### Task 2: Official-site extraction quality

**Files:**
- Modify: `tests/unit/website-research-extractor.test.ts`
- Modify: `src/features/prospecting/website-research-extractor.ts`
- Modify: `tests/unit/official-website-crawler.test.ts`
- Modify: `src/features/prospecting/official-website-crawler.ts`

- [ ] Add tests for malformed email rejection.
- [ ] Add tests for people extraction from team/about pages.
- [ ] Expand useful role/page patterns and clean emails before storing.
- [ ] Prioritize team/about/contact URLs before generic service URLs.

### Task 3: UI readiness labels

**Files:**
- Modify: `tests/unit/prospecting-enrichment-view.test.tsx`
- Modify: `src/app/(app)/campaigns/[id]/prospecting-test/prospecting-lead-enrichment.tsx`

- [ ] Add tests proving raw `unknown` is not rendered.
- [ ] Render readiness badges and readable email source/verification labels.
- [ ] Explain when a lead is personal-ready vs institutional-ready.

### Task 4: Verification

**Files:**
- Verify all touched files.

- [ ] Run focused unit tests for prospecting service, extractor, crawler, and UI.
- [ ] Run lint/typecheck/build if focused tests pass.
- [ ] Commit and push to `main` only after fresh verification.
