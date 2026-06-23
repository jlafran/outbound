import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  campaigns,
  offers,
  workspaceMembers,
} from "@/db/schema";
import {
  createDrizzleCampaignRepository,
  createMemoryCampaignRepository,
  type CampaignPersistenceExecutor,
} from "@/features/campaigns/campaign-repository";
import {
  campaignRecordSchema,
  campaignStateValues,
  paidDataModeValues,
  type CampaignRecord,
} from "@/features/campaigns/campaign-schema";
import {
  CampaignService,
  type CreateCampaignInput,
} from "@/features/campaigns/campaign-service";
import { createMemoryCampaignUnitOfWork } from "@/features/campaigns/campaign-unit-of-work";
import { FakeNicheAdvisor } from "@/features/niches/fake-niche-advisor";
import { createMemoryOfferRepository } from "@/features/offers/offer-repository";
import { offerTicketBandValues } from "@/features/offers/offer-schema";
import { normalizedOffer } from "../fixtures/offer";

const validCreateInput: CreateCampaignInput = {
  workspaceId: "workspace-1",
  actorId: "user-1",
  offerId: "offer-1",
  name: "Argentina SaaS",
  targetDailyEmails: 25,
  paidDataMode: "fallback",
  targetTicketBand: "usd_5k_15k",
};

async function createHarness() {
  const offerRepository = createMemoryOfferRepository();
  await offerRepository.create({
    id: "offer-1",
    workspaceId: "workspace-1",
    createdBy: "user-1",
    ...normalizedOffer,
    createdAt: new Date("2026-06-19T12:00:00.000Z"),
  });
  await offerRepository.create({
    id: "offer-2",
    workspaceId: "workspace-2",
    createdBy: "user-2",
    ...normalizedOffer,
    createdAt: new Date("2026-06-19T12:00:00.000Z"),
  });
  const unitOfWork = createMemoryCampaignUnitOfWork();
  const campaignRepository = unitOfWork.campaignRepository;

  return {
    campaignRepository,
    offerRepository,
    service: new CampaignService(
      campaignRepository,
      offerRepository,
      new FakeNicheAdvisor(),
      unitOfWork,
    ),
  };
}

async function createDraft(
  service: CampaignService,
  overrides: Partial<CreateCampaignInput> = {},
) {
  return service.create({ ...validCreateInput, ...overrides });
}

async function createNicheReview(service: CampaignService) {
  const campaign = await createDraft(service);
  const recommended = await service.recordNicheRecommendations(
    campaign.workspaceId,
    campaign.id,
    ["niche-1", "niche-2"],
    campaign.version,
  );
  return service.moveToNicheReview(
    campaign.workspaceId,
    campaign.id,
    recommended.version,
  );
}

function expectCode(code: string) {
  return expect.objectContaining({ code });
}

