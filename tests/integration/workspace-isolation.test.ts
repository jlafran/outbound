import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createDrizzleAuditRepository,
  createMemoryAuditRepository,
  type AuditDbExecutor,
} from "@/features/audit/audit-repository";
import { createMemoryAppServices } from "@/features/app/app-services";
import {
  createMemoryCampaignDryRunProjection,
  createMemoryNicheRecommendationProjection,
} from "@/features/campaigns/campaign-projections";
import {
  createDrizzleCampaignPersistenceExecutor,
  createDrizzleCampaignRepository,
  createMemoryCampaignRepository,
  type CampaignDbExecutor,
} from "@/features/campaigns/campaign-repository";
import type { CampaignRecord } from "@/features/campaigns/campaign-schema";
import {
  createDrizzleCompanyPersistenceExecutor,
  createDrizzleCompanyRepository,
  createMemoryCompanyRepository,
  type CompanyDbExecutor,
} from "@/features/companies/company-repository";
import {
  createDrizzleDossierPersistenceExecutor,
  createDrizzleDossierRepository,
  createMemoryDossierRepository,
  DossierError,
  type DossierDbExecutor,
} from "@/features/dossiers/dossier-repository";
import { dossierSchema, type Dossier } from "@/features/dossiers/dossier-schema";
import { createOfferSubmission } from "@/features/offers/offer-action-logic";
import {
  createDrizzleOfferRepository,
  createMemoryOfferRepository,
  type OfferDbExecutor,
  type OfferRecord,
} from "@/features/offers/offer-repository";
import { createDrizzleWorkspaceMembershipResolver } from "@/lib/auth";

const createdAt = new Date("2026-06-22T12:00:00.000Z");

function offer(
  workspaceId: string,
  id = `offer-${workspaceId}`,
): OfferRecord {
  return {
    id,
    workspaceId,
    createdBy: `user-${workspaceId}`,
    name: "Internal outreach offer",
    rawText: "A sufficiently detailed internal outreach offer description.",
    problems: ["Manual qualification"],
    expectedResults: ["Faster qualification"],
    ticketBand: "usd_15k_plus",
    allowedPilot: "Paid four-week pilot",
    prohibitedClaims: [],
    version: 1,
    createdAt,
  };
}

function campaign(
  workspaceId: string,
  id = `campaign-${workspaceId}`,
): CampaignRecord {
  return {
    id,
    workspaceId,
    offerId: `offer-${workspaceId}`,
    createdBy: `user-${workspaceId}`,
    name: "Internal campaign",
    targetDailyEmails: 25,
    paidDataMode: "free",
    targetTicketBand: "usd_5k_15k",
    state: "draft",
    nicheRecommendationIds: [],
    approvedNicheIds: [],
    version: 1,
    createdAt,
    updatedAt: createdAt,
  };
}

function dossier(
  workspaceId: string,
  version = 1,
  previousVersionId: string | null = null,
): Dossier {
  return dossierSchema.parse({
    id: `dossier-${workspaceId}-${version}`,
    workspaceId,
    campaignCompanyId: `campaign-company-${workspaceId}`,
    meetingId: null,
    version,
    previousVersionId,
    executiveSummary: "Executive summary",
    companyOverview: "Company overview",
    businessModel: "Business model",
    contacts: [],
    conversationSummary: "",
    confirmedNeeds: [],
    researchedFacts: [],
    hypotheses: [],
    estimates: [],
    competitors: [],
    recommendations: [],
    pendingQuestions: [],
    createdAt,
    createdBy: `user-${workspaceId}`,
  });
}

