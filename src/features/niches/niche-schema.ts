import { z } from "zod";

const scoreSchema = z.number().min(0).max(100);
const nicheIdSchema = z
  .string()
  .trim()
  .min(1)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Niche ID must be a lowercase kebab-case identifier",
  );

export type NicheScoreDimensions = {
  capacityToPay: number;
  problemMagnitude: number;
  urgency: number;
  roiClarity: number;
  decisionMakerAccess: number;
};

/**
 * Calculates the niche score using capacity to pay 30%, problem
 * magnitude 25%, urgency 15%, ROI clarity 20%, and decision-maker
 * access 10%, then rounds the result to two decimals.
 */
export function calculateNicheScore(
  dimensions: NicheScoreDimensions,
): number {
  const score =
    dimensions.capacityToPay * 0.3 +
    dimensions.problemMagnitude * 0.25 +
    dimensions.urgency * 0.15 +
    dimensions.roiClarity * 0.2 +
    dimensions.decisionMakerAccess * 0.1;

  return Math.round((score + Number.EPSILON) * 100) / 100;
}

export const nicheRecommendationSchema = z
  .object({
    id: nicheIdSchema,
    name: z.string().trim().min(1),
    score: scoreSchema,
    capacityToPay: scoreSchema,
    problemMagnitude: scoreSchema,
    urgency: scoreSchema,
    roiClarity: scoreSchema,
    decisionMakerAccess: scoreSchema,
    estimatedCompanyCount: z.number().int().nonnegative(),
    reasoning: z.string().min(21),
  })
  .strict()
  .superRefine((recommendation, context) => {
    const calculatedScore = calculateNicheScore(recommendation);

    if (recommendation.score !== calculatedScore) {
      context.addIssue({
        code: "custom",
        path: ["score"],
        message: "Score must match the weighted niche dimensions",
      });
    }
  });

export const nicheRecommendationListSchema = z.array(
  nicheRecommendationSchema,
);

export const rankedNicheRecommendationListSchema =
  nicheRecommendationListSchema
    .min(3)
    .max(5)
    .superRefine((recommendations, context) => {
      const ids = new Set<string>();

      recommendations.forEach((recommendation, index) => {
        if (ids.has(recommendation.id)) {
          context.addIssue({
            code: "custom",
            path: [index, "id"],
            message: "Recommendation IDs must be unique",
          });
        }
        ids.add(recommendation.id);

        if (
          index > 0 &&
          recommendations[index - 1].score <= recommendation.score
        ) {
          context.addIssue({
            code: "custom",
            path: [index, "score"],
            message: "Recommendations must be strictly ranked",
          });
        }
      });
    });

export type NicheRecommendation = z.output<
  typeof nicheRecommendationSchema
>;