describe("CampaignService", () => {
  it("creates a validated draft with empty niche arrays", async () => {
    const { service } = await createHarness();

    const created = await createDraft(service);

    expect(created).toMatchObject({
      workspaceId: "workspace-1",
      offerId: "offer-1",
      createdBy: "user-1",
      name: "Argentina SaaS",
      targetDailyEmails: 25,
      paidDataMode: "fallback",
      targetTicketBand: "usd_5k_15k",
      state: "draft",
      nicheRecommendationIds: [],
      approvedNicheIds: [],
      version: 1,
    });
    expect(created.id).toEqual(expect.any(String));
    expect(created.createdAt).toBeInstanceOf(Date);
    expect(created.updatedAt).toEqual(created.createdAt);
  });

  it.each([0, 1.5, 201])(
    "rejects invalid target daily email volume %s",
    async (targetDailyEmails) => {
      const { service } = await createHarness();

      await expect(
        createDraft(service, { targetDailyEmails }),
      ).rejects.toEqual(expectCode("INVALID_CAMPAIGN_INPUT"));
    },
  );

  it.each([undefined, "usd_50k_plus"])(
    "rejects invalid target ticket band %s",
    async (targetTicketBand) => {
      const { service } = await createHarness();

      await expect(
        service.create({
          ...validCreateInput,
          targetTicketBand,
        } as CreateCampaignInput),
      ).rejects.toEqual(expectCode("INVALID_CAMPAIGN_INPUT"));
    },
  );

  it.each([
    ["missing", "workspace-1", "missing-offer"],
    ["wrong workspace", "workspace-1", "offer-2"],
  ])(
    "rejects a %s offer",
    async (_label, workspaceId, offerId) => {
      const { service } = await createHarness();

      await expect(
        createDraft(service, { workspaceId, offerId }),
      ).rejects.toEqual(expectCode("OFFER_REQUIRED"));
    },
  );

  it("records unique nonempty recommendations only on a draft", async () => {
    const { service } = await createHarness();
    const campaign = await createDraft(service);

    const updated = await service.recordNicheRecommendations(
      campaign.workspaceId,
      campaign.id,
      ["niche-1", "niche-1", "niche-2"],
      campaign.version,
    );

    expect(updated.nicheRecommendationIds).toEqual([
      "niche-1",
      "niche-2",
    ]);
    await expect(
      service.recordNicheRecommendations(
        campaign.workspaceId,
        campaign.id,
        [],
        updated.version,
      ),
    ).rejects.toEqual(expectCode("NICHE_RECOMMENDATIONS_REQUIRED"));
    await expect(
      service.recordNicheRecommendations(
        campaign.workspaceId,
        campaign.id,
        ["niche-1", ""],
        updated.version,
      ),
    ).rejects.toEqual(expectCode("NICHE_RECOMMENDATIONS_REQUIRED"));

    const reviewed = await service.moveToNicheReview(
      campaign.workspaceId,
      campaign.id,
      updated.version,
    );
    await expect(
      service.recordNicheRecommendations(
        campaign.workspaceId,
        campaign.id,
        ["niche-3"],
        reviewed.version,
      ),
    ).rejects.toEqual(expectCode("INVALID_CAMPAIGN_TRANSITION"));
  });

  it("requires recommendations before moving a draft to niche review", async () => {
    const { service } = await createHarness();
    const campaign = await createDraft(service);

    await expect(
      service.moveToNicheReview(
        campaign.workspaceId,
        campaign.id,
        campaign.version,
      ),
    ).rejects.toEqual(
      expectCode("NICHE_RECOMMENDATIONS_REQUIRED"),
    );
  });

  it("moves a draft with recommendations to niche review", async () => {
    const { service } = await createHarness();
    const campaign = await createDraft(service);

    const recommended = await service.recordNicheRecommendations(
      "workspace-1",
      campaign.id,
      ["niche-1"],
      campaign.version,
    );
    const reviewed = await service.moveToNicheReview(
      "workspace-1",
      campaign.id,
      recommended.version,
    );

    expect(reviewed.state).toBe("niche_review");
    expect(reviewed.version).toBe(3);
  });

  it("approves a unique nonempty subset of recommended niches", async () => {
    const { service } = await createHarness();
    const reviewed = await createNicheReview(service);

    const approved = await service.approveNiches(
      reviewed.workspaceId,
      reviewed.id,
      ["niche-2", "niche-2"],
      reviewed.version,
      "user-1",
    );

    expect(approved.approvedNicheIds).toEqual(["niche-2"]);
    expect(approved.version).toBe(reviewed.version + 1);
    await expect(
      service.approveNiches(
        reviewed.workspaceId,
        reviewed.id,
        [],
        approved.version,
        "user-1",
      ),
    ).rejects.toEqual(expectCode("APPROVED_NICHE_REQUIRED"));
    await expect(
      service.approveNiches(
        reviewed.workspaceId,
        reviewed.id,
        ["niche-3"],
        approved.version,
        "user-1",
      ),
    ).rejects.toEqual(expectCode("NICHE_NOT_RECOMMENDED"));
  });

  it("rejects niche approval outside niche review", async () => {
    const { service } = await createHarness();
    const campaign = await createDraft(service);

    await expect(
      service.approveNiches(
        campaign.workspaceId,
        campaign.id,
        ["niche-1"],
        campaign.version,
        "user-1",
      ),
    ).rejects.toEqual(expectCode("INVALID_CAMPAIGN_TRANSITION"));
  });

  it("requires an approved niche before discovery ready", async () => {
    const { service } = await createHarness();
    const reviewed = await createNicheReview(service);

    await expect(
      service.moveToDiscoveryReady(
        reviewed.workspaceId,
        reviewed.id,
        reviewed.version,
      ),
    ).rejects.toEqual(expectCode("APPROVED_NICHE_REQUIRED"));
  });

  it("completes the valid phase 1 flow at discovery ready", async () => {
    const { service } = await createHarness();
    const reviewed = await createNicheReview(service);
    const approved = await service.approveNiches(
      reviewed.workspaceId,
      reviewed.id,
      ["niche-1"],
      reviewed.version,
      "user-1",
    );

    const ready = await service.moveToDiscoveryReady(
      reviewed.workspaceId,
      reviewed.id,
      approved.version,
    );

    expect(ready.state).toBe("discovery_ready");
    expect(ready.version).toBe(approved.version + 1);
    await expect(
      service.moveToDiscoveryReady(
        ready.workspaceId,
        ready.id,
        ready.version,
      ),
    ).rejects.toEqual(expectCode("INVALID_CAMPAIGN_TRANSITION"));
    expect(
      "moveToResearching" in service ||
        "moveToMessageReview" in service ||
        "activate" in service,
    ).toBe(false);
  });

  it("isolates campaign reads and transitions by workspace", async () => {
    const { campaignRepository, service } = await createHarness();
    const campaign = await createDraft(service);

    expect(
      await campaignRepository.getById("workspace-2", campaign.id),
    ).toBeNull();
    await expect(
      service.recordNicheRecommendations(
        "workspace-2",
        campaign.id,
        ["niche-1"],
        campaign.version,
      ),
    ).rejects.toEqual(expectCode("CAMPAIGN_NOT_FOUND"));
  });

  it("keeps persisted campaigns immutable from input and output mutations", async () => {
    const { campaignRepository, service } = await createHarness();
    const campaign = await createDraft(service);
    const recommendations = ["niche-1"];

    const updated = await service.recordNicheRecommendations(
      campaign.workspaceId,
      campaign.id,
      recommendations,
      campaign.version,
    );
    recommendations.push("changed-input");
    updated.nicheRecommendationIds.push("changed-output");

    expect(
      (
        await campaignRepository.getById(
          campaign.workspaceId,
          campaign.id,
        )
      )?.nicheRecommendationIds,
    ).toEqual(["niche-1"]);
  });

  it("rejects a stale caller version even when the request starts after a commit", async () => {
    const { service } = await createHarness();
    const campaign = await createDraft(service);

    const winner = await service.recordNicheRecommendations(
      campaign.workspaceId,
      campaign.id,
      ["niche-1"],
      campaign.version,
    );

    await expect(
      service.recordNicheRecommendations(
        campaign.workspaceId,
        campaign.id,
        ["niche-2"],
        campaign.version,
      ),
    ).rejects.toEqual(expectCode("STALE_CAMPAIGN_UPDATE"));
    expect(winner.version).toBe(campaign.version + 1);
  });
});

