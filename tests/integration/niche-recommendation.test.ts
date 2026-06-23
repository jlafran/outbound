import { describe, expect, it } from "vitest";

import {
  CampaignService,
  type CreateCampaignInput,
} from "@/features/campaigns/campaign-service";
import { createMemoryCampaignUnitOfWork } from "@/features/campaigns/campaign-unit-of-work";
import type { NicheAdvisor } from "@/features/niches/niche-advisor";
import { FakeNicheAdvisor } from "@/features/niches/fake-niche-advisor";
import {
  calculateNicheScore,
  nicheRecommendationSchema,
} from "@/features/niches/niche-schema";
import { createMemoryOfferRepository } from "@/features/offers/offer-repository";
import type { NormalizedOffer } from "@/features/offers/offer-schema";
import { normalizedOffer } from "../fixtures/offer";

const campaignInput: CreateCampaignInput = {
  workspaceId: "workspace-1",
  actorId: "user-1",
  offerId: "offer-1",
  name: "Argentina outbound",
  targetDailyEmails: 25,
  paidDataMode: "fallback",
  targetTicketBand: "usd_15k_plus",
};

async function createCampaignHarness(
  options: Parameters<typeof createMemoryCampaignUnitOfWork>[0] = {},
  advisor: NicheAdvisor = new FakeNicheAdvisor(),
  offer: NormalizedOffer = normalizedOffer,
) {
  const unitOfWork = createMemoryCampaignUnitOfWork(options);
  const offerRepository = createMemoryOfferRepository();
  await offerRepository.create({
    id: "offer-1",
    workspaceId: "workspace-1",
    createdBy: "user-1",
    ...offer,
    createdAt: new Date("2026-06-19T12:00:00.000Z"),
  });
  const service = new CampaignService(
    unitOfWork.campaignRepository,
    offerRepository,
    advisor,
    unitOfWork,
  );

  return { advisor, offerRepository, service, unitOfWork };
}

describe("FakeNicheAdvisor", () => {
  it("returns deterministic recommendations for the same offer", async () => {
    const advisor = new FakeNicheAdvisor();

    const first = await advisor.recommend(normalizedOffer);
    const second = await advisor.recommend(normalizedOffer);

    expect(first).toEqual(second);
  });

  it("returns three valid Argentina-oriented recommendations ranked by score", async () => {
    const recommendations = await new FakeNicheAdvisor().recommend(
      normalizedOffer,
    );

    expect(recommendations).toHaveLength(3);
    expect(recommendations.map(({ name }) => name)).toEqual([
      "Logística",
      "Software B2B",
      "Salud privada",
    ]);
    expect(
      recommendations.every(
        (recommendation) =>
          nicheRecommendationSchema.safeParse(recommendation).success,
      ),
    ).toBe(true);
    expect(recommendations[0].score).toBeGreaterThan(
      recommendations[1].score,
    );
    expect(recommendations[1].score).toBeGreaterThan(
      recommendations[2].score,
    );
    expect(
      recommendations.map(
        ({
          capacityToPay,
          problemMagnitude,
          urgency,
          roiClarity,
          decisionMakerAccess,
        }) =>
          calculateNicheScore({
            capacityToPay,
            problemMagnitude,
            urgency,
            roiClarity,
            decisionMakerAccess,
          }),
      ),
    ).toEqual(recommendations.map(({ score }) => score));
  });

  it("ties its reasoning to the offer economics without prohibited claims", async () => {
    const offer = {
      ...normalizedOffer,
      problems: ["Demoras de cobranza"],
      expectedResults: ["Reducir días de cobro"],
      prohibitedClaims: ["Garantizamos duplicar ingresos"],
    };

    const recommendations = await new FakeNicheAdvisor().recommend(offer);
    const serialized = JSON.stringify(recommendations);

    expect(serialized).toContain("Demoras de cobranza");
    expect(serialized).toContain("Reducir días de cobro");
    expect(serialized).toContain("USD 15k+");
    expect(serialized).not.toContain("Garantizamos duplicar ingresos");
    expect(serialized).not.toMatch(/caso de (éxito|estudio)/i);
  });

  it("does not leak caller mutations into future recommendations", async () => {
    const advisor = new FakeNicheAdvisor();
    const first = await advisor.recommend(normalizedOffer);

    first[0].name = "Mutated";
    first.push(structuredClone(first[0]));

    const second = await advisor.recommend(normalizedOffer);

    expect(second).toHaveLength(3);
    expect(second[0].name).toBe("Logística");
  });
});

