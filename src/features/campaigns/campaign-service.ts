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
    const parsed = campaignInputSchema.parse({
      workspaceId: input.workspaceId,
      offerId: input.offerId,
      createdBy: input.actorId,
      name: input.name,
      targetDailyEmails: input.targetDailyEmails,
      paidDataMode: input.paidDataMode,
    });
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
  ): Promise<CampaignRecord> {
    const campaign = await this.requireCampaign(workspaceId, campaignId);
    this.requireState(campaign, "draft");
    const uniqueIds = this.requireIds(
      ids,
      "NICHE_RECOMMENDATIONS_REQUIRED",
    );
    const nextVersion = campaign.version + 1;

    return this.campaignRepository.update(
      {
        ...campaign,
        nicheRecommendationIds: uniqueIds,
        version: nextVersion,
        updatedAt: new Date(),
      },
      campaign.version,
    );
  }

  async moveToNicheReview(
    workspaceId: string,
    campaignId: string,
  ): Promise<CampaignRecord> {
    const campaign = await this.requireCampaign(workspaceId, campaignId);

    this.requireState(campaign, "draft");
    if (campaign.nicheRecommendationIds.length === 0) {
      throw new CampaignError("NICHE_RECOMMENDATIONS_REQUIRED");
    }

    return this.campaignRepository.update(
      {
        ...campaign,
        state: "niche_review",
        version: campaign.version + 1,
        updatedAt: new Date(),
      },
      campaign.version,
    );
  }

  async approveNiches(
    workspaceId: string,
    campaignId: string,
    ids: string[],
  ): Promise<CampaignRecord> {
    const campaign = await this.requireCampaign(workspaceId, campaignId);
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
        version: campaign.version + 1,
        updatedAt: new Date(),
      },
      campaign.version,
    );
  }

  async moveToDiscoveryReady(
    workspaceId: string,
    campaignId: string,
  ): Promise<CampaignRecord> {
    const campaign = await this.requireCampaign(workspaceId, campaignId);
    this.requireState(campaign, "niche_review");

    if (campaign.approvedNicheIds.length === 0) {
      throw new CampaignError("APPROVED_NICHE_REQUIRED");
    }

    return this.campaignRepository.update(
      {
        ...campaign,
        state: "discovery_ready",
        version: campaign.version + 1,
        updatedAt: new Date(),
      },
      campaign.version,
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
