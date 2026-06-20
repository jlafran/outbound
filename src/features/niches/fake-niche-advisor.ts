import type { NormalizedOffer } from "@/features/offers/offer-schema";

import type { NicheAdvisor } from "./niche-advisor";
import {
  calculateNicheScore,
  nicheRecommendationListSchema,
  type NicheRecommendation,
} from "./niche-schema";

export class FakeNicheAdvisor implements NicheAdvisor {
  async recommend(
    offer: NormalizedOffer,
  ): Promise<NicheRecommendation[]> {
    const problems = offer.problems.join("; ");
    const results = offer.expectedResults.join("; ");
    const ticket =
      offer.ticketBand === "usd_15k_plus"
        ? "USD 15k+"
        : "USD 5k–15k";
    const economicContext = `La oferta aborda "${problems}" para lograr "${results}" con un ticket ${ticket}`;
    const recommendations = [
      {
        id: "logistica-ar",
        name: "Logística",
        capacityToPay: 92,
        problemMagnitude: 94,
        urgency: 91,
        roiClarity: 93,
        decisionMakerAccess: 84,
        estimatedCompanyCount: 1650,
        reasoning: `${economicContext}; en logística argentina, reducir fricción operativa puede traducirse en ahorro de costos y mejor uso de activos, haciendo visible el valor económico para la dirección.`,
      },
      {
        id: "software-b2b-ar",
        name: "Software B2B",
        capacityToPay: 90,
        problemMagnitude: 86,
        urgency: 85,
        roiClarity: 89,
        decisionMakerAccess: 86,
        estimatedCompanyCount: 2100,
        reasoning: `${economicContext}; en software B2B argentino, el impacto sobre ingresos recurrentes y eficiencia comercial permite vincular el resultado esperado con valor económico medible.`,
      },
      {
        id: "salud-privada-ar",
        name: "Salud privada",
        capacityToPay: 86,
        problemMagnitude: 88,
        urgency: 87,
        roiClarity: 80,
        decisionMakerAccess: 73,
        estimatedCompanyCount: 780,
        reasoning: `${economicContext}; en salud privada argentina, mejorar procesos con presión de costos puede proteger capacidad operativa, aunque el acceso a decisores y la atribución del retorno son menos directos.`,
      },
    ]
      .map((recommendation) => ({
        ...recommendation,
        score: calculateNicheScore(recommendation),
      }))
      .sort((left, right) => right.score - left.score);

    return structuredClone(
      nicheRecommendationListSchema.parse(recommendations),
    );
  }
}