describe("memory workspace isolation", () => {
  it("isolates offer, campaign, company, dossier, audit and projections", async () => {
    const offers = createMemoryOfferRepository();
    const campaigns = createMemoryCampaignRepository();
    const companies = createMemoryCompanyRepository();
    const dossiers = createMemoryDossierRepository();
    const audit = createMemoryAuditRepository();
    const niches = createMemoryNicheRecommendationProjection();
    const dryRuns = createMemoryCampaignDryRunProjection();

    await offers.create(offer("workspace-1"));
    await campaigns.create(campaign("workspace-1"));
    const company = await companies.upsertByDomain({
      workspaceId: "workspace-1",
      domain: "acme.com",
      name: "Acme",
    });
    await dossiers.createInitial(dossier("workspace-1"));
    await audit.append({
      workspaceId: "workspace-1",
      actorId: "user-workspace-1",
      action: "offer.created",
      entityId: "offer-workspace-1",
      metadata: {},
    });
    await niches.save("workspace-1", "campaign-workspace-1", []);
    await dryRuns.getOrCreate(
      "workspace-1",
      "campaign-workspace-1",
      async () => ({
        campaignId: "campaign-workspace-1",
        companies: [],
        dossierId: "dossier-workspace-1-1",
      }),
    );

    await expect(
      offers.getById("workspace-2", "offer-workspace-1"),
    ).resolves.toBeNull();
    await expect(
      campaigns.getById("workspace-2", "campaign-workspace-1"),
    ).resolves.toBeNull();
    await expect(
      companies.getById("workspace-2", company.id),
    ).resolves.toBeNull();
    await expect(
      companies.getByDomain("workspace-2", "acme.com"),
    ).resolves.toBeNull();
    await expect(companies.count("workspace-2")).resolves.toBe(0);
    await expect(
      dossiers.getById("workspace-2", "dossier-workspace-1-1"),
    ).resolves.toBeNull();
    await expect(
      dossiers.getLatest(
        "workspace-2",
        "campaign-company-workspace-1",
      ),
    ).resolves.toBeNull();
    await expect(
      dossiers.listVersions(
        "workspace-2",
        "campaign-company-workspace-1",
      ),
    ).resolves.toEqual([]);
    await expect(audit.list("workspace-2")).resolves.toEqual([]);
    await expect(
      niches.get("workspace-2", "campaign-workspace-1"),
    ).resolves.toEqual([]);
    await expect(
      dryRuns.get("workspace-2", "campaign-workspace-1"),
    ).resolves.toBeNull();
    await expect(
      dryRuns.getCompany(
        "workspace-2",
        "campaign-company-workspace-1",
      ),
    ).resolves.toBeNull();
  });

  it("prevents cross-workspace campaign and dossier updates", async () => {
    const campaigns = createMemoryCampaignRepository();
    const dossiers = createMemoryDossierRepository();
    const originalCampaign = await campaigns.create(campaign("workspace-1"));
    const originalDossier = await dossiers.createInitial(
      dossier("workspace-1"),
    );

    await expect(
      campaigns.update(
        {
          ...originalCampaign,
          workspaceId: "workspace-2",
          version: 2,
          updatedAt: new Date(createdAt.getTime() + 1_000),
        },
        1,
      ),
    ).rejects.toThrow("STALE_CAMPAIGN_UPDATE");
    await expect(
      dossiers.appendVersion(
        {
          ...dossier(
            "workspace-2",
            2,
            originalDossier.id,
          ),
          campaignCompanyId: originalDossier.campaignCompanyId,
        },
        1,
        originalDossier.id,
      ),
    ).rejects.toBeInstanceOf(DossierError);
    await expect(
      campaigns.getById("workspace-1", originalCampaign.id),
    ).resolves.toEqual(originalCampaign);
    await expect(
      dossiers.getLatest(
        "workspace-1",
        originalDossier.campaignCompanyId,
      ),
    ).resolves.toEqual(originalDossier);
  });

  it("ignores malicious workspace and actor FormData", async () => {
    const services = createMemoryAppServices();
    const formData = new FormData();
    formData.set("workspaceId", "workspace-evil");
    formData.set("actorId", "user-evil");
    formData.set("name", "Internal offer");
    formData.set(
      "rawText",
      "A sufficiently detailed internal outreach offer description.",
    );
    formData.set("problems", "Manual qualification");
    formData.set("expectedResults", "Faster qualification");
    formData.set("ticketBand", "usd_15k_plus");
    formData.set("allowedPilot", "Paid four-week pilot");
    formData.set("prohibitedClaims", "");

    const result = await createOfferSubmission(
      {
        services,
        resolveContext: async () => ({
          workspaceId: "workspace-1",
          actorId: "user-1",
        }),
      },
      formData,
    );
    if (result.status !== "success") {
      throw new Error("Expected offer creation to succeed");
    }

    await expect(
      services.offerRepository.getById("workspace-1", result.entityId),
    ).resolves.toMatchObject({
      workspaceId: "workspace-1",
      createdBy: "user-1",
    });
    await expect(
      services.offerRepository.getById(
        "workspace-evil",
        result.entityId,
      ),
    ).resolves.toBeNull();
  });
});

