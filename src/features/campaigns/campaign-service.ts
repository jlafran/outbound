import type { OfferRepository } from "@/features/offers/offer-repository";

import type {
  CampaignInput,
  CampaignRecord,
} from "./campaign-schema";
import {
  CampaignError,
  campaignInputSchema,
} from "./campaign-schema";
import type { CampaignRepository } from "./campaign-repository";

export type CreateCampaignInput = Omit<
  CampaignInput,
  "createdBy"
> & {
  actorId: string;
};

export class CampaignService {
  constructor(
    private readonly campaignRepository: CampaignRepository,
    private readonly offerRepository: OfferRepository,
  ) {}

  async create(input: CreateCampaignInput): Promise<CampaignRecord> {
    const result = campaignInputSchema.safeParse({
      workspaceId: input.workspaceId,
      offerId: input.offerId,
      createdBy: input.actorId,
      name: input.name,
      targetDailyEmails: input.targetDailyEmails,
      paidDataMode: input.paidDataMode,
    });
    if (!result.success) {
      throw new CampaignError("INVALID_CAMPAIGN_INPUT", {
        cause: result.error,
      });
    }
    const parsed = result.data;
    const offer = await this.offerRepository.getById(
      parsed.workspaceId,
      parsed.offerId,
    );

    if (!offer) {
      throw new CampaignError("OFFER_REQUIRED");
    }

    const now = new Date();
    return this.campaignRepository.create({
      id: crypto.randomUUID(),
      ...parsed,
      state: "draft",
      nicheRecommendationIds: [],
      approvedNicheIds: [],
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
  }

  async recordNicheRecommendations(
    workspaceId: string,
    campaignId: string,
    ids: string[],
    expectedVersion: number,
  ): Promise<CampaignRecord> {
    const campaign = await this.requireCampaign(workspaceId, campaignId);
    this.requireExpectedVersion(campaign, expectedVersion);
    this.requireState(campaign, "draft");
    const uniqueIds = this.requireIds(
      ids,
      "NICHE_RECOMMENDATIONS_REQUIRED",
    );

    return this.campaignRepository.update(
      {
        ...campaign,
        nicheRecommendationIds: uniqueIds,
        version: expectedVersion + 1,
        updatedAt: new Date(),
      },
      expectedVersion,
    );
  }

  async moveToNicheReview(
    workspaceId: string,
    campaignId: string,
    expectedVersion: number,
  ): Promise<CampaignRecord> {
    const campaign = await this.requireCampaign(workspaceId, campaignId);

    this.requireExpectedVersion(campaign, expectedVersion);
    this.requireState(campaign, "draft");
    if (campaign.nicheRecommendationIds.length === 0) {
      throw new CampaignError("NICHE_RECOMMENDATIONS_REQUIRED");
    }

    return this.campaignRepository.update(
      {
        ...campaign,
        state: "niche_review",
        version: expectedVersion + 1,
        updatedAt: new Date(),
      },
      expectedVersion,
    );
  }

  async approveNiches(
    workspaceId: string,
    campaignId: string,
    ids: string[],
    expectedVersion: number,
  ): Promise<CampaignRecord> {
    const campaign = await this.requireCampaign(workspaceId, campaignId);
    this.requireExpectedVersion(campaign, expectedVersion);
    this.requireState(campaign, "niche_review");
    const uniqueIds = this.requireIds(ids, "APPROVED_NICHE_REQUIRED");
    const recommendedIds = new Set(campaign.nicheRecommendationIds);

    if (uniqueIds.some((id) => !recommendedIds.has(id))) {
      throw new CampaignError("NICHE_NOT_RECOMMENDED");
    }

    return this.campaignRepository.update(
      {
        ...campaign,
        approvedNicheIds: uniqueIds,
        version: expectedVersion + 1,
        updatedAt: new Date(),
      },
      expectedVersion,
    );
  }

  async moveToDiscoveryReady(
    workspaceId: string,
    campaignId: string,
    expectedVersion: number,
  ): Promise<CampaignRecord> {
    const campaign = await this.requireCampaign(workspaceId, campaignId);
    this.requireExpectedVersion(campaign, expectedVersion);
    this.requireState(campaign, "niche_review");

    if (campaign.approvedNicheIds.length === 0) {
      throw new CampaignError("APPROVED_NICHE_REQUIRED");
    }

    return this.campaignRepository.update(
      {
        ...campaign,
        state: "discovery_ready",
        version: expectedVersion + 1,
        updatedAt: new Date(),
      },
      expectedVersion,
    );
  }

  private async requireCampaign(
    workspaceId: string,
    campaignId: string,
  ): Promise<CampaignRecord> {
    const campaign = await this.campaignRepository.getById(
      workspaceId,
      campaignId,
    );

    if (!campaign) {
      throw new CampaignError("CAMPAIGN_NOT_FOUND");
    }

    return campaign;
  }

  private requireState(
    campaign: CampaignRecord,
    expectedState: CampaignRecord["state"],
  ): void {
    if (campaign.state !== expectedState) {
      throw new CampaignError("INVALID_CAMPAIGN_TRANSITION");
    }
  }

  private requireExpectedVersion(
    campaign: CampaignRecord,
    expectedVersion: number,
  ): void {
    if (campaign.version !== expectedVersion) {
      throw new CampaignError("STALE_CAMPAIGN_UPDATE");
    }
  }

  private requireIds(
    ids: string[],
    emptyCode:
      | "APPROVED_NICHE_REQUIRED"
      | "NICHE_RECOMMENDATIONS_REQUIRED",
  ): string[] {
    if (
      ids.length === 0 ||
      ids.some((id) => typeof id !== "string" || id.trim().length === 0)
    ) {
      throw new CampaignError(emptyCode);
    }

    return [...new Set(ids.map((id) => id.trim()))];
  }
}
