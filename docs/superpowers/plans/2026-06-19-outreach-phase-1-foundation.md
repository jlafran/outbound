# Outreach Phase 1 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir una vertical interna en modo dry-run que permita cargar una oferta, crear una campaña, evaluar nichos y empresas ficticias, editar un dossier y exportarlo a Markdown y PDF.

**Architecture:** Un monolito modular Next.js usa PostgreSQL como fuente de verdad y expone acciones de aplicación separadas de la interfaz. Todos los servicios externos se representan mediante puertos TypeScript; la primera fase usa implementaciones fake deterministas para validar dominio, estados, UI y exportaciones sin gastos ni efectos externos.

**Tech Stack:** Next.js App Router, TypeScript, PostgreSQL, Drizzle ORM, Auth.js, Zod, Vitest, Testing Library, Playwright, pnpm.

---

## Límites de esta fase

Incluye oferta, campaña, nichos, empresas, evidencias, scoring, dossier, auditoría y exportaciones.

No incluye búsquedas web reales, OpenAI real, verificación de correo, envío, inbox ni agenda. Las interfaces de esos componentes sí quedan definidas para evitar acoplar el dominio a proveedores concretos.

## Estructura de archivos

```text
src/
  app/
    (app)/
      campaigns/
      dossiers/
      offers/
    api/
      dossiers/[id]/markdown/route.ts
      dossiers/[id]/pdf/route.ts
    layout.tsx
    page.tsx
  db/
    client.ts
    schema/
      audit.ts
      campaigns.ts
      companies.ts
      dossiers.ts
      index.ts
      offers.ts
      research.ts
      workspaces.ts
  features/
    audit/
      audit-repository.ts
    campaigns/
      campaign-actions.ts
      campaign-repository.ts
      campaign-schema.ts
      campaign-service.ts
    companies/
      company-repository.ts
      company-schema.ts
    dossiers/
      dossier-actions.ts
      dossier-markdown.ts
      dossier-pdf.ts
      dossier-repository.ts
      dossier-schema.ts
      dossier-service.ts
    niches/
      fake-niche-advisor.ts
      niche-advisor.ts
      niche-schema.ts
    offers/
      offer-actions.ts
      offer-normalizer.ts
      offer-repository.ts
      offer-schema.ts
      offer-service.ts
    research/
      fake-research-provider.ts
      research-provider.ts
      research-schema.ts
      score-company.ts
  lib/
    auth.ts
    env.ts
    ids.ts
    result.ts
tests/
  e2e/
    campaign-dry-run.spec.ts
  fixtures/
    offer.ts
  integration/
    campaign-service.test.ts
    dossier-export.test.ts
    offer-service.test.ts
  unit/
    offer-normalizer.test.ts
    score-company.test.ts
```

## Task 1: Scaffold y controles de calidad

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.ts`
- Create: `drizzle.config.ts`
- Create: `vitest.config.ts`
- Create: `playwright.config.ts`
- Create: `.env.example`
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx`
- Create: `src/lib/env.ts`
- Create: `src/lib/result.ts`

- [ ] **Step 1: Inicializar el proyecto**

El repositorio ya contiene la especificación y los planes, por lo que no se debe ejecutar `create-next-app` sobre `.`. Instalar el runtime y crear los archivos de configuración listados en esta tarea:

```bash
pnpm init
pnpm add next react react-dom drizzle-orm postgres zod next-auth pg-boss
pnpm add -D typescript @types/node @types/react @types/react-dom eslint eslint-config-next tailwindcss @tailwindcss/postcss drizzle-kit vitest @vitest/coverage-v8 @testing-library/react @testing-library/jest-dom playwright @playwright/test
```

Expected: las dependencias quedan registradas sin modificar `docs/`.

- [ ] **Step 2: Agregar scripts de verificación**

En `package.json`, asegurar:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate"
  }
}
```

- [ ] **Step 3: Validar variables de entorno**

Crear `src/lib/env.ts`:

```ts
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  AUTH_SECRET: z.string().min(32),
  APP_URL: z.string().url().default("http://localhost:3000"),
  ALLOWED_EMAILS: z.string().transform((value) =>
    value.split(",").map((email) => email.trim().toLowerCase()).filter(Boolean),
  ),
});

export const env = envSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  AUTH_SECRET: process.env.AUTH_SECRET,
  APP_URL: process.env.APP_URL,
  ALLOWED_EMAILS: process.env.ALLOWED_EMAILS,
});
```

Crear `.env.example`:

```dotenv
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/outreach
AUTH_SECRET=replace-with-at-least-32-characters
APP_URL=http://localhost:3000
ALLOWED_EMAILS=owner@example.com
```

Crear `tsconfig.json` con alias:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "strict": true,
    "noEmit": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "jsx": "preserve",
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

Crear `next.config.ts`:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
};

export default nextConfig;
```

