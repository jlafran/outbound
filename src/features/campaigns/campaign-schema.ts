import { z } from "zod";

export const campaignStateValues = [
  "draft",
  "niche_review",
  "discovery_ready",
  "researching",
  "message_review",
  "active",
  "paused",
  "completed",
] as const;

export const paidDataModeValues = ["free", "paid", "fallback"] as const;

const nonemptyIdSchema = z.string().trim().min(1);
const uniqueIdListSchema = z
  .array(nonemptyIdSchema)
  .transform((ids) => [...new Set(ids)]);

export const campaignInputSchema = z.object({
  workspaceId: nonemptyIdSchema,
  offerId: nonemptyIdSchema,
  createdBy: nonemptyIdSchema,
  name: z.string().trim().min(2),
  targetDailyEmails: z.number().int().min(1).max(200),
  paidDataMode: z.enum(paidDataModeValues),
});

export const campaignRecordSchema = campaignInputSchema
  .extend({
    id: nonemptyIdSchema,
    state: z.enum(campaignStateValues),
    nicheRecommendationIds: uniqueIdListSchema,
    approvedNicheIds: uniqueIdListSchema,
    version: z.number().int().min(1),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .superRefine((record, context) => {
    const recommendedIds = new Set(record.nicheRecommendationIds);

    if (
      record.approvedNicheIds.some((id) => !recommendedIds.has(id))
    ) {
      context.addIssue({
        code: "custom",
        path: ["approvedNicheIds"],
        message: "Approved niches must be recommended",
      });
    }

    if (
      (record.state === "niche_review" ||
        record.state === "discovery_ready") &&
      record.nicheRecommendationIds.length === 0
    ) {
      context.addIssue({
        code: "custom",
        path: ["nicheRecommendationIds"],
        message: "Review states require niche recommendations",
      });
    }

    if (
      record.state === "discovery_ready" &&
      record.approvedNicheIds.length === 0
    ) {
      context.addIssue({
        code: "custom",
        path: ["approvedNicheIds"],
        message: "Discovery ready requires an approved niche",
      });
    }
  });

export type CampaignInput = z.input<typeof campaignInputSchema>;
export type CampaignRecord = z.output<typeof campaignRecordSchema>;

export type CampaignErrorCode =
  | "APPROVED_NICHE_REQUIRED"
  | "CAMPAIGN_NOT_FOUND"
  | "INVALID_CAMPAIGN_INPUT"
  | "INVALID_CAMPAIGN_TRANSITION"
  | "NICHE_NOT_RECOMMENDED"
  | "NICHE_RECOMMENDATIONS_REQUIRED"
  | "OFFER_REQUIRED"
  | "STALE_CAMPAIGN_UPDATE";

export class CampaignError extends Error {
  constructor(
    readonly code: CampaignErrorCode,
    options?: ErrorOptions,
  ) {
    super(code, options);
    this.name = "CampaignError";
  }
}
