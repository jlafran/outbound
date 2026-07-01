# Outreach — AI Handoff and Full Project Context

> This document is intended to be pasted into another AI coding agent so it can continue the project without access to the original chat. Treat the repository and production data as the source of truth when this document and the code disagree.

## 1. Product goal

Build an end-to-end B2B outbound prospecting system for Argentina and Latin America. The system starts from a document describing the solution to sell and ends when a qualified prospect books and joins a sales meeting.

The intended lifecycle is:

1. Normalize the solution/offer document.
2. Recommend and approve high-value niches whose companies can pay a meaningful ticket and obtain measurable ROI.
3. Find real companies using Google-like search, public business sources, official sites, social networks, trade associations, chambers, exhibitor catalogs, and news as discovery signals.
4. Research each company, its strengths, weaknesses, competitors, commercial signals, and improvement opportunities.
5. Identify real decision makers and associate them safely with the company.
6. Find public contact channels. Prefer a named person and personal channel; retain generic official channels as incomplete/institutional contacts.
7. Produce a researched, personalized outreach message with a low-risk offer.
8. Run outreach, track replies, and generate sales calls.
9. Before the meeting, generate a dossier containing all company research, contacts, needs, problems, evidence, and recommendations. Export as Markdown and PDF.

The immediate priority is not email sending. It is making the prospecting core produce real, useful companies and associated decision makers.

## 2. Current test case and latest approved direction

The old fixed test case was dental/aesthetic clinics in Argentina, selling WhatsApp and patient-follow-up automation. It successfully exercised the technical pipeline but produced mostly small clinics and almost no associated decision makers.

The approved replacement test is:

- **Market:** Argentina.
- **Target:** B2B distributors and wholesalers of industrial supplies, machinery, tools, EPP, and industrial safety products.
- **Minimum size:** 50+ employees **or** 3+ branches.
- **Offer:** researched outbound prospecting that helps the distributor acquire new B2B customers and qualified sales meetings.
- **Decision-maker roles:** owner/CEO, general manager, commercial director, sales manager, business-development manager, and marketing manager.
- **Strict readiness rule:** a lead is only ready when a real named decision maker is safely associated with the company. A generic address such as `ventas@empresa.com` is useful but remains incomplete/institutional.

The approved detailed design is in:

- `docs/superpowers/specs/2026-07-01-industrial-distributor-prospecting-design.md`

Implementation of this replacement has **not started yet**. The design document is the next implementation target.

## 3. Repository and production

- **Repository:** `git@github.com:jlafran/outbound.git`
- **Primary branch:** `main`
- **Production URL:** `https://outreach-red.vercel.app`
- **Current campaign:** `cde534f7-a94d-4024-a592-c67cfc0c6519`
- **Current prospecting route:** `https://outreach-red.vercel.app/campaigns/cde534f7-a94d-4024-a592-c67cfc0c6519/prospecting-test`
- **Vercel project:** `outreach`
- **Vercel project ID:** `prj_eKnIALEa3TGXncrYX4I5Y0mE5XKr`
- **Vercel team ID:** `team_dNcM257xwfE2TOukQUCIitvn`
- **Supabase project ref:** `obewvhsuhikaoigjxqhw`
- `main` is connected to Vercel production; pushing to `main` should deploy production.

Production currently contains only the single campaign listed above. Two older duplicate campaigns and their related companies, contacts, evidence, opportunities, and dossiers were removed intentionally.

## 4. Technology

- Next.js 15 App Router
- React 19
- TypeScript
- PostgreSQL on Supabase
- Drizzle ORM and Drizzle Kit
- NextAuth v4 with Google OAuth in production
- Brave Search API for public web discovery
- Cheerio/native fetch for official-site crawling and extraction
- No2Bounce through the generic `ReacherEmailVerifier` adapter for guessed email verification
- Vitest for unit/integration tests
- Playwright for browser tests
- Vercel for hosting/deployment

Package manager: `pnpm@11.8.0`.

Common commands:

```bash
pnpm install
pnpm run dev
pnpm run test
pnpm run lint
pnpm run typecheck
pnpm run build
pnpm run db:generate
pnpm run db:migrate
```

