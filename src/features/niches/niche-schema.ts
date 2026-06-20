import { z } from "zod";

const scoreSchema = z.number().min(0).max(100);

export const nicheRecommendationSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  score: scoreSchema,
  capacityToPay: scoreSchema,
  problemMagnitude: scoreSchema,
  urgency: scoreSchema,
  roiClarity: scoreSchema,
  decisionMakerAccess: scoreSchema,
  estimatedCompanyCount: z.number().int().nonnegative(),
  reasoning: z.string().min(21),
}).strict();

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