Crear `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: { environment: "node", globals: true },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
```

Crear `playwright.config.ts`:

```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  use: { baseURL: "http://127.0.0.1:3000" },
  webServer: {
    command: "pnpm dev",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
  },
});
```

- [ ] **Step 4: Configurar Drizzle**

Crear `drizzle.config.ts`:

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
```

- [ ] **Step 5: Crear resultado común**

Crear `src/lib/result.ts`:

```ts
export type Result<T, E extends string = string> =
  | { ok: true; value: T }
  | { ok: false; error: E; message: string };
```

- [ ] **Step 6: Ejecutar controles**

Run:

```bash
pnpm lint
pnpm typecheck
pnpm build
```

Expected: los tres comandos terminan con código 0.

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml tsconfig.json next.config.ts drizzle.config.ts vitest.config.ts playwright.config.ts .env.example src
git commit -m "chore: scaffold outreach application"
```

## Task 2: Esquema de workspace y auditoría

**Files:**
- Create: `src/db/client.ts`
- Create: `src/db/schema/workspaces.ts`
- Create: `src/db/schema/audit.ts`
- Create: `src/db/schema/index.ts`
- Create: `src/features/audit/audit-repository.ts`
- Test: `tests/integration/audit-repository.test.ts`

- [ ] **Step 1: Escribir prueba de auditoría**

```ts
import { describe, expect, it } from "vitest";
import { createMemoryAuditRepository } from "@/features/audit/audit-repository";

describe("audit repository", () => {
  it("appends immutable events in order", async () => {
    const repo = createMemoryAuditRepository();
    await repo.append({ workspaceId: "ws_1", actorId: "usr_1", action: "offer.created", entityId: "off_1", metadata: {} });
    await repo.append({ workspaceId: "ws_1", actorId: "usr_1", action: "campaign.created", entityId: "cmp_1", metadata: {} });

    expect((await repo.list("ws_1")).map((event) => event.action)).toEqual([
      "offer.created",
      "campaign.created",
    ]);
  });
});
```

- [ ] **Step 2: Verificar fallo**

Run: `pnpm vitest run tests/integration/audit-repository.test.ts`

Expected: FAIL porque el repositorio no existe.

- [ ] **Step 3: Definir tablas**

Crear `src/db/schema/workspaces.ts`:

```ts
import { pgEnum, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

export const workspaceRole = pgEnum("workspace_role", ["owner", "member"]);

export const workspaces = pgTable("workspaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
    userId: text("user_id").notNull().references(() => users.id),
    role: workspaceRole("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.workspaceId, table.userId] })],
);
```

Crear `src/db/schema/audit.ts`:

```ts
import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { users, workspaces } from "./workspaces";

export type AuditAction =
  | "offer.created"
  | "offer.normalized"
  | "campaign.created"
  | "niches.recommended"
  | "company.scored"
  | "dossier.updated"
  | "dossier.exported";

export const auditEvents = pgTable("audit_events", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
  actorId: text("actor_id").notNull().references(() => users.id),
  action: text("action").$type<AuditAction>().notNull(),
  entityId: text("entity_id").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

- [ ] **Step 4: Implementar contrato y memoria**

Crear `src/features/audit/audit-repository.ts`:

```ts
export type AuditEventInput = {
  workspaceId: string;
  actorId: string;
  action: string;
  entityId: string;
  metadata: Record<string, unknown>;
};

export interface AuditRepository {
  append(input: AuditEventInput): Promise<void>;
  list(workspaceId: string): Promise<AuditEventInput[]>;
}

export function createMemoryAuditRepository(): AuditRepository {
  const events: AuditEventInput[] = [];
  return {
    async append(input) {
      events.push(structuredClone(input));
    },
    async list(workspaceId) {
      return events.filter((event) => event.workspaceId === workspaceId).map(structuredClone);
    },
  };
}
```

- [ ] **Step 5: Ejecutar prueba y migración**

Run:

```bash
pnpm vitest run tests/integration/audit-repository.test.ts
pnpm db:generate
```

Expected: PASS y una migración nueva generada.

- [ ] **Step 6: Commit**

```bash
git add src/db src/features/audit tests/integration drizzle
git commit -m "feat: add workspace and audit foundation"
```

## Task 3: Dominio de ofertas

**Files:**
- Create: `src/features/offers/offer-schema.ts`
- Create: `src/features/offers/offer-normalizer.ts`
- Create: `src/features/offers/offer-repository.ts`
- Create: `src/features/offers/offer-service.ts`
- Create: `src/db/schema/offers.ts`
- Create: `tests/fixtures/offer.ts`
- Test: `tests/unit/offer-normalizer.test.ts`
- Test: `tests/integration/offer-service.test.ts`

- [ ] **Step 1: Escribir prueba del normalizador**

```ts
import { describe, expect, it } from "vitest";
import { normalizeOffer } from "@/features/offers/offer-normalizer";