Run `build` and `typecheck` sequentially. A previous parallel run produced a false typecheck failure because Next.js was regenerating `.next` concurrently.

## 5. Authentication and access

Production uses Google OAuth. Access is allowlisted through `ALLOWED_EMAILS`; merely knowing an allowed email is not enough because the user must authenticate with Google.

Important environment variables:

```text
DATABASE_URL
AUTH_SECRET
APP_URL
NEXTAUTH_URL
ALLOWED_EMAILS
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
BRAVE_SEARCH_API_KEY
REACHER_ENDPOINT
REACHER_CHECK_PATH
REACHER_API_TOKEN
REACHER_AUTH_HEADER_NAME
REACHER_AUTH_HEADER_PREFIX
REACHER_REQUEST_BODY_MODE
```

For No2Bounce, the adapter uses the existing `REACHER_*` names. `REACHER_REQUEST_BODY_MODE` can be `no2bounceSingle` or `emailList` depending on the endpoint.

Never copy secrets from the original chat into code, documentation, Git, logs, or prompts. Several credentials were pasted into the original conversation, including a database password, `AUTH_SECRET`, and a No2Bounce API key. They must be considered exposed and rotated if that has not already happened. This document intentionally contains no secret values.

## 6. Current architecture

The current prospecting flow is:

```text
Brave discovery
  → classify company/person/source/noise results
  → validate company and official domain
  → crawl official website
  → extract emails, phones, WhatsApp, people, services, social links, and signals
  → discover public LinkedIn/person results
  → associate decision makers with companies
  → infer/verify emails when appropriate
  → score lead
  → select recommended contact
  → generate personalized message
  → persist run snapshot and email verification state
  → render the saved result without repeating external calls on refresh
```

Important files:

- `src/features/prospecting/dental-aesthetics-profile.ts` — current vertical-specific queries, classification, roles, and signals. Must be replaced/generalized for industrial distributors.
- `src/features/prospecting/dental-prospecting-service.ts` — current orchestration service. Reuse its pipeline; rename/generalize only as needed.
- `src/features/prospecting/decision-maker-associator.ts` — current person/company association logic. This is a major improvement target.
- `src/features/prospecting/official-website-crawler.ts` — official-site page discovery and crawling.
- `src/features/prospecting/website-research-extractor.ts` — contact/person/service/signal extraction and email sanitation.
- `src/features/prospecting/email-verifier.ts` — Reacher/No2Bounce-compatible verifier.
- `src/features/prospecting/prospecting-lead-scorer.ts` — score components and penalties.
- `src/features/prospecting/personalized-message-builder.ts` — evidence-backed outreach copy.
- `src/features/prospecting/prospecting-run-service.ts` — persistent run lifecycle and verification refresh.
- `src/features/prospecting/prospecting-repository.ts` — database persistence.
- `src/features/prospecting/prospecting-actions.ts` — server actions, dependency wiring, environment variables, redirect/revalidation.
- `src/app/(app)/campaigns/[id]/prospecting-test/page.tsx` — prospecting test page.
- `src/app/(app)/campaigns/[id]/prospecting-test/prospecting-lead-enrichment.tsx` — contact quality, research, score, and message UI.
- `src/db/schema/prospecting.ts` — prospecting runs and email verifications.

## 7. Persistence model

Two main tables support the test:

### `prospecting_runs`

- Stores `running`, `completed`, or `failed` status.
- Stores the profile name, result snapshot, timestamps, and safe error information.
- Refreshing the page reads the persisted result and must not call Brave or No2Bounce again.

### `prospecting_email_verifications`

- Stores campaign/run/domain/email/source/provider/status/tracking ID.
- Allowed sources currently include `official_website`, `pattern`, `public`, `hunter`, and `reacher`.
- Allowed providers are `no2bounce` and `reacher`.
- A pending verification requires a provider tracking ID.

The production database constraint originally rejected `official_website`, causing completed research to fail at persistence. This was fixed in Supabase and encoded locally in Drizzle migration `0016`.

## 8. Contact and email policy

This behavior is deliberate:

