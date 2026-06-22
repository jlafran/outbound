import type { OfferRepository } from "@/features/offers/offer-repository";
import { normalizedOfferSchema } from "@/features/offers/offer-schema";
import type { JsonValue } from "@/features/audit/audit-repository";
import type { NicheAdvisor } from "@/features/niches/niche-advisor";
import {
  rankedNicheRecommendationListSchema,
  type NicheRecommendation,
} from "@/features/niches/niche-schema";
import { areNicheRecommendationsSafe } from "@/features/niches/niche-safety";

import type {
  CampaignInput,
  CampaignRecord,
} from "./campaign-schema";
import {
  CampaignError,
  campaignInputSchema,
} from "./campaign-schema";
import type { CampaignRepository } from "./campaign-repository";
import type { CampaignUnitOfWork } from "./campaign-unit-of-work";

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
    private readonly nicheAdvisor: NicheAdvisor,
    private readonly unitOfWork: CampaignUnitOfWork,
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

  async recommendNiches(
    workspaceId: string,
    campaignId: string,
    actorId: string,
    expectedVersion: number,
  ): Promise<{
    campaign: CampaignRecord;
    recommendations: NicheRecommendation[];
  }> {
    const campaign = await this.requireCampaign(
      workspaceId,
      campaignId,
    );
    this.requireExpectedVersion(campaign, expectedVersion);
    this.requireState(campaign, "draft");
    const recommendations = await this.generateNicheRecommendations(
      workspaceId,
      campaign.offerId,
    );
    const recommendationIds = recommendations.map(({ id }) => id);

    const updated = await this.unitOfWork.run(
      async ({ campaignRepository, auditRepository }) => {
        const current = await this.requireCampaign(
          workspaceId,
          campaignId,
          campaignRepository,
        );
        this.requireExpectedVersion(current, expectedVersion);
        this.requireState(current, "draft");
        const persisted = await campaignRepository.update(
          {
            ...current,
            nicheRecommendationIds: recommendationIds,
            version: expectedVersion + 1,
            updatedAt: new Date(),
          },
          expectedVersion,
        );
        const metadata = {
          recommendationIds,
          count: recommendationIds.length,
        } satisfies JsonValue;

        await auditRepository.append({
          workspaceId,
          actorId,
          action: "niches.recommended",
          entityId: campaignId,
          metadata,
        });

        return persisted;
      },
    );

    return {
      campaign: updated,
      recommendations: structuredClone(recommendations),
    };
  }

  async recoverNicheRecommendations(
    workspaceId: string,
    campaignId: string,
  ): Promise<NicheRecommendation[]> {
    const campaign = await this.requireCampaign(workspaceId, campaignId);
    this.requireState(campaign, "draft");
    if (campaign.nicheRecommendationIds.length === 0) {
      throw new CampaignError("NICHE_RECOMMENDATIONS_REQUIRED");
    }
    const recommendations = await this.generateNicheRecommendations(
      workspaceId,
      campaign.offerId,
    );
    const recommendationIds = recommendations.map(({ id }) => id);
    if (
      recommendationIds.length !== campaign.nicheRecommendationIds.length ||
      recommendationIds.some(
        (id, index) => id !== campaign.nicheRecommendationIds[index],
      )
    ) {
      throw new CampaignError("INVALID_NICHE_RECOMMENDATIONS");
    }
    return structuredClone(recommendations);
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
    actorId: string,
  ): Promise<CampaignRecord> {
    return this.unitOfWork.run(
      async ({ campaignRepository, auditRepository }) => {
        const campaign = await this.requireCampaign(
          workspaceId,
          campaignId,
          campaignRepository,
        );
        this.requireExpectedVersion(campaign, expectedVersion);
        this.requireState(campaign, "niche_review");
        const uniqueIds = this.requireIds(
          ids,
          "APPROVED_NICHE_REQUIRED",
        );
        const recommendedIds = new Set(
          campaign.nicheRecommendationIds,
        );

        if (uniqueIds.some((id) => !recommendedIds.has(id))) {
          throw new CampaignError("NICHE_NOT_RECOMMENDED");
        }

        const updated = await campaignRepository.update(
          {
            ...campaign,
            approvedNicheIds: uniqueIds,
            version: expectedVersion + 1,
            updatedAt: new Date(),
          },
          expectedVersion,
        );
        const metadata = {
          approvedIds: uniqueIds,
          count: uniqueIds.length,
        } satisfies JsonValue;

        await auditRepository.append({
          workspaceId,
          actorId,
          action: "niches.approved",
          entityId: campaignId,
          metadata,
        });

        return updated;
      },
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
    repository: CampaignRepository = this.campaignRepository,
  ): Promise<CampaignRecord> {
    const campaign = await repository.getById(workspaceId, campaignId);

    if (!campaign) {
      throw new CampaignError("CAMPAIGN_NOT_FOUND");
    }

    return campaign;
  }

  private async generateNicheRecommendations(
    workspaceId: string,
    offerId: string,
  ): Promise<NicheRecommendation[]> {
    const offer = await this.offerRepository.getById(workspaceId, offerId);

    if (!offer) {
      throw new CampaignError("OFFER_REQUIRED");
    }

    const recommendationResult =
      rankedNicheRecommendationListSchema.safeParse(
        await this.nicheAdvisor.recommend(
          normalizedOfferSchema.parse(offer),
        ),
      );
    if (!recommendationResult.success) {
      throw new CampaignError("INVALID_NICHE_RECOMMENDATIONS", {
        cause: recommendationResult.error,
      });
    }
    const recommendations = recommendationResult.data;
    if (!areNicheRecommendationsSafe(offer, recommendations)) {
      throw new CampaignError("UNSAFE_NICHE_RECOMMENDATION");
    }
    return recommendations;
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
