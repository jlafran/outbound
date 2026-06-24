# Outreach

Outreach is an internal, workspace-isolated application for preparing outbound campaigns: normalize an offer, create a campaign, review niche recommendations, inspect fictitious companies, edit a versioned pre-meeting dossier, and export it as Markdown or PDF.

Phase 1 is complete as a deterministic dry-run. It validates the domain, authorization, audit trail, UI, and exports without sending email, buying data, or calling real discovery/research providers. The full simulated flow runs only in non-production E2E mode and keeps its data in memory; normal authenticated mode uses PostgreSQL but intentionally has no real niche or research integration yet.

## Requirements

- Node.js compatible with Next.js: `^18.18.0`, `^19.8.0`, or `>=20.0.0` (Node 22 recommended).
- pnpm `11.8.0` via Corepack.
- PostgreSQL reachable through `DATABASE_URL`.
- Playwright Chromium for PDF rendering, the mandatory PDF smoke test, and E2E tests.

## Install

```bash
corepack enable
pnpm install
pnpm exec playwright install chromium
cp .env.example .env.local
```

## Environment

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection URL. Required in every mode. |
| `AUTH_SECRET` | Auth.js signing secret, at least 32 characters. |
| `APP_URL` | Public application URL. Defaults to `NEXTAUTH_URL`, then `http://localhost:3000`. |
| `NEXTAUTH_URL` | Auth.js URL. Required in production, must use HTTPS. |
| `ALLOWED_EMAILS` | Comma-separated, case-insensitive allowlist. A user must also exist in the database with exactly one workspace membership. |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID. Required in production. |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret. Required in production. |
| `BRAVE_SEARCH_API_KEY` | Optional Brave Search API key. When present in production, campaign dry-runs use Brave-backed company discovery; otherwise they keep deterministic fake data. |
| `DEV_AUTH_PASSWORD` | Shared development-only credential, at least 12 characters. Credentials auth is disabled in production. |
| `OUTREACH_E2E_MODE` | Set to `1` only for local/test dry-runs. It bypasses normal auth, uses deterministic in-memory services, and is rejected in production. Never configure it in production. |

Production requires `APP_URL` and `NEXTAUTH_URL` to have the same origin.

## Database and first user

Apply the committed migrations:

```bash
pnpm db:migrate
```

`pnpm db:generate` creates new migration files after schema changes; it is not needed for a normal install. Bootstrap the first workspace, user, and membership before signing in. See the safe SQL example in [docs/operations/phase-1-dry-run.md](docs/operations/phase-1-dry-run.md).

## Run

Development:

```bash
pnpm dev
```

Production build and start (there is no `start` alias in `package.json`):

```bash
pnpm build
pnpm exec next start
```

Production authentication uses Google OAuth and the email allowlist. Development authentication uses the allowed email plus `DEV_AUTH_PASSWORD`. Do not log, commit, or share auth secrets.

## Scripts

```bash
pnpm lint             # ESLint
pnpm typecheck        # TypeScript without emit
pnpm test             # Vitest suite
pnpm test:watch       # Vitest watch mode
pnpm test:pdf-smoke   # Real Chromium PDF smoke test; Chromium is mandatory
pnpm test:e2e         # Playwright dry-run flow; sets OUTREACH_E2E_MODE=1
pnpm build            # Production Next.js build
pnpm db:generate      # Generate Drizzle migrations
pnpm db:migrate       # Apply Drizzle migrations
```

## Architecture

The application is a modular Next.js App Router monolith:

- `src/app`: authenticated pages, server actions, and export/auth routes.
- `src/features/offers`: offer validation, normalization, persistence, and audit.
- `src/features/campaigns`: campaign state machine, recommendations, and dry-run orchestration.
- `src/features/niches`: niche provider port, deterministic fake, and safety rules.
- `src/features/companies` and `src/features/research`: reusable company knowledge, evidence, scoring, and provider ports.
- `src/features/dossiers`: immutable version chains, editing, Markdown, and Chromium PDF export.
- `src/features/audit`: workspace-scoped audit repository.
- `src/db/schema`: PostgreSQL/Drizzle schema with workspace integrity constraints.
- `src/lib/auth.ts`: Auth.js configuration, allowlist, and exactly-one-membership authorization.

All application access derives `workspaceId` and actor identity from the authenticated session, never from editable form fields.

## Phase 1 limitation

The simulation banner is a product guarantee for this phase: no email is sent, no paid data is purchased, and no external discovery/research provider is invoked. `OUTREACH_E2E_MODE=1` is for local verification only, stores data in memory, and must never be enabled in production. Phase 2 will add real discovery, research, and contact integrations behind the existing provider interfaces.