describe("normalizeOffer", () => {
  it("keeps promises inside approved commercial constraints", () => {
    const result = normalizeOffer({
      name: "Agente de soporte",
      rawText: "Automatiza consultas repetitivas.",
      problems: ["Demoras de soporte"],
      expectedResults: ["Reducir tiempo de respuesta"],
      ticketBand: "usd_5k_15k",
      allowedPilot: "Auditoría de 7 días",
      prohibitedClaims: ["Garantizar 50% de ahorro"],
    });

    expect(result.ticketBand).toBe("usd_5k_15k");
    expect(result.prohibitedClaims).toContain("Garantizar 50% de ahorro");
  });
});
```

- [ ] **Step 2: Verificar fallo**

Run: `pnpm vitest run tests/unit/offer-normalizer.test.ts`

Expected: FAIL porque `normalizeOffer` no existe.

- [ ] **Step 3: Definir schema**

En `offer-schema.ts`:

```ts
import { z } from "zod";

export const offerInputSchema = z.object({
  name: z.string().min(2),
  rawText: z.string().min(20),
  problems: z.array(z.string().min(2)).min(1),
  expectedResults: z.array(z.string().min(2)).min(1),
  ticketBand: z.enum(["usd_5k_15k", "usd_15k_plus"]),
  allowedPilot: z.string().min(2),
  prohibitedClaims: z.array(z.string()).default([]),
});

export type OfferInput = z.infer<typeof offerInputSchema>;
export type NormalizedOffer = OfferInput & { version: 1 };
```

- [ ] **Step 4: Implementar normalización mínima**

```ts
import { offerInputSchema, type NormalizedOffer, type OfferInput } from "./offer-schema";

export function normalizeOffer(input: OfferInput): NormalizedOffer {
  return { ...offerInputSchema.parse(input), version: 1 };
}
```

- [ ] **Step 5: Probar servicio y persistencia**

La prueba de servicio debe verificar que `createOffer` guarda la oferta normalizada y agrega `offer.created` y `offer.normalized` a auditoría. Implementar `OfferRepository` con adaptadores memory y Drizzle, y `OfferService` recibiendo ambos repositorios por constructor.

Run:

```bash
pnpm vitest run tests/unit/offer-normalizer.test.ts tests/integration/offer-service.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/offers src/db/schema/offers.ts src/db/schema/index.ts tests
git commit -m "feat: add normalized commercial offers"
```

## Task 4: Campañas y máquina de estados

**Files:**
- Create: `src/features/campaigns/campaign-schema.ts`
- Create: `src/features/campaigns/campaign-repository.ts`
- Create: `src/features/campaigns/campaign-service.ts`
- Create: `src/db/schema/campaigns.ts`
- Test: `tests/integration/campaign-service.test.ts`

- [ ] **Step 1: Escribir prueba de transición**

```ts
it("moves a campaign from draft to niche review only after recommendations exist", async () => {
  const campaign = await service.create({
    workspaceId: "ws_1",
    offerId: "off_1",
    name: "Argentina AI pilot",
    targetDailyEmails: 50,
    paidDataMode: "fallback",
  });

  await expect(service.moveToNicheReview(campaign.id)).rejects.toThrow("NICHE_RECOMMENDATIONS_REQUIRED");
});
```

- [ ] **Step 2: Verificar fallo**

Run: `pnpm vitest run tests/integration/campaign-service.test.ts`

Expected: FAIL porque el servicio no existe.

- [ ] **Step 3: Definir estados**

```ts
export const campaignStates = [
  "draft",
  "niche_review",
  "discovery_ready",
  "researching",
  "message_review",
  "active",
  "paused",
  "completed",
] as const;
```

La fase 1 solo permitirá llegar hasta `discovery_ready`.

- [ ] **Step 4: Implementar invariantes**

`CampaignService` debe rechazar:

- Volumen menor a 1 o mayor a 200.
- Activación sin oferta.
- Paso a `niche_review` sin recomendaciones.
- Paso a `discovery_ready` sin al menos un nicho aprobado.

- [ ] **Step 5: Ejecutar pruebas**

Run: `pnpm vitest run tests/integration/campaign-service.test.ts`

Expected: PASS para casos válidos e inválidos.

- [ ] **Step 6: Commit**

```bash
git add src/features/campaigns src/db/schema/campaigns.ts src/db/schema/index.ts tests/integration/campaign-service.test.ts
git commit -m "feat: add campaign state machine"
```

## Task 5: Recomendación de nichos mediante puerto intercambiable

**Files:**
- Create: `src/features/niches/niche-schema.ts`
- Create: `src/features/niches/niche-advisor.ts`
- Create: `src/features/niches/fake-niche-advisor.ts`
- Modify: `src/features/campaigns/campaign-service.ts`
- Test: `tests/integration/niche-recommendation.test.ts`

- [ ] **Step 1: Escribir prueba determinista**

```ts
it("returns three to five ranked recommendations with economic reasoning", async () => {
  const recommendations = await advisor.recommend(normalizedOffer);
  expect(recommendations.length).toBeGreaterThanOrEqual(3);
  expect(recommendations.length).toBeLessThanOrEqual(5);
  expect(recommendations[0].score).toBeGreaterThanOrEqual(recommendations[1].score);
  expect(recommendations.every((item) => item.reasoning.length > 20)).toBe(true);
});
```

- [ ] **Step 2: Verificar fallo**

Run: `pnpm vitest run tests/integration/niche-recommendation.test.ts`

Expected: FAIL.

- [ ] **Step 3: Definir contrato**

```ts
export type NicheRecommendation = {
  id: string;
  name: string;
  score: number;
  capacityToPay: number;
  problemMagnitude: number;
  urgency: number;
  roiClarity: number;
  decisionMakerAccess: number;
  estimatedCompanyCount: number;
  reasoning: string;
};