- Emails scraped directly from an official company website use source `official_website`.
- Official-site emails are **not** submitted to No2Bounce to avoid unnecessary credit spend.
- Emails guessed from a person's name and company domain use source `pattern` and may be sent to No2Bounce.
- Generic official emails may support institutional contact but cannot make a lead `personal_ready`.
- Malformed emails must be rejected before persistence and verification.
- Raw internal status `unknown` must never be shown as a polished user-facing result.

User-facing labels introduced in production include:

- `Tomado de web oficial`
- `Sin verificación externa`
- `Verificando`
- `Verificado`
- `Riesgoso`
- `Inválido`

## 9. What is currently working

A real production run was executed after the latest persistence fix.

- Run ID: `a52cc0f1-1141-49b0-bf01-d578a4cd3321`
- Status: completed
- Duration: approximately 60 seconds
- Leads: 12
- Rejected results: 2
- Unassociated decision makers: 1
- Browser console errors/warnings: none
- Malformed emails such as `%20consultas@...` and concatenated page text no longer appeared in the fresh run.
- `hola@zurodental.com.ar` was correctly saved with source `official_website`, provider `NULL`, status `unverified`, and no provider tracking ID. Therefore No2Bounce was correctly bypassed.

The campaign list was verified to contain one campaign, and both campaign/detail routes rendered successfully.

## 10. Known defects and weaknesses

### A. Decision-maker yield is insufficient

The fresh production run associated zero decision makers with the 12 companies. One public LinkedIn person remained unassociated. This is the central product failure even though the technical run completed.

Likely causes in current code:

- Searches are still dental-specific and too broad.
- Person search is not consistently performed after validating each company.
- Association relies on weak normalized token matching.
- Generic vertical tokens can create ambiguity.
- Website person extraction misses names on visually complex team pages.
- The current data model/UI allows institutional-ready results even when no named person exists; the new approved industrial test changes this to a strict readiness rule.

### B. Wrong vertical

The UI, file names, types, queries, classification, roles, score helpers, and messages remain dental-specific. They must be replaced with the approved industrial distributor profile without creating an unnecessary generic framework.

### C. Timezone display is wrong

The persisted UTC timestamps are correct, but the production UI displayed an incorrect local hour. Format explicitly using `timeZone: "America/Argentina/Buenos_Aires"` and cover it with a deterministic test.

### D. Old campaign workflow data remains conceptually unrelated

The kept campaign detail page may still show older logistics discovery companies from the broader campaign workflow. The prospecting test itself stores separate runs. Do not accidentally treat old campaign-company rows as results of the new industrial test.

### E. PDF export

Markdown dossier export works. PDF export previously failed or displayed content instead of downloading directly. The user explicitly deprioritized this; keep it as a future issue unless it blocks a more important flow.

### F. Observability

Some server-action errors were previously swallowed into `operation_failed`, requiring direct Supabase inspection. Preserve safe user messages but add structured server-side context when touching this path.

## 11. Approved implementation requirements

Follow `docs/superpowers/specs/2026-07-01-industrial-distributor-prospecting-design.md`.

The minimum implementation should:

1. Replace dental UI copy and active profile with industrial distributors.
2. Build separate Brave query groups for company discovery, company-specific decision-maker discovery, and evidence.
3. Validate B2B industrial-distributor fit.
4. Enforce 50+ employees or 3+ branches, with visible evidence.
5. Search approved commercial decision-maker roles after company validation.
6. Associate a person only with strong company evidence: exact normalized name, official domain, distinctive token plus approved role, or official-site publication.
7. Treat generic terms such as `industrial`, `distribuidora`, `mayorista`, `seguridad`, `insumos`, and `argentina` as non-distinctive.
8. Mark a lead ready only when a real named decision maker is associated and a usable personal channel or public LinkedIn profile exists.
9. Keep generic company contact information, but mark the lead incomplete.
10. Generate personalized messages only when a named decision maker and specific evidence exist.
11. Show active-run loading and refresh to the final saved result without duplicating external calls.
12. Format times in `America/Argentina/Buenos_Aires`.
13. Preserve the official-email/No2Bounce policy and malformed-email sanitation.
14. Verify the deployed browser flow and matching Supabase records after deployment.

## 12. Recommended implementation shape

Keep this small and reuse existing code:

- Introduce a narrow `ProspectingProfile` configuration for queries, approved roles, generic tokens, company patterns, source patterns, opportunity signals, and UI labels.
- Add one `industrial-distributors` profile.
- Rename the orchestration service/types only where the dental names would otherwise leak into production behavior.
- Add a company-specific decision-maker search method rather than another parallel service.
- Extend the existing website research result with size/branch evidence only if the current type cannot represent it.
- Strengthen the existing associator instead of replacing it with an LLM or paid provider.
- Keep current Supabase tables unless a new field is truly required; result snapshots can hold evidence without an immediate schema migration.

Do not add authenticated LinkedIn scraping, Apollo, Hunter, Clay, Sales Navigator automation, a background-workflow platform, or a generic admin profile builder in this iteration.

## 13. Testing and completion criteria

Before claiming success, run:

```bash
pnpm run test
pnpm run lint
pnpm run typecheck
pnpm run build
git diff --check
```

Tests should cover:

- industrial queries and source classification;
- company size gate;
- approved commercial role extraction;
- strong and ambiguous association cases;
- generic-token rejection;
- strict lead readiness;
- official versus inferred email behavior;
- malformed email rejection;
- evidence-backed message generation;
- Buenos Aires timestamp formatting;
- persistence compatibility.

After pushing `main`, verify:

1. Vercel production deployment is ready.
2. The campaign page and industrial prospecting test render.
3. A single new run starts and persists as `running`.
4. It reaches `completed` or exposes the exact failure in Supabase/logs.
5. The fresh result has no dental wording or dental companies.
6. Every ready lead has a named associated decision maker and supporting evidence.
7. Official-site emails have no No2Bounce provider/tracking ID.
8. No malformed emails or raw `unknown` labels appear.
9. The displayed time matches Buenos Aires.

Do not repeatedly execute production runs while debugging; each run consumes Brave queries and may consume verification credits.

## 14. Relevant design history

- `docs/superpowers/specs/2026-06-19-outreach-system-design.md` — original product/system design.
- `docs/superpowers/specs/2026-06-26-persistent-prospecting-runs-design.md` — saved runs and verification refresh.
- `docs/superpowers/specs/2026-06-30-prospecting-enrichment-pipeline-design.md` — website enrichment, decision makers, scoring, messages.
- `docs/superpowers/specs/2026-07-01-prospecting-contact-quality-design.md` — official email semantics, sanitization, contact readiness.
- `docs/superpowers/specs/2026-07-01-industrial-distributor-prospecting-design.md` — current approved next change.

Recent relevant commits:

```text
51b6ef5 docs: design industrial distributor prospecting
cafaa4c fix: persist official website email sources
8fed4bb feat: improve prospecting contact quality
acef311 feat: enrich prospects from official websites
dd3f909 feat: persist prospecting runs and email checks
bcb516b fix: poll and log no2bounce verification
c10a37d feat: support no2bounce email verification
```

## 15. Collaboration preferences

- Communicate in Spanish unless asked otherwise.
- Be direct and verify the actual UI/code before giving navigation instructions.
- The user prefers autonomous implementation and concrete tests over repeated conceptual questions.
- Preserve unrelated user changes in a dirty worktree.
- Push tested work to `main` so Vercel production updates.
- Stop periodically at meaningful checkpoints so another agent can continue if token limits are reached.
- Lead with outcomes and evidence, not generic assurances.

## 16. Additional tooling preference

The user requested trying the open-source Ponytail coding skill to reduce overengineering. `ponytail` and `ponytail-review` were installed under the user's Codex skills directory, but Codex must be restarted before they become available in a new session. Use them during implementation if available, while preserving validation, error handling, security, accessibility, and tests.

## 17. First action for the next AI

1. Read the industrial distributor design and the files listed in section 6.
2. Check `git status` and current production/main state.
3. Produce a focused implementation plan that reuses the existing pipeline.
4. Implement tests first for the industrial profile, strict decision-maker association/readiness, and timezone.
5. Implement the smallest code change that satisfies those tests.
6. Run the complete verification suite.
7. Commit, push `main`, wait for Vercel, and execute exactly one end-to-end production run.