describe("nicheRecommendationSchema", () => {
  it("calculates the weighted niche score and rounds to two decimals", () => {
    expect(
      calculateNicheScore({
        capacityToPay: 92,
        problemMagnitude: 94,
        urgency: 91,
        roiClarity: 93,
        decisionMakerAccess: 84,
      }),
    ).toBe(91.75);
  });

  it("enforces score, count, identity, and reasoning boundaries", () => {
    const valid = {
      id: "logistica-ar",
      name: "Logística",
      score: 90,
      capacityToPay: 90,
      problemMagnitude: 90,
      urgency: 90,
      roiClarity: 90,
      decisionMakerAccess: 90,
      estimatedCompanyCount: 100,
      reasoning:
        "La oferta conecta el problema y el resultado con valor económico.",
    };

    expect(nicheRecommendationSchema.parse(valid)).toEqual(valid);
    expect(() =>
      nicheRecommendationSchema.parse({ ...valid, score: 90.01 }),
    ).toThrow();
    expect(() =>
      nicheRecommendationSchema.parse({ ...valid, id: " " }),
    ).toThrow();
    expect(() =>
      nicheRecommendationSchema.parse({
        ...valid,
        id: "logistica argentina con texto",
      }),
    ).toThrow();
    expect(() =>
      nicheRecommendationSchema.parse({ ...valid, score: 101 }),
    ).toThrow();
    expect(() =>
      nicheRecommendationSchema.parse({
        ...valid,
        capacityToPay: -1,
      }),
    ).toThrow();
    expect(() =>
      nicheRecommendationSchema.parse({
        ...valid,
        score: 100,
        capacityToPay: 0,
        problemMagnitude: 0,
        urgency: 0,
        roiClarity: 0,
        decisionMakerAccess: 0,
      }),
    ).toThrow();
    expect(() =>
      nicheRecommendationSchema.parse({
        ...valid,
        estimatedCompanyCount: 1.5,
      }),
    ).toThrow();
    expect(() =>
      nicheRecommendationSchema.parse({ ...valid, reasoning: "Too short" }),
    ).toThrow();
    expect(() =>
      nicheRecommendationSchema.parse({
        ...valid,
        rawOffer: "must not cross the advisor boundary",
      }),
    ).toThrow();
  });
});

