import { z } from "zod";

export const evidenceKindValues = [
  "confirmed_by_prospect",
  "researched_fact",
  "hypothesis",
  "estimate",
] as const;

export const confidenceValues = ["low", "medium", "high"] as const;

export type EvidenceKind = (typeof evidenceKindValues)[number];
export type Confidence = (typeof confidenceValues)[number];

const httpSourceUrlSchema = z
  .string()
  .url()
  .refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  }, "Source URL must use HTTP or HTTPS");

const assumptionsSchema = z
  .array(z.string().trim().min(1))
  .superRefine((assumptions, context) => {
    if (new Set(assumptions).size !== assumptions.length) {
      context.addIssue({
        code: "custom",
        message: "Assumptions must be unique",
      });
    }
  });

export const evidenceSchema = z
  .object({
    kind: z.enum(evidenceKindValues),
    statement: z.string().trim().min(2),
    sourceUrl: httpSourceUrlSchema.optional(),
    observedAt: z.date(),
    confidence: z.enum(confidenceValues),
    assumptions: assumptionsSchema,
  })
  .superRefine((evidence, context) => {
    if (evidence.kind === "researched_fact" && !evidence.sourceUrl) {
      context.addIssue({
        code: "custom",
        path: ["sourceUrl"],
        message: "Researched facts require a source URL",
      });
    }

    if (
      (evidence.kind === "hypothesis" || evidence.kind === "estimate") &&
      evidence.assumptions.length === 0
    ) {
      context.addIssue({
        code: "custom",
        path: ["assumptions"],
        message: `${evidence.kind} evidence requires an assumption`,
      });
    }
  });

export type Evidence = z.output<typeof evidenceSchema>;