export interface NicheAdvisor {
  recommend(offer: NormalizedOffer): Promise<NicheRecommendation[]>;
}
```

- [ ] **Step 4: Implementar fake**

El fake debe devolver datos fijos para logística, software B2B y salud privada, con scores descendentes y razonamientos explícitos. No debe usar aleatoriedad.

- [ ] **Step 5: Integrar selección**

Agregar `recommendNiches(campaignId)` y `approveNiches(campaignId, nicheIds)` a `CampaignService`; ambas operaciones deben auditarse.

- [ ] **Step 6: Ejecutar pruebas y commit**

```bash
pnpm vitest run tests/integration/niche-recommendation.test.ts tests/integration/campaign-service.test.ts
git add src/features/niches src/features/campaigns tests/integration
git commit -m "feat: add replaceable niche advisor"
```

Expected: pruebas PASS y commit creado.

## Task 6: Base central de empresas, fuentes y research

**Files:**
- Create: `src/features/companies/company-schema.ts`
- Create: `src/features/companies/company-repository.ts`
- Create: `src/features/research/research-schema.ts`
- Create: `src/db/schema/companies.ts`
- Create: `src/db/schema/research.ts`
- Test: `tests/integration/company-knowledge-base.test.ts`

- [ ] **Step 1: Escribir prueba de reutilización**

```ts
it("reuses one company across campaigns while keeping campaign-specific fit", async () => {
  const first = await repo.upsertByDomain({ workspaceId: "ws_1", domain: "acme.com.ar", name: "Acme" });
  const second = await repo.upsertByDomain({ workspaceId: "ws_1", domain: "acme.com.ar", name: "ACME SA" });

  expect(second.id).toBe(first.id);
  expect(await repo.count()).toBe(1);
});
```

- [ ] **Step 2: Verificar fallo**

Run: `pnpm vitest run tests/integration/company-knowledge-base.test.ts`

Expected: FAIL.

- [ ] **Step 3: Modelar separación epistemológica**

Definir:

```ts
export type EvidenceKind = "confirmed_by_prospect" | "researched_fact" | "hypothesis" | "estimate";
export type Confidence = "low" | "medium" | "high";

export type Evidence = {
  kind: EvidenceKind;
  statement: string;
  sourceUrl?: string;
  observedAt: Date;
  confidence: Confidence;
  assumptions: string[];
};
```

Las tablas deben separar empresa central, participación por campaña, fuentes, evidencias y oportunidades por oferta.

- [ ] **Step 4: Implementar deduplicación**

`upsertByDomain` normaliza protocolo, `www`, path y mayúsculas antes de aplicar unicidad `(workspaceId, normalizedDomain)`.

- [ ] **Step 5: Ejecutar pruebas**

Run: `pnpm vitest run tests/integration/company-knowledge-base.test.ts`

Expected: PASS, incluyendo deduplicación y aislamiento entre workspaces.

- [ ] **Step 6: Commit**

```bash
git add src/features/companies src/features/research src/db/schema tests/integration/company-knowledge-base.test.ts
git commit -m "feat: add reusable company knowledge base"
```

## Task 7: Scoring reproducible

**Files:**
- Create: `src/features/research/score-company.ts`
- Test: `tests/unit/score-company.test.ts`

- [ ] **Step 1: Escribir pruebas**

```ts
import { describe, expect, it } from "vitest";
import { scoreCompany } from "@/features/research/score-company";