describe("CampaignService niche recommendations", () => {
  it("loads the campaign offer, stores ranked IDs, and audits once", async () => {
    let loadedOffer: typeof normalizedOffer | undefined;
    const fakeAdvisor = new FakeNicheAdvisor();
    const advisor: NicheAdvisor = {
      async recommend(offer) {
        loadedOffer = structuredClone(offer);
        return fakeAdvisor.recommend(offer);
      },
    };
    const { service, unitOfWork } = await createCampaignHarness(
      {},
      advisor,
    );
    const campaign = await service.create(campaignInput);

    const result = await service.recommendNiches(
      campaign.workspaceId,
      campaign.id,
      "user-1",
      campaign.version,
    );

    expect(loadedOffer).toEqual(normalizedOffer);
    expect(result.campaign.nicheRecommendationIds).toEqual(
      result.recommendations.map(({ id }) => id),
    );
    expect(result.campaign.version).toBe(campaign.version + 1);
    expect(result.recommendations).toHaveLength(3);
    expect(
      await unitOfWork.auditRepository.list(campaign.workspaceId),
    ).toEqual([
      {
        workspaceId: campaign.workspaceId,
        actorId: "user-1",
        action: "niches.recommended",
        entityId: campaign.id,
        metadata: {
          recommendationIds: result.campaign.nicheRecommendationIds,
          count: 3,
        },
      },
    ]);
  });

  it("uses each campaign target ticket for recommendation and recovery without mutating the offer", async () => {
    const advisedOffers: NormalizedOffer[] = [];
    const fakeAdvisor = new FakeNicheAdvisor();
    const advisor: NicheAdvisor = {
      async recommend(offer) {
        advisedOffers.push(structuredClone(offer));
        return fakeAdvisor.recommend(offer);
      },
    };
    const { offerRepository, service } = await createCampaignHarness(
      {},
      advisor,
    );
    const lowerTicketCampaign = await service.create({
      ...campaignInput,
      targetTicketBand: "usd_5k_15k",
    });
    const higherTicketCampaign = await service.create({
      ...campaignInput,
      name: "Argentina enterprise",
      targetTicketBand: "usd_15k_plus",
    });

    await service.recommendNiches(
      lowerTicketCampaign.workspaceId,
      lowerTicketCampaign.id,
      "user-1",
      lowerTicketCampaign.version,
    );
    await service.recommendNiches(
      higherTicketCampaign.workspaceId,
      higherTicketCampaign.id,
      "user-1",
      higherTicketCampaign.version,
    );
    await service.recoverNicheRecommendations(
      lowerTicketCampaign.workspaceId,
      lowerTicketCampaign.id,
    );
    await service.recoverNicheRecommendations(
      higherTicketCampaign.workspaceId,
      higherTicketCampaign.id,
    );

    expect(advisedOffers.map(({ ticketBand }) => ticketBand)).toEqual([
      "usd_5k_15k",
      "usd_15k_plus",
      "usd_5k_15k",
      "usd_15k_plus",
    ]);
    await expect(
      offerRepository.getById("workspace-1", "offer-1"),
    ).resolves.toMatchObject({
      ticketBand: normalizedOffer.ticketBand,
    });
  });

  it("recovers validated recommendations without mutation or audit", async () => {
    const { service, unitOfWork } = await createCampaignHarness();
    const campaign = await service.create(campaignInput);
    const recommended = await service.recommendNiches(
      campaign.workspaceId,
      campaign.id,
      "user-1",
      campaign.version,
    );
    const eventsBefore = await unitOfWork.auditRepository.list(
      campaign.workspaceId,
    );
    expect(eventsBefore).toHaveLength(1);

    const recovered = await service.recoverNicheRecommendations(
      campaign.workspaceId,
      campaign.id,
    );

    expect(recovered).toEqual(recommended.recommendations);
    expect(
      await unitOfWork.campaignRepository.getById(
        campaign.workspaceId,
        campaign.id,
      ),
    ).toEqual(recommended.campaign);
    expect(
      await unitOfWork.auditRepository.list(campaign.workspaceId),
    ).toEqual(eventsBefore);
  });

  it("rejects recovery when regenerated IDs differ from stored IDs", async () => {
    const fakeAdvisor = new FakeNicheAdvisor();
    let call = 0;
    const advisor: NicheAdvisor = {
      async recommend(offer) {
        const recommendations = await fakeAdvisor.recommend(offer);
        call += 1;
        if (call === 2) {
          recommendations[0] = {
            ...recommendations[0],
            id: "different-niche-ar",
          };
        }
        return recommendations;
      },
    };
    const { service } = await createCampaignHarness({}, advisor);
    const campaign = await service.create(campaignInput);
    await service.recommendNiches(
      campaign.workspaceId,
      campaign.id,
      "user-1",
      campaign.version,
    );

    await expect(
      service.recoverNicheRecommendations(
        campaign.workspaceId,
        campaign.id,
      ),
    ).rejects.toEqual(
      expect.objectContaining({ code: "INVALID_NICHE_RECOMMENDATIONS" }),
    );
  });

  it("rejects invalid advisor output", async () => {
    const recommendations = await new FakeNicheAdvisor().recommend(
      normalizedOffer,
    );
    const advisor: NicheAdvisor = {
      async recommend() {
        return [
          recommendations[0],
          recommendations[0],
          recommendations[2],
        ];
      },
    };
    const { service } = await createCampaignHarness({}, advisor);
    const campaign = await service.create(campaignInput);

    await expect(
      service.recommendNiches(
        campaign.workspaceId,
        campaign.id,
        "user-1",
        campaign.version,
      ),
    ).rejects.toEqual(
      expect.objectContaining({ code: "INVALID_NICHE_RECOMMENDATIONS" }),
    );
  });

  it("rejects reasoning containing a normalized prohibited claim", async () => {
    const offer = {
      ...normalizedOffer,
      prohibitedClaims: ["Exclusive market proof"],
    };
    const recommendations = await new FakeNicheAdvisor().recommend(offer);
    recommendations[0].reasoning =
      "Pipeline stalls remains relevant, but EXCLUSIVE   MARKET proof is unsafe.";
    const advisor: NicheAdvisor = {
      async recommend() {
        return recommendations;
      },
    };
    const { service, unitOfWork } = await createCampaignHarness(
      {},
      advisor,
      offer,
    );
    const campaign = await service.create(campaignInput);

    await expect(
      service.recommendNiches(
        campaign.workspaceId,
        campaign.id,
        "user-1",
        campaign.version,
      ),
    ).rejects.toEqual(
      expect.objectContaining({ code: "UNSAFE_NICHE_RECOMMENDATION" }),
    );
    expect(
      await unitOfWork.campaignRepository.getById(
        campaign.workspaceId,
        campaign.id,
      ),
    ).toEqual(campaign);
  });

  it("rejects an unsafe advisor-controlled name", async () => {
    const recommendations = await new FakeNicheAdvisor().recommend(
      normalizedOffer,
    );
    recommendations[0].name =
      "Logística with guaranteed 37% conversion";
    const advisor: NicheAdvisor = {
      async recommend() {
        return recommendations;
      },
    };
    const { service } = await createCampaignHarness({}, advisor);
    const campaign = await service.create(campaignInput);

    await expect(
      service.recommendNiches(
        campaign.workspaceId,
        campaign.id,
        "user-1",
        campaign.version,
      ),
    ).rejects.toEqual(
      expect.objectContaining({ code: "UNSAFE_NICHE_RECOMMENDATION" }),
    );
  });

  it("rejects an unsafe slug-shaped advisor-controlled id", async () => {
    const offer = {
      ...normalizedOffer,
      prohibitedClaims: ["exclusive market proof"],
    };
    const recommendations = await new FakeNicheAdvisor().recommend(offer);
    recommendations[0].id = "exclusive-market-proof";
    const advisor: NicheAdvisor = {
      async recommend() {
        return recommendations;
      },
    };
    const { service } = await createCampaignHarness({}, advisor, offer);
    const campaign = await service.create(campaignInput);

    await expect(
      service.recommendNiches(
        campaign.workspaceId,
        campaign.id,
        "user-1",
        campaign.version,
      ),
    ).rejects.toEqual(
      expect.objectContaining({ code: "UNSAFE_NICHE_RECOMMENDATION" }),
    );
  });

  it("rejects a substantial verbatim raw offer excerpt", async () => {
    const recommendations = await new FakeNicheAdvisor().recommend(
      normalizedOffer,
    );
    recommendations[0].reasoning =
      `${normalizedOffer.rawText} Pipeline stalls remains the target problem.`;
    const advisor: NicheAdvisor = {
      async recommend() {
        return recommendations;
      },
    };
    const { service } = await createCampaignHarness({}, advisor);
    const campaign = await service.create(campaignInput);

    await expect(
      service.recommendNiches(
        campaign.workspaceId,
        campaign.id,
        "user-1",
        campaign.version,
      ),
    ).rejects.toEqual(
      expect.objectContaining({ code: "UNSAFE_NICHE_RECOMMENDATION" }),
    );
  });

  it.each([
    "Pipeline stalls could improve conversion by 37% for this niche.",
    "Pipeline stalls could reduce cycle time by 12 days for this niche.",
    "Pipeline stalls could produce USD 4,000 in savings for this niche.",
    "Pipeline stalls could produce €4,000 for this niche.",
    "Pipeline stalls is guaranteed to improve for this niche.",
    "Pipeline stalls could save 20 hours for this niche.",
  ])("rejects unsupported protected claims: %s", async (reasoning) => {
    const recommendations = await new FakeNicheAdvisor().recommend(
      normalizedOffer,
    );
    recommendations[0].reasoning = reasoning;
    const advisor: NicheAdvisor = {
      async recommend() {
        return recommendations;
      },
    };
    const { service } = await createCampaignHarness({}, advisor);
    const campaign = await service.create(campaignInput);

    await expect(
      service.recommendNiches(
        campaign.workspaceId,
        campaign.id,
        "user-1",
        campaign.version,
      ),
    ).rejects.toEqual(
      expect.objectContaining({ code: "UNSAFE_NICHE_RECOMMENDATION" }),
    );
  });

  it("rejects reasoning ungrounded in approved problems or results", async () => {
    const recommendations = await new FakeNicheAdvisor().recommend(
      normalizedOffer,
    );
    recommendations[0].reasoning =
      "This niche has attractive operating characteristics and accessible leadership.";
    const advisor: NicheAdvisor = {
      async recommend() {
        return recommendations;
      },
    };
    const { service } = await createCampaignHarness({}, advisor);
    const campaign = await service.create(campaignInput);

    await expect(
      service.recommendNiches(
        campaign.workspaceId,
        campaign.id,
        "user-1",
        campaign.version,
      ),
    ).rejects.toEqual(
      expect.objectContaining({ code: "UNSAFE_NICHE_RECOMMENDATION" }),
    );
  });

  it("rejects stale, wrong-state, and wrong-workspace recommendation requests", async () => {
    const { service } = await createCampaignHarness();
    const first = await service.create(campaignInput);
    const second = await service.create({
      ...campaignInput,
      name: "Second campaign",
    });

    await service.recommendNiches(
      first.workspaceId,
      first.id,
      "user-1",
      first.version,
    );
    await expect(
      service.recommendNiches(
        second.workspaceId,
        second.id,
        "user-1",
        second.version + 1,
      ),
    ).rejects.toEqual(
      expect.objectContaining({ code: "STALE_CAMPAIGN_UPDATE" }),
    );
    const recommended = await service.recommendNiches(
      second.workspaceId,
      second.id,
      "user-1",
      second.version,
    );
    const reviewed = await service.moveToNicheReview(
      second.workspaceId,
      second.id,
      recommended.campaign.version,
    );
    await expect(
      service.recommendNiches(
        reviewed.workspaceId,
        reviewed.id,
        "user-1",
        reviewed.version,
      ),
    ).rejects.toEqual(
      expect.objectContaining({ code: "INVALID_CAMPAIGN_TRANSITION" }),
    );
    await expect(
      service.recommendNiches(
        "workspace-2",
        first.id,
        "user-1",
        first.version,
      ),
    ).rejects.toEqual(
      expect.objectContaining({ code: "CAMPAIGN_NOT_FOUND" }),
    );
  });

  it("approves a recommended subset and audits once", async () => {
    const { service, unitOfWork } = await createCampaignHarness();
    const campaign = await service.create(campaignInput);
    const recommended = await service.recommendNiches(
      campaign.workspaceId,
      campaign.id,
      "user-1",
      campaign.version,
    );
    const reviewed = await service.moveToNicheReview(
      campaign.workspaceId,
      campaign.id,
      recommended.campaign.version,
    );

    const approved = await service.approveNiches(
      reviewed.workspaceId,
      reviewed.id,
      [recommended.recommendations[1].id],
      reviewed.version,
      "user-1",
    );

    expect(approved.approvedNicheIds).toEqual([
      recommended.recommendations[1].id,
    ]);
    expect(approved.version).toBe(reviewed.version + 1);
    const events = await unitOfWork.auditRepository.list(
      campaign.workspaceId,
    );
    expect(events).toHaveLength(2);
    expect(events[1]).toEqual({
      workspaceId: campaign.workspaceId,
      actorId: "user-1",
      action: "niches.approved",
      entityId: campaign.id,
      metadata: {
        approvedIds: [recommended.recommendations[1].id],
        count: 1,
      },
    });
  });

  it("rolls back a failed audit append and retries without duplicates", async () => {
    let failurePending = true;
    const { service, unitOfWork } = await createCampaignHarness({
      beforeAuditAppend() {
        if (failurePending) {
          failurePending = false;
          throw new Error("audit append failed");
        }
      },
    });
    const campaign = await service.create(campaignInput);

    await expect(
      service.recommendNiches(
        campaign.workspaceId,
        campaign.id,
        "user-1",
        campaign.version,
      ),
    ).rejects.toThrow("audit append failed");
    expect(
      await unitOfWork.campaignRepository.getById(
        campaign.workspaceId,
        campaign.id,
      ),
    ).toEqual(campaign);
    expect(
      await unitOfWork.auditRepository.list(campaign.workspaceId),
    ).toEqual([]);

    const retried = await service.recommendNiches(
      campaign.workspaceId,
      campaign.id,
      "user-1",
      campaign.version,
    );

    expect(retried.campaign.version).toBe(campaign.version + 1);
    expect(
      await unitOfWork.auditRepository.list(campaign.workspaceId),
    ).toHaveLength(1);
  });

  it("serializes concurrent audited operations without losing data", async () => {
    let firstAppend = true;
    let releaseFirstAppend!: () => void;
    let signalFirstAppend!: () => void;
    const firstAppendReached = new Promise<void>((resolve) => {
      signalFirstAppend = resolve;
    });
    const firstAppendRelease = new Promise<void>((resolve) => {
      releaseFirstAppend = resolve;
    });
    const { service, unitOfWork } = await createCampaignHarness({
      async beforeAuditAppend() {
        if (firstAppend) {
          firstAppend = false;
          signalFirstAppend();
          await firstAppendRelease;
        }
      },
    });
    const firstCampaign = await service.create(campaignInput);
    const secondCampaign = await service.create({
      ...campaignInput,
      name: "Second campaign",
    });

    const firstRecommendation = service.recommendNiches(
      firstCampaign.workspaceId,
      firstCampaign.id,
      "user-1",
      firstCampaign.version,
    );
    await firstAppendReached;
    const secondRecommendation = service.recommendNiches(
      secondCampaign.workspaceId,
      secondCampaign.id,
      "user-1",
      secondCampaign.version,
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    releaseFirstAppend();
    const [first, second] = await Promise.all([
      firstRecommendation,
      secondRecommendation,
    ]);

    expect(
      await unitOfWork.campaignRepository.getById(
        first.campaign.workspaceId,
        first.campaign.id,
      ),
    ).toEqual(first.campaign);
    expect(
      await unitOfWork.campaignRepository.getById(
        second.campaign.workspaceId,
        second.campaign.id,
      ),
    ).toEqual(second.campaign);
    expect(
      await unitOfWork.auditRepository.list("workspace-1"),
    ).toHaveLength(2);
  });
});
