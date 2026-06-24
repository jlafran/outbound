# Brave Search Research v0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the purely fake dry-run discovery with an optional Brave Search backed provider that can generate real company candidates from approved niches while keeping the existing fake provider as a safe fallback.

**Architecture:** Add a small Brave API client with dependency-injected `fetch`, then add a `BraveResearchProvider` that implements the existing `ResearchProvider` interface. Production service wiring chooses Brave when `BRAVE_SEARCH_API_KEY` is present; otherwise it keeps `FakeResearchProvider`, so the app remains usable without paid configuration.

**Tech Stack:** Next.js server runtime, TypeScript, Zod, existing Drizzle repositories, Brave Search API Web endpoint, Vitest.

---

### File Map

- Create `src/features/research/brave-search-client.ts`: typed Brave Web Search client, result normalization, URL/domain utilities.
- Create `src/features/research/brave-research-provider.ts`: maps campaign/niche input into Brave queries and `ResearchCompany[]`.
- Modify `src/features/app/app-services.ts`: choose Brave provider in production if `BRAVE_SEARCH_API_KEY` exists.
- Modify `.env.example` and `README.md`: document `BRAVE_SEARCH_API_KEY`.
- Create `tests/integration/brave-search-client.test.ts`: test request headers, parsing, dedupe, error handling.
- Create `tests/integration/brave-research-provider.test.ts`: test real provider behavior with mocked Brave responses.

### Task 1: Brave Search client

- [ ] Write failing tests in `tests/integration/brave-search-client.test.ts` for:
  - sends `X-Subscription-Token`
  - passes `q`, `count`, `country`, `search_lang`
  - normalizes web results to `{ title, url, description, domain }`
  - rejects non-2xx responses with a non-secret error
  - dedupes repeated domains
- [ ] Run `pnpm test -- brave-search-client` and verify RED.
- [ ] Implement `src/features/research/brave-search-client.ts`.
- [ ] Run `pnpm test -- brave-search-client` and verify GREEN.

### Task 2: Brave research provider

- [ ] Write failing tests in `tests/integration/brave-research-provider.test.ts` for:
  - creates multiple Brave queries from campaign input and approved niche IDs
  - returns at most requested company candidates
  - excludes non-public/internal domains and duplicate domains
  - produces evidence with Brave source URLs
  - persists research through the existing repository when provided
- [ ] Run `pnpm test -- brave-research-provider` and verify RED.
- [ ] Implement `src/features/research/brave-research-provider.ts`.
- [ ] Run `pnpm test -- brave-research-provider` and verify GREEN.

### Task 3: Service wiring and environment docs

- [ ] Write/adjust integration test proving `getAppServices` uses fake provider without `BRAVE_SEARCH_API_KEY` and can construct production services with Brave when present without exposing the key.
- [ ] Modify `src/features/app/app-services.ts` to instantiate `BraveResearchProvider` only when `process.env.BRAVE_SEARCH_API_KEY` is non-empty.
- [ ] Add `BRAVE_SEARCH_API_KEY=` to `.env.example`.
- [ ] Update `README.md` env var table.
- [ ] Run targeted tests plus `pnpm typecheck`.

### Task 4: Verification and deploy

- [ ] Run `pnpm lint`.
- [ ] Run `pnpm typecheck`.
- [ ] Run `pnpm test -- brave`.
- [ ] Run full `pnpm test` if targeted tests pass.
- [ ] Deploy to Vercel only after `BRAVE_SEARCH_API_KEY` is configured.

### Notes

- This v0 finds company candidates and lightweight evidence. It does not yet find verified personal emails.
- Keep hard caps low initially: 10 results per query and 10-25 companies per dry-run.
- Brave cost is controlled by query count; do not query per company in v0.
