import { z } from "zod";

const offerTextListSchema = z.array(z.string().min(2)).min(1);

export const offerTicketBandValues = [
  "usd_5k_15k",
  "usd_15k_plus",
] as const;

export const offerTicketBandSchema = z.enum(offerTicketBandValues);

export const offerInputSchema = z.object({
  name: z.string().min(2),
  rawText: z.string().min(20),
  problems: offerTextListSchema,
  expectedResults: offerTextListSchema,
  ticketBand: offerTicketBandSchema,
  allowedPilot: z.string().min(2),
  prohibitedClaims: z.array(z.string()).default([]),
});

export const normalizedOfferSchema = offerInputSchema.extend({
  version: z.literal(1),
});

export type OfferInput = z.input<typeof offerInputSchema>;
export type NormalizedOffer = z.output<typeof normalizedOfferSchema>;
export type OfferTicketBand = z.output<typeof offerTicketBandSchema>;
