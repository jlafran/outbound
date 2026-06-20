import type {
  NormalizedOffer,
  OfferInput,
} from "@/features/offers/offer-schema";

export const validOfferInput: OfferInput = {
  name: "Revenue Operations Sprint",
  rawText:
    "We diagnose revenue leaks and install a focused operating system.",
  problems: ["Pipeline stalls"],
  expectedResults: ["Faster qualified pipeline"],
  ticketBand: "usd_15k_plus",
  allowedPilot: "Two-week diagnostic sprint",
};

export const normalizedOffer: NormalizedOffer = {
  ...validOfferInput,
  prohibitedClaims: [],
  version: 1,
};