describe("createMemoryCampaignRepository", () => {
  it("parses and normalizes records at persistence boundaries", async () => {
    const repository = createMemoryCampaignRepository();
    const created = await repository.create(
      createCampaignRecord({
        name: "  Argentina SaaS  ",
        nicheRecommendationIds: [" niche-1 ", "niche-1"],
      }),
    );

    expect(created.name).toBe("Argentina SaaS");
    expect(created.nicheRecommendationIds).toEqual(["niche-1"]);
    await expect(
      repository.update(
        {
          ...created,
          state: "discovery_ready",
          approvedNicheIds: [],
          version: created.version + 1,
        },
        created.version,
      ),
    ).rejects.toThrow();
  });

  it("rejects a stale concurrent update without losing the winner", async () => {
    const repository = createMemoryCampaignRepository();
    const original = await repository.create(
      createCampaignRecord({ id: "campaign-1" }),
    );
    const firstReader = await repository.getById(
      original.workspaceId,
      original.id,
    );
    const secondReader = await repository.getById(
      original.workspaceId,
      original.id,
    );

    const winner = await repository.update(
      {
        ...firstReader!,
        name: "Winner",
        version: 2,
      },
      1,
    );
    await expect(
      repository.update(
        {
          ...secondReader!,
          name: "Stale",
          version: 2,
        },
        1,
      ),
    ).rejects.toEqual(expectCode("STALE_CAMPAIGN_UPDATE"));

    expect(
      await repository.getById(original.workspaceId, original.id),
    ).toEqual(winner);
  });
});

