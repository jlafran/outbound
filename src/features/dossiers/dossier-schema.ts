import { z } from "zod";

export const dossierItemKindValues = [
  "confirmed_by_prospect",
  "researched_fact",
  "hypothesis",
  "estimate",
  "recommendation",
] as const;

export const dossierConfidenceValues = ["low", "medium", "high"] as const;

const nonemptyIdSchema = z.string().trim().min(1);
const trimmedTextSchema = z.string().trim();
const nonemptyTextSchema = trimmedTextSchema.min(1);
const statementSchema = trimmedTextSchema.min(2);
const uniqueTrimmedStringsSchema = z
  .array(z.string().trim().min(1))
  .refine((values) => new Set(values).size === values.length, {
    message: "Values must be unique",
  });

const dossierItemBaseSchema = z.object({
  id: nonemptyIdSchema,
  statement: statementSchema,
  sourceUrl: z.url({ protocol: /^https?$/ }).optional(),
  confidence: z.enum(dossierConfidenceValues),
  assumptions: uniqueTrimmedStringsSchema,
  hidden: z.boolean().default(false),
}).strict();

const confirmedNeedItemSchema = dossierItemBaseSchema.extend({
  kind: z.literal("confirmed_by_prospect"),
});
const researchedFactItemSchema = dossierItemBaseSchema.extend({
  kind: z.literal("researched_fact"),
  sourceUrl: z.url({ protocol: /^https?$/ }),
});
const hypothesisItemSchema = dossierItemBaseSchema.extend({
  kind: z.literal("hypothesis"),
  assumptions: uniqueTrimmedStringsSchema.min(1),
});
const estimateItemSchema = dossierItemBaseSchema.extend({
  kind: z.literal("estimate"),
  assumptions: uniqueTrimmedStringsSchema.min(1),
});
const recommendationItemSchema = dossierItemBaseSchema.extend({
  kind: z.literal("recommendation"),
});

export const dossierItemSchema = z.discriminatedUnion("kind", [
  confirmedNeedItemSchema,
  researchedFactItemSchema,
  hypothesisItemSchema,
  estimateItemSchema,
  recommendationItemSchema,
]);

const contactSchema = z.object({
  name: nonemptyTextSchema,
  role: nonemptyTextSchema,
  corporateEmail: z.email().optional(),
}).strict();

const competitorItemSchema = z.union([
  researchedFactItemSchema,
  hypothesisItemSchema,
]);

export const dossierSchema = z.object({
  id: nonemptyIdSchema,
  workspaceId: nonemptyIdSchema,
  campaignCompanyId: nonemptyIdSchema,
  meetingId: nonemptyIdSchema.nullable(),
  version: z.number().int().positive(),
  previousVersionId: nonemptyIdSchema.nullable(),
  executiveSummary: trimmedTextSchema,
  companyOverview: trimmedTextSchema,
  businessModel: trimmedTextSchema,
  contacts: z.array(contactSchema),
  conversationSummary: trimmedTextSchema,
  confirmedNeeds: z.array(confirmedNeedItemSchema),
  researchedFacts: z.array(researchedFactItemSchema),
  hypotheses: z.array(hypothesisItemSchema),
  estimates: z.array(estimateItemSchema),
  competitors: z.array(competitorItemSchema),
  recommendations: z.array(recommendationItemSchema),
  pendingQuestions: uniqueTrimmedStringsSchema,
  createdAt: z.date(),
  createdBy: nonemptyIdSchema,
}).strict();

export type DossierItem = z.output<typeof dossierItemSchema>;
export type Dossier = z.output<typeof dossierSchema>;
