import type { NormalizedOffer } from "@/features/offers/offer-schema";

import type { NicheRecommendation } from "./niche-schema";

export interface NicheAdvisor {
  recommend(offer: NormalizedOffer): Promise<NicheRecommendation[]>;
}