describe("createMemoryCampaignUnitOfWork", () => {
  it("serializes exposed repository creates and updates with audited work", async () => {
    let releaseAudit!: () => void;
    let signalAuditReached!: () => void;
    const auditReached = new Promise<void>((resolve) => {
      signalAuditReached = resolve;
    });
    const auditRelease = new Promise<void>((resolve) => {
      releaseAudit = resolve;
    });
    const unitOfWork = createMemoryCampaignUnitOfWork({
      async beforeAuditAppend() {
        signalAuditReached();
        await auditRelease;
      },
    });
    const audited = await unitOfWork.campaignRepository.create(
      createCampaignRecord({ id: "audited" }),
    );
    const directlyUpdated = await unitOfWork.campaignRepository.create(
      createCampaignRecord({ id: "direct-update" }),
    );

    const transaction = unitOfWork.run(
      async ({ campaignRepository, auditRepository }) => {
        const updated = await campaignRepository.update(
          {
            ...audited,
            name: "Audited update",
            version: 2,
          },
          1,
        );
        await auditRepository.append({
          workspaceId: audited.workspaceId,
          actorId: "user-1",
          action: "campaign.created",
          entityId: audited.id,
          metadata: {},
        });
        return updated;
      },
    );
    await auditReached;

    const directCreate = unitOfWork.campaignRepository.create(
      createCampaignRecord({ id: "direct-create" }),
    );
    const directUpdate = unitOfWork.campaignRepository.update(
      {
        ...directlyUpdated,
        name: "Direct update",
        version: 2,
      },
      1,
    );
    releaseAudit();
    await Promise.all([transaction, directCreate, directUpdate]);

    expect(
      await unitOfWork.campaignRepository.getById(
        audited.workspaceId,
        audited.id,
      ),
    ).toMatchObject({ name: "Audited update", version: 2 });
    expect(
      await unitOfWork.campaignRepository.getById(
        audited.workspaceId,
        "direct-create",
      ),
    ).not.toBeNull();
    expect(
      await unitOfWork.campaignRepository.getById(
        directlyUpdated.workspaceId,
        directlyUpdated.id,
      ),
    ).toMatchObject({ name: "Direct update", version: 2 });
  });

  it("serializes exposed audit appends with audited work", async () => {
    let releaseAudit!: () => void;
    let signalAuditReached!: () => void;
    const auditReached = new Promise<void>((resolve) => {
      signalAuditReached = resolve;
    });
    const auditRelease = new Promise<void>((resolve) => {
      releaseAudit = resolve;
    });
    const unitOfWork = createMemoryCampaignUnitOfWork({
      async beforeAuditAppend() {
        signalAuditReached();
        await auditRelease;
      },
    });
    const campaign = await unitOfWork.campaignRepository.create(
      createCampaignRecord({ id: "audited" }),
    );

    const transaction = unitOfWork.run(
      async ({ auditRepository }) => {
        await auditRepository.append({
          workspaceId: campaign.workspaceId,
          actorId: "user-1",
          action: "campaign.created",
          entityId: campaign.id,
          metadata: { source: "transaction" },
        });
      },
    );
    await auditReached;

    const directAppend = unitOfWork.auditRepository.append({
      workspaceId: campaign.workspaceId,
      actorId: "user-1",
      action: "campaign.created",
      entityId: "direct",
      metadata: { source: "direct" },
    });
    releaseAudit();
    await Promise.all([transaction, directAppend]);

    expect(
      await unitOfWork.auditRepository.list(campaign.workspaceId),
    ).toEqual([
      expect.objectContaining({ entityId: campaign.id }),
      expect.objectContaining({ entityId: "direct" }),
    ]);
  });

  it("continues exposed repository operations after an audited rejection", async () => {
    let releaseAudit!: () => void;
    let signalAuditReached!: () => void;
    const auditReached = new Promise<void>((resolve) => {
      signalAuditReached = resolve;
    });
    const auditRelease = new Promise<void>((resolve) => {
      releaseAudit = resolve;
    });
    const unitOfWork = createMemoryCampaignUnitOfWork({
      async beforeAuditAppend() {
        signalAuditReached();
        await auditRelease;
        throw new Error("audit rejected");
      },
    });
    const campaign = await unitOfWork.campaignRepository.create(
      createCampaignRecord({ id: "audited" }),
    );
    const transaction = unitOfWork.run(
      async ({ auditRepository }) => {
        await auditRepository.append({
          workspaceId: campaign.workspaceId,
          actorId: "user-1",
          action: "campaign.created",
          entityId: campaign.id,
          metadata: {},
        });
      },
    );
    await auditReached;

    let directCreateSettled = false;
    const directCreate = unitOfWork.campaignRepository
      .create(createCampaignRecord({ id: "after-rejection" }))
      .finally(() => {
        directCreateSettled = true;
      });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(directCreateSettled).toBe(false);
    releaseAudit();
    await expect(transaction).rejects.toThrow("audit rejected");
    await expect(directCreate).resolves.toMatchObject({
      id: "after-rejection",
    });
  });
});

