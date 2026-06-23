import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  createDrizzleCompanyPersistenceExecutor,
  createDrizzleCompanyRepository,
  type CompanyDbExecutor,
} from "@/features/companies/company-repository";
import { FakeResearchProvider } from "@/features/research/fake-research-provider";
import {
  createDrizzleResearchRepository,
  type ResearchDbExecutor,
} from "@/features/research/research-repository";

async function createMigratedDatabase() {
  const client = new PGlite();
  await client.waitReady;

  const migrationDirectory = join(process.cwd(), "drizzle");
  for (const migrationName of readdirSync(migrationDirectory)
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort()) {
    await client.exec(
      readFileSync(join(migrationDirectory, migrationName), "utf8").replaceAll(
        "--> statement-breakpoint",
        "",
      ),
    );
  }

  return { client, database: drizzle(client) };
}

async function seedCampaignScope(client: PGlite) {
  await client.exec(`
    insert into users (id, email, name) values
      ('user-1', 'owner@example.com', 'Owner');
    insert into workspaces (id, name) values
      ('workspace-1', 'Workspace One');
    insert into workspace_members (workspace_id, user_id, role) values
      ('workspace-1', 'user-1', 'owner');
    insert into offers (
      id, workspace_id, name, raw_text, problems, expected_results,
      ticket_band, allowed_pilot, prohibited_claims, version, created_at,
      created_by
    ) values (
      'offer-1',
      'workspace-1',
      'Automatización comercial',
      'Automatizamos investigación y outreach.',
      '["follow-up manual"]'::jsonb,
      '["más reuniones"]'::jsonb,
      'usd_5k_15k',
      'diagnóstico gratuito',
      '[]'::jsonb,
      1,
      '2026-06-20T12:00:00.000Z',
      'user-1'
    );
    insert into campaigns (
      id, workspace_id, offer_id, created_by, name, target_daily_emails,
      paid_data_mode, target_ticket_band, state, niche_recommendation_ids,
      approved_niche_ids, version, created_at, updated_at
    ) values (
      'campaign-1',
      'workspace-1',
      'offer-1',
      'user-1',
      'Campaña dry-run',
      40,
      'free',
      'usd_5k_15k',
      'discovery_ready',
      '["niche-1"]'::jsonb,
      '["niche-1"]'::jsonb,
      1,
      '2026-06-20T12:00:00.000Z',
      '2026-06-20T12:00:00.000Z'
    );
    insert into campaigns (
      id, workspace_id, offer_id, created_by, name, target_daily_emails,
      paid_data_mode, target_ticket_band, state, niche_recommendation_ids,
      approved_niche_ids, version, created_at, updated_at
    ) values (
      'campaign-2',
      'workspace-1',
      'offer-1',
      'user-1',
      'Segunda campaña dry-run',
      40,
      'free',
      'usd_5k_15k',
      'discovery_ready',
      '["niche-1"]'::jsonb,
      '["niche-1"]'::jsonb,
      1,
      '2026-06-20T12:00:00.000Z',
      '2026-06-20T12:00:00.000Z'
    );
  `);
}

describe("createDrizzleResearchRepository", () => {
  it("persists dry-run research artifacts idempotently in Postgres-compatible storage", async () => {
    const { client, database } = await createMigratedDatabase();
    try {
      await seedCampaignScope(client);
      let companyIndex = 0;
      const companyRepository = createDrizzleCompanyRepository(
        createDrizzleCompanyPersistenceExecutor(
          database as unknown as CompanyDbExecutor,
        ),
        {
          createId: () => `company-${++companyIndex}`,
          now: () => new Date("2026-06-20T12:00:00.000Z"),
        },
      );
      const researchRepository = createDrizzleResearchRepository(
        database as unknown as ResearchDbExecutor,
        { now: () => new Date("2026-06-20T12:00:00.000Z") },
      );
      const provider = new FakeResearchProvider(
        companyRepository,
        researchRepository,
      );

      const first = await provider.researchCampaign({
        workspaceId: "workspace-1",
        campaignId: "campaign-1",
        offerId: "offer-1",
      });
      const second = await provider.researchCampaign({
        workspaceId: "workspace-1",
        campaignId: "campaign-1",
        offerId: "offer-1",
      });

      expect(second).toEqual(first);
      expect(
        await researchRepository.countCampaignCompanies("workspace-1"),
      ).toBe(3);
      expect(await researchRepository.countContacts("workspace-1")).toBe(3);
      expect(await researchRepository.countSources("workspace-1")).toBe(12);
      expect(await researchRepository.countEvidence("workspace-1")).toBe(12);
      expect(
        await researchRepository.countOfferOpportunities("workspace-1"),
      ).toBe(3);
      await expect(
        researchRepository.getCampaignCompanyMaterial({
          workspaceId: "workspace-1",
          campaignCompanyId: first.companies[0].campaignCompanyId,
        }),
      ).resolves.toMatchObject({
        companyId: first.companies[0].companyId,
        contacts: first.companies[0].contacts,
        evidence: first.companies[0].evidence,
        score: first.companies[0].score,
        opportunities: [
          expect.objectContaining({
            offerId: "offer-1",
            status: "candidate",
          }),
        ],
      });
    } finally {
      await client.close();
    }
  });

  it("keeps prior campaign material complete when another campaign reuses the same company research", async () => {
    const { client, database } = await createMigratedDatabase();
    try {
      await seedCampaignScope(client);
      let companyIndex = 0;
      const companyRepository = createDrizzleCompanyRepository(
        createDrizzleCompanyPersistenceExecutor(
          database as unknown as CompanyDbExecutor,
        ),
        {
          createId: () => `company-${++companyIndex}`,
          now: () => new Date("2026-06-20T12:00:00.000Z"),
        },
      );
      const researchRepository = createDrizzleResearchRepository(
        database as unknown as ResearchDbExecutor,
        { now: () => new Date("2026-06-20T12:00:00.000Z") },
      );
      const provider = new FakeResearchProvider(
        companyRepository,
        researchRepository,
      );

      const firstCampaign = await provider.researchCampaign({
        workspaceId: "workspace-1",
        campaignId: "campaign-1",
        offerId: "offer-1",
      });
      const firstTopCompany = firstCampaign.companies[0];
      await expect(
        provider.researchCampaign({
          workspaceId: "workspace-1",
          campaignId: "campaign-2",
          offerId: "offer-1",
        }),
      ).resolves.toHaveProperty("companies");

      expect(
        await researchRepository.countCampaignCompanies("workspace-1"),
      ).toBe(6);
      expect(await researchRepository.countContacts("workspace-1")).toBe(3);
      expect(await researchRepository.countSources("workspace-1")).toBe(12);
      expect(await researchRepository.countEvidence("workspace-1")).toBe(24);
      expect(
        await researchRepository.countOfferOpportunities("workspace-1"),
      ).toBe(3);
      await expect(
        researchRepository.getCampaignCompanyMaterial({
          workspaceId: "workspace-1",
          campaignCompanyId: firstTopCompany.campaignCompanyId,
        }),
      ).resolves.toMatchObject({
        contacts: firstTopCompany.contacts,
        evidence: firstTopCompany.evidence,
        opportunities: [
          expect.objectContaining({
            offerId: "offer-1",
            status: "candidate",
          }),
        ],
      });
    } finally {
      await client.close();
    }
  });
});