describe("Drizzle workspace isolation", () => {
  let client: PGlite;
  let database: ReturnType<typeof drizzle>;

  beforeAll(async () => {
    client = new PGlite();
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
    database = drizzle(client);

    await client.exec(`
      insert into users (id, email, name) values
        ('user-workspace-1', 'owner-one@example.com', 'Owner One'),
        ('user-workspace-2', 'owner-two@example.com', 'Owner Two'),
        ('user-no-membership', 'no-membership@example.com', 'No Membership'),
        ('user-multiple', '  MULTIPLE@EXAMPLE.COM  ', 'Multiple');
      insert into workspaces (id, name) values
        ('workspace-1', 'Workspace One'),
        ('workspace-2', 'Workspace Two');
      insert into workspace_members (workspace_id, user_id, role) values
        ('workspace-1', 'user-workspace-1', 'owner'),
        ('workspace-2', 'user-workspace-2', 'owner'),
        ('workspace-1', 'user-multiple', 'member'),
        ('workspace-2', 'user-multiple', 'member');
    `);

    const offers = createDrizzleOfferRepository(
      database as unknown as OfferDbExecutor,
    );
    const campaigns = createDrizzleCampaignRepository(
      createDrizzleCampaignPersistenceExecutor(
        database as unknown as CampaignDbExecutor,
      ),
    );
    const companies = createDrizzleCompanyRepository(
      createDrizzleCompanyPersistenceExecutor(
        database as unknown as CompanyDbExecutor,
      ),
      {
        createId: (() => {
          let index = 0;
          return () => `company-${++index}`;
        })(),
        now: () => createdAt,
      },
    );
    const dossiers = createDrizzleDossierRepository(
      createDrizzleDossierPersistenceExecutor(
        database as unknown as DossierDbExecutor,
      ),
    );
    const audit = createDrizzleAuditRepository(
      database as unknown as AuditDbExecutor,
    );

    await offers.create(offer("workspace-1"));
    await offers.create(offer("workspace-2"));
    await campaigns.create(campaign("workspace-1"));
    await campaigns.create(campaign("workspace-2"));
    const companyOne = await companies.upsertByDomain({
      workspaceId: "workspace-1",
      domain: "shared.com",
      name: "Shared One",
    });
    const companyTwo = await companies.upsertByDomain({
      workspaceId: "workspace-2",
      domain: "shared.com",
      name: "Shared Two",
    });
    await client.query(
      `insert into campaign_companies (
        id, workspace_id, campaign_id, company_id, status,
        created_at, updated_at
      ) values
        ($1, 'workspace-1', 'campaign-workspace-1', $2, 'researched', now(), now()),
        ($3, 'workspace-2', 'campaign-workspace-2', $4, 'researched', now(), now())`,
      [
        "campaign-company-workspace-1",
        companyOne.id,
        "campaign-company-workspace-2",
        companyTwo.id,
      ],
    );
    await dossiers.createInitial(dossier("workspace-1"));
    await dossiers.createInitial(dossier("workspace-2"));
    await audit.append({
      workspaceId: "workspace-1",
      actorId: "user-workspace-1",
      action: "offer.created",
      entityId: "offer-workspace-1",
      metadata: {},
    });
    await audit.append({
      workspaceId: "workspace-2",
      actorId: "user-workspace-2",
      action: "offer.created",
      entityId: "offer-workspace-2",
      metadata: {},
    });
  }, 30_000);

  afterAll(async () => {
    await client.close();
  });

  it("adds workspace predicates to every persisted identity read/list/count", async () => {
    const offers = createDrizzleOfferRepository(
      database as unknown as OfferDbExecutor,
    );
    const campaigns = createDrizzleCampaignRepository(
      createDrizzleCampaignPersistenceExecutor(
        database as unknown as CampaignDbExecutor,
      ),
    );
    const companies = createDrizzleCompanyRepository(
      createDrizzleCompanyPersistenceExecutor(
        database as unknown as CompanyDbExecutor,
      ),
    );
    const dossiers = createDrizzleDossierRepository(
      createDrizzleDossierPersistenceExecutor(
        database as unknown as DossierDbExecutor,
      ),
    );
    const audit = createDrizzleAuditRepository(
      database as unknown as AuditDbExecutor,
    );

    await expect(
      offers.getById("workspace-2", "offer-workspace-1"),
    ).resolves.toBeNull();
    await expect(
      campaigns.getById("workspace-2", "campaign-workspace-1"),
    ).resolves.toBeNull();
    const companyOne = await companies.getByDomain(
      "workspace-1",
      "shared.com",
    );
    expect(companyOne).not.toBeNull();
    await expect(
      companies.getById("workspace-2", companyOne!.id),
    ).resolves.toBeNull();
    await expect(companies.count("workspace-1")).resolves.toBe(1);
    await expect(companies.count("workspace-2")).resolves.toBe(1);
    await expect(
      dossiers.getById("workspace-2", "dossier-workspace-1-1"),
    ).resolves.toBeNull();
    await expect(
      dossiers.getLatest(
        "workspace-2",
        "campaign-company-workspace-1",
      ),
    ).resolves.toBeNull();
    await expect(
      dossiers.listVersions(
        "workspace-2",
        "campaign-company-workspace-1",
      ),
    ).resolves.toEqual([]);
    await expect(audit.list("workspace-1")).resolves.toEqual([
      expect.objectContaining({
        workspaceId: "workspace-1",
        entityId: "offer-workspace-1",
      }),
    ]);
  });

  it("resolves zero, one or multiple memberships without choosing a workspace", async () => {
    const resolver = createDrizzleWorkspaceMembershipResolver(
      database as unknown as Parameters<
        typeof createDrizzleWorkspaceMembershipResolver
      >[0],
    );

    await expect(
      resolver.findMembershipsByEmail("missing@example.com"),
    ).resolves.toEqual([]);
    await expect(
      resolver.findMembershipsByEmail("owner-one@example.com"),
    ).resolves.toEqual([
      { userId: "user-workspace-1", workspaceId: "workspace-1" },
    ]);
    await expect(
      resolver.findMembershipsByEmail("multiple@example.com"),
    ).resolves.toEqual([
      { userId: "user-multiple", workspaceId: "workspace-1" },
      { userId: "user-multiple", workspaceId: "workspace-2" },
    ]);
  });

  it("adds workspace predicates to persisted updates", async () => {
    const campaigns = createDrizzleCampaignRepository(
      createDrizzleCampaignPersistenceExecutor(
        database as unknown as CampaignDbExecutor,
      ),
    );
    const dossiers = createDrizzleDossierRepository(
      createDrizzleDossierPersistenceExecutor(
        database as unknown as DossierDbExecutor,
      ),
    );
    const originalCampaign = await campaigns.getById(
      "workspace-1",
      "campaign-workspace-1",
    );
    const originalDossier = await dossiers.getById(
      "workspace-1",
      "dossier-workspace-1-1",
    );
    if (!originalCampaign || !originalDossier) {
      throw new Error("Expected seeded records");
    }

    await expect(
      campaigns.update(
        {
          ...originalCampaign,
          workspaceId: "workspace-2",
          version: 2,
          updatedAt: new Date(createdAt.getTime() + 1_000),
        },
        1,
      ),
    ).rejects.toThrow("STALE_CAMPAIGN_UPDATE");
    await expect(
      dossiers.appendVersion(
        {
          ...dossier("workspace-2", 2, originalDossier.id),
          campaignCompanyId: originalDossier.campaignCompanyId,
        },
        1,
        originalDossier.id,
      ),
    ).rejects.toThrow("STALE_DOSSIER_VERSION");
    await expect(
      campaigns.getById("workspace-1", originalCampaign.id),
    ).resolves.toEqual(originalCampaign);
    await expect(
      dossiers.getLatest(
        "workspace-1",
        originalDossier.campaignCompanyId,
      ),
    ).resolves.toEqual(originalDossier);
  });
});