describe("createDrizzleCampaignRepository", () => {
  it("passes workspace identity and expected version to the executor", async () => {
    const calls: {
      get?: { workspaceId: string; id: string };
      update?: {
        workspaceId: string;
        id: string;
        expectedVersion: number;
        record: CampaignRecord;
      };
    } = {};
    const stored = createCampaignRecord();
    const executor: CampaignPersistenceExecutor = {
      async insert(record) {
        return record;
      },
      async getByIdentity(identity) {
        calls.get = identity;
        return stored;
      },
      async updateByIdentityAndVersion(input) {
        calls.update = input;
        return input.record;
      },
    };
    const repository = createDrizzleCampaignRepository(executor);

    await repository.getById("workspace-1", "campaign-1");
    const updated = await repository.update(
      { ...stored, name: "Updated", version: 2 },
      1,
    );

    expect(calls.get).toEqual({
      workspaceId: "workspace-1",
      id: "campaign-1",
    });
    expect(calls.update).toMatchObject({
      workspaceId: "workspace-1",
      id: "campaign-1",
      expectedVersion: 1,
      record: { version: 2 },
    });
    expect(updated.version).toBe(2);
  });

  it("maps a zero-row CAS update to a stable stale error", async () => {
    const executor: CampaignPersistenceExecutor = {
      async insert(record) {
        return record;
      },
      async getByIdentity() {
        return null;
      },
      async updateByIdentityAndVersion() {
        return null;
      },
    };
    const repository = createDrizzleCampaignRepository(executor);

    expect(
      await repository.getById("workspace-1", "missing"),
    ).toBeNull();
    await expect(
      repository.update(
        createCampaignRecord({ version: 2 }),
        1,
      ),
    ).rejects.toEqual(expectCode("STALE_CAMPAIGN_UPDATE"));
  });

  it("validates rows returned by the executor", async () => {
    const executor: CampaignPersistenceExecutor = {
      async insert() {
        return createCampaignRecord({
          state: "discovery_ready",
        });
      },
      async getByIdentity() {
        return createCampaignRecord({
          state: "niche_review",
        });
      },
      async updateByIdentityAndVersion() {
        return null;
      },
    };
    const repository = createDrizzleCampaignRepository(executor);

    await expect(
      repository.create(createCampaignRecord()),
    ).rejects.toThrow();
    await expect(
      repository.getById("workspace-1", "campaign-1"),
    ).rejects.toThrow();
  });
});