describe("scoreCompany", () => {
  it("prioritizes economic fit and penalizes weak evidence", () => {
    const strong = scoreCompany({
      capacityToPay: 90,
      problemMagnitude: 85,
      urgency: 70,
      solutionFit: 90,
      decisionMakerAccess: 60,
      evidenceConfidence: 90,
    });
    const speculative = scoreCompany({
      capacityToPay: 90,
      problemMagnitude: 85,
      urgency: 70,
      solutionFit: 90,
      decisionMakerAccess: 60,
      evidenceConfidence: 20,
    });
    expect(strong.total).toBeGreaterThan(speculative.total);
    expect(strong.explanation).toContain("evidenceConfidence");
  });
});
```

- [ ] **Step 2: Verificar fallo**

Run: `pnpm vitest run tests/unit/score-company.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implementar fórmula**

```ts
const weights = {
  capacityToPay: 0.25,
  problemMagnitude: 0.25,
  urgency: 0.15,
  solutionFit: 0.2,
  decisionMakerAccess: 0.05,
  evidenceConfidence: 0.1,
} as const;
```

Validar entradas entre 0 y 100, devolver total redondeado a dos decimales, componentes y explicación.

- [ ] **Step 4: Ejecutar pruebas**

Run: `pnpm vitest run tests/unit/score-company.test.ts`

Expected: PASS para scoring, límites y orden.

- [ ] **Step 5: Commit**

```bash
git add src/features/research/score-company.ts tests/unit/score-company.test.ts
git commit -m "feat: add explainable company scoring"
```

## Task 8: Dataset dry-run de empresas y research

**Files:**
- Create: `src/features/research/research-provider.ts`
- Create: `src/features/research/fake-research-provider.ts`
- Test: `tests/integration/fake-research-provider.test.ts`

- [ ] **Step 1: Escribir prueba del dataset**

```ts
it("creates deterministic companies, contacts and sourced evidence", async () => {
  const result = await provider.researchCampaign("cmp_1");
  expect(result.companies).toHaveLength(3);
  expect(result.companies[0].contacts[0].corporateEmail).toMatch(/@/);
  expect(result.companies.flatMap((company) => company.evidence).every((item) => item.sourceUrl)).toBe(true);
  expect(result.companies.every((company) => company.score.total >= 0)).toBe(true);
});
```

- [ ] **Step 2: Verificar fallo**

Run: `pnpm vitest run tests/integration/fake-research-provider.test.ts`

Expected: FAIL.

- [ ] **Step 3: Definir contrato**

```ts
export interface ResearchProvider {
  researchCampaign(campaignId: string): Promise<{
    companies: Array<{
      companyId: string;
      campaignCompanyId: string;
      name: string;
      domain: string;
      contacts: Array<{ name: string; role: string; corporateEmail: string }>;
      evidence: Evidence[];
      score: ReturnType<typeof scoreCompany>;
    }>;
  }>;
}
```

- [ ] **Step 4: Implementar fake determinista**

Crear tres empresas argentinas ficticias de logística, software B2B y salud privada. Cada una debe contener:

- Dominio reservado bajo `.example`.
- Un contacto laboral ficticio.
- Dos hechos con URL ficticia bajo `https://example.com/`.
- Una hipótesis.
- Una estimación con supuestos.
- Score calculado por `scoreCompany`.

Persistir empresas mediante `CompanyRepository`; ejecutar dos veces debe conservar tres empresas.

- [ ] **Step 5: Ejecutar pruebas**

Run: `pnpm vitest run tests/integration/fake-research-provider.test.ts tests/integration/company-knowledge-base.test.ts`

Expected: PASS y sin duplicados.

- [ ] **Step 6: Commit**

```bash
git add src/features/research tests/integration/fake-research-provider.test.ts
git commit -m "feat: add deterministic dry-run research"
```

## Task 9: Modelo y servicio de dossier

**Files:**
- Create: `src/features/dossiers/dossier-schema.ts`
- Create: `src/features/dossiers/dossier-repository.ts`
- Create: `src/features/dossiers/dossier-service.ts`
- Create: `src/db/schema/dossiers.ts`
- Test: `tests/integration/dossier-service.test.ts`

- [ ] **Step 1: Escribir prueba de categorías**

```ts
it("keeps confirmed needs separate from hypotheses and recommendations", async () => {
  const dossier = await service.build({ campaignCompanyId: "cc_1", meetingId: null });
  expect(dossier.confirmedNeeds).toEqual([]);
  expect(dossier.hypotheses[0].kind).toBe("hypothesis");
  expect(dossier.recommendations[0].kind).toBe("recommendation");
});
```

