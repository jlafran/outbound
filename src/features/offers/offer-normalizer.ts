import {
  offerInputSchema,
  type NormalizedOffer,
  type OfferInput,
} from "./offer-schema";

export function normalizeOffer(input: OfferInput): NormalizedOffer {
  return {
    ...offerInputSchema.parse(input),
    version: 1,
  };
}