describe("campaign schema", () => {
  it("normalizes names and unique nonblank niche IDs", () => {
    const parsed = campaignRecordSchema.parse(
      createCampaignRecord({
        name: "  Argentina SaaS  ",
        nicheRecommendationIds: [
          " niche-1 ",
          "niche-1",
          "niche-2",
        ],
        approvedNicheIds: [" niche-1 ", "niche-1"],
      }),
    );

    expect(parsed.name).toBe("Argentina SaaS");
    expect(parsed.nicheRecommendationIds).toEqual([
      "niche-1",
      "niche-2",
    ]);
    expect(parsed.approvedNicheIds).toEqual(["niche-1"]);
    expect(() =>
      campaignRecordSchema.parse(
        createCampaignRecord({
          nicheRecommendationIds: ["niche-1", " "],
        }),
      ),
    ).toThrow();
  });

  it("enforces approved subsets and state snapshot invariants", () => {
    expect(() =>
      campaignRecordSchema.parse(
        createCampaignRecord({
          nicheRecommendationIds: ["niche-1"],
          approvedNicheIds: ["niche-2"],
        }),
      ),
    ).toThrow();
    expect(() =>
      campaignRecordSchema.parse(
        createCampaignRecord({ state: "niche_review" }),
      ),
    ).toThrow();
    expect(() =>
      campaignRecordSchema.parse(
        createCampaignRecord({
          state: "discovery_ready",
          nicheRecommendationIds: ["niche-1"],
        }),
      ),
    ).toThrow();
  });

  it("defines the exact campaign states and paid data modes", () => {
    expect(campaignStateValues).toEqual([
      "draft",
      "niche_review",
      "discovery_ready",
      "researching",
      "message_review",
      "active",
      "paused",
      "completed",
    ]);
    expect(paidDataModeValues).toEqual(["free", "paid", "fallback"]);
    expect(offerTicketBandValues).toEqual([
      "usd_5k_15k",
      "usd_15k_plus",
    ]);
    expect(campaigns.state.enumValues).toEqual(campaignStateValues);
    expect(campaigns.paidDataMode.enumValues).toEqual(
      paidDataModeValues,
    );
    expect(campaigns.targetTicketBand.enumValues).toEqual(
      offerTicketBandValues,
    );
  });

  it("requires creator membership and a tenant-safe offer reference", () => {
    const config = getTableConfig(campaigns);
    const references = config.foreignKeys.map((foreignKey) =>
      foreignKey.reference(),
    );

    expect(
      references.some(
        (reference) =>
          reference.foreignTable === workspaceMembers &&
          reference.columns.map((column) => column.name).join(",") ===
            "workspace_id,created_by" &&
          reference.foreignColumns
            .map((column) => column.name)
            .join(",") === "workspace_id,user_id",
      ),
    ).toBe(true);
    expect(
      references.some(
        (reference) =>
          reference.foreignTable === offers &&
          reference.columns.map((column) => column.name).join(",") ===
            "workspace_id,offer_id" &&
          reference.foreignColumns
            .map((column) => column.name)
            .join(",") === "workspace_id,id",
      ),
    ).toBe(true);
  });

  it("indexes deterministic workspace campaign listings", () => {
    const listingIndex = getTableConfig(campaigns).indexes.find(
      (index) =>
        index.config.name ===
        "campaigns_workspace_created_at_id_idx",
    );

    expect(
      listingIndex?.config.columns.map((column) =>
        "name" in column ? column.name : undefined,
      ),
    ).toEqual(["workspace_id", "created_at", "id"]);
  });

  it("checks target volume, JSON arrays, state snapshots, and optimistic version", () => {
    const checkNames = getTableConfig(campaigns).checks.map(
      (constraint) => constraint.name,
    );

    expect(checkNames).toEqual(
      expect.arrayContaining([
        "campaigns_target_daily_emails_check",
        "campaigns_niche_recommendation_ids_json_array_check",
        "campaigns_approved_niche_ids_json_array_check",
        "campaigns_review_states_recommendations_check",
        "campaigns_discovery_ready_approved_check",
        "campaigns_version_positive_check",
      ]),
    );
  });
});

function createCampaignRecord(
  overrides: Partial<CampaignRecord> = {},
): CampaignRecord {
  const createdAt = new Date("2026-06-19T12:00:00.000Z");

  return {
    id: "campaign-1",
    workspaceId: "workspace-1",
    offerId: "offer-1",
    createdBy: "user-1",
    name: "Argentina SaaS",
    targetDailyEmails: 25,
    paidDataMode: "fallback",
    targetTicketBand: "usd_5k_15k",
    state: "draft",
    nicheRecommendationIds: [],
    approvedNicheIds: [],
    version: 1,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}