- [ ] **Step 2: Verificar fallo**

Run: `pnpm vitest run tests/integration/dossier-service.test.ts`

Expected: FAIL.

- [ ] **Step 3: Definir schema versionado**

```ts
export const dossierItemSchema = z.object({
  id: z.string(),
  kind: z.enum(["confirmed_by_prospect", "researched_fact", "hypothesis", "estimate", "recommendation"]),
  statement: z.string().min(2),
  sourceUrl: z.string().url().optional(),
  confidence: z.enum(["low", "medium", "high"]),
  assumptions: z.array(z.string()),
  hidden: z.boolean().default(false),
});
```

Definir el documento completo:

```ts
export const dossierSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  campaignCompanyId: z.string(),
  meetingId: z.string().nullable(),
  version: z.number().int().positive(),
  previousVersionId: z.string().nullable(),
  executiveSummary: z.string(),
  companyOverview: z.string(),
  businessModel: z.string(),
  contacts: z.array(z.object({
    name: z.string(),
    role: z.string(),
    corporateEmail: z.string().email().optional(),
  })),
  conversationSummary: z.string(),
  confirmedNeeds: z.array(dossierItemSchema),
  researchedFacts: z.array(dossierItemSchema),
  hypotheses: z.array(dossierItemSchema),
  estimates: z.array(dossierItemSchema),
  competitors: z.array(dossierItemSchema),
  recommendations: z.array(dossierItemSchema),
  pendingQuestions: z.array(z.string()),
  createdAt: z.date(),
  createdBy: z.string(),
});

export type Dossier = z.infer<typeof dossierSchema>;
```

- [ ] **Step 4: Implementar versionado**

Cada edición crea una nueva versión inmutable con `version`, `createdAt`, `createdBy` y `previousVersionId`. La lectura predeterminada devuelve la versión más reciente.

- [ ] **Step 5: Ejecutar pruebas**

Run: `pnpm vitest run tests/integration/dossier-service.test.ts`

Expected: PASS para construcción, edición, ocultamiento y versionado.

- [ ] **Step 6: Commit**

```bash
git add src/features/dossiers src/db/schema/dossiers.ts src/db/schema/index.ts tests/integration/dossier-service.test.ts
git commit -m "feat: add versioned meeting dossiers"
```

## Task 10: Exportación Markdown

**Files:**
- Create: `src/features/dossiers/dossier-markdown.ts`
- Create: `src/app/api/dossiers/[id]/markdown/route.ts`
- Test: `tests/integration/dossier-export.test.ts`

- [ ] **Step 1: Escribir prueba snapshot**

```ts
it("exports visible dossier content with epistemic labels", async () => {
  const markdown = renderDossierMarkdown(dossierFixture);
  expect(markdown).toContain("# Dossier previo a la reunión");
  expect(markdown).toContain("## Necesidades confirmadas");
  expect(markdown).toContain("## Hipótesis a validar");
  expect(markdown).toContain("## Recomendaciones");
  expect(markdown).not.toContain("internal hidden note");
});
```

- [ ] **Step 2: Verificar fallo**

