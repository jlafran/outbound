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

export const campaignInputSchema = z.object({
  workspaceId: nonemptyIdSchema,
  offerId: nonemptyIdSchema,
  createdBy: nonemptyIdSchema,
  name: z.string().min(2),
  targetDailyEmails: z.number().int().min(1).max(200),
  paidDataMode: z.enum(paidDataModeValues),
});

export const campaignRecordSchema = campaignInputSchema.extend({
  id: nonemptyIdSchema,
  state: z.enum(campaignStateValues),
  nicheRecommendationIds: z.array(nonemptyIdSchema),
  approvedNicheIds: z.array(nonemptyIdSchema),
  version: z.number().int().min(1),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type CampaignInput = z.input<typeof campaignInputSchema>;
export type CampaignRecord = z.output<typeof campaignRecordSchema>;

export type CampaignErrorCode =
  | "APPROVED_NICHE_REQUIRED"
  | "CAMPAIGN_NOT_FOUND"
  | "INVALID_CAMPAIGN_TRANSITION"
  | "NICHE_NOT_RECOMMENDED"
  | "NICHE_RECOMMENDATIONS_REQUIRED"
  | "OFFER_REQUIRED"
  | "STALE_CAMPAIGN_UPDATE";

export class CampaignError extends Error {
  constructor(readonly code: CampaignErrorCode) {
    super(code);
    this.name = "CampaignError";
  }
}
