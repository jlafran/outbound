import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  campaigns,
  offers,
  workspaceMembers,
} from "@/db/schema";
import {
  createMemoryCampaignRepository,
} from "@/features/campaigns/campaign-repository";
import {
  campaignStateValues,
  paidDataModeValues,
  type CampaignRecord,
} from "@/features/campaigns/campaign-schema";
import {
  CampaignService,
  type CreateCampaignInput,
} from "@/features/campaigns/campaign-service";
import { createMemoryOfferRepository } from "@/features/offers/offer-repository";
import { normalizedOffer } from "../fixtures/offer";

const validCreateInput: CreateCampaignInput = {
  workspaceId: "workspace-1",
  actorId: "user-1",
  offerId: "offer-1",
  name: "Argentina SaaS",
  targetDailyEmails: 25,
  paidDataMode: "fallback",
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
  const campaignRepository = createMemoryCampaignRepository();

  return {
    campaignRepository,
    offerRepository,
    service: new CampaignService(campaignRepository, offerRepository),
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
  await service.recordNicheRecommendations(
    campaign.workspaceId,
    campaign.id,
    ["niche-1", "niche-2"],
  );
  return service.moveToNicheReview(campaign.workspaceId, campaign.id);
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
      ).rejects.toThrow();
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
      ),
    ).rejects.toEqual(expectCode("NICHE_RECOMMENDATIONS_REQUIRED"));
    await expect(
      service.recordNicheRecommendations(
        campaign.workspaceId,
        campaign.id,
        ["niche-1", ""],
      ),
    ).rejects.toEqual(expectCode("NICHE_RECOMMENDATIONS_REQUIRED"));

    await service.moveToNicheReview(campaign.workspaceId, campaign.id);
    await expect(
      service.recordNicheRecommendations(
        campaign.workspaceId,
        campaign.id,
        ["niche-3"],
      ),
    ).rejects.toEqual(expectCode("INVALID_CAMPAIGN_TRANSITION"));
  });

  it("requires recommendations before moving a draft to niche review", async () => {
    const { service } = await createHarness();
    const campaign = await createDraft(service);

    await expect(
      service.moveToNicheReview(campaign.workspaceId, campaign.id),
    ).rejects.toEqual(
      expectCode("NICHE_RECOMMENDATIONS_REQUIRED"),
    );
  });

  it("moves a draft with recommendations to niche review", async () => {
    const { service } = await createHarness();
    const campaign = await createDraft(service);

    await service.recordNicheRecommendations(
      "workspace-1",
      campaign.id,
      ["niche-1"],
    );
    const reviewed = await service.moveToNicheReview(
      "workspace-1",
      campaign.id,
    );

    expect(reviewed.state).toBe("niche_review");
  });

  it("approves a unique nonempty subset of recommended niches", async () => {
    const { service } = await createHarness();
    const reviewed = await createNicheReview(service);

    const approved = await service.approveNiches(
      reviewed.workspaceId,
      reviewed.id,
      ["niche-2", "niche-2"],
    );

    expect(approved.approvedNicheIds).toEqual(["niche-2"]);
    await expect(
      service.approveNiches(reviewed.workspaceId, reviewed.id, []),
    ).rejects.toEqual(expectCode("APPROVED_NICHE_REQUIRED"));
    await expect(
      service.approveNiches(reviewed.workspaceId, reviewed.id, [
        "niche-3",
      ]),
    ).rejects.toEqual(expectCode("NICHE_NOT_RECOMMENDED"));
  });

  it("rejects niche approval outside niche review", async () => {
    const { service } = await createHarness();
    const campaign = await createDraft(service);

    await expect(
      service.approveNiches(campaign.workspaceId, campaign.id, [
        "niche-1",
      ]),
    ).rejects.toEqual(expectCode("INVALID_CAMPAIGN_TRANSITION"));
  });

  it("requires an approved niche before discovery ready", async () => {
    const { service } = await createHarness();
    const reviewed = await createNicheReview(service);

    await expect(
      service.moveToDiscoveryReady(
        reviewed.workspaceId,
        reviewed.id,
      ),
    ).rejects.toEqual(expectCode("APPROVED_NICHE_REQUIRED"));
  });

  it("completes the valid phase 1 flow at discovery ready", async () => {
    const { service } = await createHarness();
    const reviewed = await createNicheReview(service);
    await service.approveNiches(reviewed.workspaceId, reviewed.id, [
      "niche-1",
    ]);

    const ready = await service.moveToDiscoveryReady(
      reviewed.workspaceId,
      reviewed.id,
    );

    expect(ready.state).toBe("discovery_ready");
    await expect(
      service.moveToDiscoveryReady(ready.workspaceId, ready.id),
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
});

describe("createMemoryCampaignRepository", () => {
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

describe("campaign schema", () => {
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
    expect(campaigns.state.enumValues).toEqual(campaignStateValues);
    expect(campaigns.paidDataMode.enumValues).toEqual(
      paidDataModeValues,
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

  it("checks target volume, JSON arrays, and optimistic version", () => {
    const checkNames = getTableConfig(campaigns).checks.map(
      (constraint) => constraint.name,
    );

    expect(checkNames).toEqual(
      expect.arrayContaining([
        "campaigns_target_daily_emails_check",
        "campaigns_niche_recommendation_ids_json_array_check",
        "campaigns_approved_niche_ids_json_array_check",
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
    state: "draft",
    nicheRecommendationIds: [],
    approvedNicheIds: [],
    version: 1,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}