Run: `pnpm vitest run tests/integration/dossier-export.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implementar render puro**

`renderDossierMarkdown(dossier)` debe:

- Escapar contenido que rompa títulos.
- Omitir ítems ocultos.
- Mostrar fuente, confianza y supuestos.
- Incluir fecha y versión.
- Mantener orden estable para snapshots.

- [ ] **Step 4: Implementar endpoint**

`GET /api/dossiers/:id/markdown` devuelve:

```http
Content-Type: text/markdown; charset=utf-8
Content-Disposition: attachment; filename="dossier-<company-slug>-v<version>.md"
```

También registra `dossier.exported`.

- [ ] **Step 5: Ejecutar pruebas y commit**

```bash
pnpm vitest run tests/integration/dossier-export.test.ts
git add src/features/dossiers/dossier-markdown.ts src/app/api/dossiers tests/integration/dossier-export.test.ts
git commit -m "feat: export dossiers as markdown"
```

Expected: PASS.

## Task 11: Exportación PDF

**Files:**
- Create: `src/features/dossiers/dossier-pdf.ts`
- Create: `src/app/api/dossiers/[id]/pdf/route.ts`
- Modify: `tests/integration/dossier-export.test.ts`

- [ ] **Step 1: Escribir prueba**

```ts
it("creates a PDF from the same dossier version used by markdown", async () => {
  const pdf = await renderDossierPdf(dossierFixture);
  expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  expect(pdf.length).toBeGreaterThan(1_000);
});
```

- [ ] **Step 2: Verificar fallo**

Run: `pnpm vitest run tests/integration/dossier-export.test.ts`

Expected: FAIL porque `renderDossierPdf` no existe.

- [ ] **Step 3: Implementar HTML compartido y PDF**

Crear una representación HTML desde el mismo view model del Markdown. `renderDossierPdf` abrirá ese HTML con Playwright Chromium y ejecutará:

```ts
await page.pdf({
  format: "A4",
  printBackground: true,
  margin: { top: "16mm", right: "14mm", bottom: "16mm", left: "14mm" },
});
```

El diseño debe marcar hechos, hipótesis, estimaciones y recomendaciones con etiquetas textuales, no solo colores.

- [ ] **Step 4: Implementar endpoint**

`GET /api/dossiers/:id/pdf` devuelve `application/pdf`, filename versionado y evento de auditoría.

- [ ] **Step 5: Ejecutar pruebas y commit**

```bash
pnpm playwright install chromium
pnpm vitest run tests/integration/dossier-export.test.ts
git add src/features/dossiers src/app/api/dossiers tests/integration/dossier-export.test.ts
git commit -m "feat: export dossiers as pdf"
```

Expected: PASS.

## Task 12: Dashboard de oferta y campaña

**Files:**
- Create: `src/app/(app)/offers/new/page.tsx`
- Create: `src/app/(app)/offers/[id]/page.tsx`
- Create: `src/app/(app)/campaigns/new/page.tsx`
- Create: `src/app/(app)/campaigns/[id]/page.tsx`
- Create: `src/features/offers/offer-actions.ts`
- Create: `src/features/campaigns/campaign-actions.ts`
- Test: `tests/e2e/campaign-dry-run.spec.ts`

- [ ] **Step 1: Escribir E2E del flujo**

```ts
test("creates an offer and prepares a dry-run campaign", async ({ page }) => {
  await page.goto("/offers/new");
  await page.getByLabel("Nombre").fill("Agente de soporte");
  await page.getByLabel("Documento de la solución").fill("Automatiza consultas repetitivas y reduce tiempos de respuesta.");
  await page.getByRole("button", { name: "Guardar oferta" }).click();
  await page.getByRole("link", { name: "Crear campaña" }).click();
  await page.getByLabel("Emails diarios").fill("50");
  await page.getByRole("button", { name: "Recomendar nichos" }).click();
  await expect(page.getByText("Logística")).toBeVisible();
  await page.getByLabel("Seleccionar Logística").check();
  await page.getByRole("button", { name: "Aprobar nichos" }).click();
  await expect(page.getByText("Lista para discovery")).toBeVisible();
});
```

- [ ] **Step 2: Verificar fallo**

Run: `pnpm test:e2e tests/e2e/campaign-dry-run.spec.ts`

Expected: FAIL porque las rutas no existen.

- [ ] **Step 3: Implementar formularios**

Usar Server Actions que:

- Validan con Zod.
- Llaman servicios de aplicación.
- Devuelven errores por campo.
- Redirigen únicamente después de persistir.

La interfaz debe mostrar claramente “Modo simulación: no se enviarán emails ni se comprarán datos”.

- [ ] **Step 4: Implementar revisión de nichos**

Mostrar score, dimensiones económicas y razonamiento. Requerir selección explícita antes de habilitar `Aprobar nichos`.

Al aprobar nichos, mostrar `Generar datos dry-run`. Esta acción llama `FakeResearchProvider`, crea las tres empresas ficticias y genera un dossier para la empresa con mayor score.

- [ ] **Step 5: Ejecutar E2E y commit**

```bash
pnpm test:e2e tests/e2e/campaign-dry-run.spec.ts
git add src/app src/features/offers/offer-actions.ts src/features/campaigns/campaign-actions.ts tests/e2e
git commit -m "feat: add offer and campaign dry-run dashboard"
```

Expected: PASS.

## Task 13: Dashboard y edición del dossier

**Files:**
- Create: `src/app/(app)/dossiers/[id]/page.tsx`
- Create: `src/features/dossiers/dossier-actions.ts`
- Modify: `tests/e2e/campaign-dry-run.spec.ts`

- [ ] **Step 1: Ampliar E2E**

```ts
test("edits and exports a dossier", async ({ page }) => {
  await page.goto("/dossiers/dos_1");
  await page.getByRole("button", { name: "Editar recomendaciones" }).click();
  await page.getByLabel("Nueva recomendación").fill("Priorizar automatización del triage de consultas.");
  await page.getByRole("button", { name: "Guardar nueva versión" }).click();
  await expect(page.getByText("Versión 2")).toBeVisible();

  const md = await page.getByRole("link", { name: "Exportar Markdown" }).getAttribute("href");
  const pdf = await page.getByRole("link", { name: "Exportar PDF" }).getAttribute("href");
  expect(md).toMatch(/\\/markdown$/);
  expect(pdf).toMatch(/\\/pdf$/);
});
```

- [ ] **Step 2: Verificar fallo**

Run: `pnpm test:e2e tests/e2e/campaign-dry-run.spec.ts`

Expected: FAIL.

- [ ] **Step 3: Implementar vista**

La página debe:

- Mostrar resumen ejecutivo.
- Separar necesidades confirmadas, hechos, hipótesis, estimaciones y recomendaciones.
- Mostrar fuentes, confianza y supuestos.
- Permitir ocultar o editar elementos.
- Crear una versión al guardar.
- Exponer enlaces Markdown y PDF de la versión actual.

- [ ] **Step 4: Ejecutar E2E**

Run: `pnpm test:e2e tests/e2e/campaign-dry-run.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\)/dossiers src/features/dossiers/dossier-actions.ts tests/e2e/campaign-dry-run.spec.ts
git commit -m "feat: add editable dossier dashboard"
```

## Task 14: Autenticación interna y aislamiento de workspace

**Files:**
- Create: `src/lib/auth.ts`
- Create: `src/app/api/auth/[...nextauth]/route.ts`
- Modify: `src/app/(app)/layout.tsx`
- Modify: repositories under `src/features/**`
- Test: `tests/integration/workspace-isolation.test.ts`

- [ ] **Step 1: Escribir prueba de aislamiento**

```ts
it("never returns records from another workspace", async () => {
  await repo.create({ workspaceId: "ws_a", name: "A", domain: "a.com" });
  await repo.create({ workspaceId: "ws_b", name: "B", domain: "b.com" });
  expect((await repo.list("ws_a")).map((company) => company.name)).toEqual(["A"]);
});
```

- [ ] **Step 2: Verificar fallo o cobertura incompleta**

Run: `pnpm vitest run tests/integration/workspace-isolation.test.ts`

Expected: FAIL si cualquier consulta omite `workspaceId`.

- [ ] **Step 3: Configurar Auth.js**

Crear una configuración para login interno. Durante desarrollo se puede usar un provider de credenciales limitado por `ALLOWED_EMAILS`; producción debe usar Google OAuth. La sesión debe incluir `userId` y `workspaceId`.

- [ ] **Step 4: Aplicar autorización**

Todas las acciones y repositorios reciben `workspaceId` desde la sesión, nunca desde un campo editable del formulario. Las páginas bajo `(app)` redirigen a login sin sesión.

- [ ] **Step 5: Ejecutar pruebas**

Run:

```bash
pnpm vitest run tests/integration/workspace-isolation.test.ts
pnpm test
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/auth.ts src/app/api/auth src/app/\(app\)/layout.tsx src/features tests/integration/workspace-isolation.test.ts
git commit -m "feat: secure internal workspace"
```

## Task 15: Verificación integral de la fase

**Files:**
- Modify: `README.md`
- Create: `docs/operations/phase-1-dry-run.md`

- [ ] **Step 1: Documentar ejecución**

`README.md` debe incluir requisitos, variables, migración, arranque y pruebas.

`docs/operations/phase-1-dry-run.md` debe incluir:

- Cómo crear la primera cuenta.
- Cómo cargar una oferta.
- Cómo crear una campaña.
- Cómo reconocer que todo está en simulación.
- Cómo exportar un dossier.
- Cómo inspeccionar auditoría.

- [ ] **Step 2: Ejecutar suite completa**

Run:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

Expected: todos los comandos terminan con código 0.

- [ ] **Step 3: Verificar criterios funcionales**

Confirmar manualmente:

- Crear oferta.
- Crear campaña de 50 emails diarios.
- Recomendar y aprobar nichos fake.
- Ver empresas centrales reutilizables.
- Crear y editar dossier.
- Exportar la misma versión a Markdown y PDF.
- Confirmar que no existen llamadas de red a proveedores ni efectos externos.

- [ ] **Step 4: Revisar cambios**

Run:

```bash
git status --short
git diff --check
git log --oneline --decorate -15
```

Expected: sin whitespace errors y commits pequeños por tarea.

- [ ] **Step 5: Commit de documentación**

```bash
git add README.md docs/operations/phase-1-dry-run.md
git commit -m "docs: add phase one operating guide"
```

## Criterio de finalización

La fase 1 está completa cuando una persona autenticada puede ejecutar el flujo E2E de oferta → campaña → nichos → empresa ficticia → dossier → exportaciones, con aislamiento por workspace, auditoría y cero efectos externos.
