import type { BraveSearchResult } from "@/features/research/brave-search-client";
import { z } from "zod";

export const crawlPageStatusSchema = z.enum([
  "fetched",
  "blocked",
  "timeout",
  "non_html",
  "too_large",
  "javascript_required",
  "robots_disallowed",
]);

const confidenceSchema = z.enum(["low", "medium", "high"]);

export const websiteResearchSchema = z.object({
  status: z.enum(["completed", "partial", "failed"]),
  pages: z.array(
    z.object({
      requestedUrl: z.string().url(),
      finalUrl: z.string().url().optional(),
      status: crawlPageStatusSchema,
      title: z.string().optional(),
    }),
  ),
  contacts: z.object({
    emails: z.array(z.string()),
    phones: z.array(z.string()),
    whatsapps: z.array(z.string()),
    linkedinUrls: z.array(z.string().url()),
    instagramUrls: z.array(z.string().url()),
  }),
  people: z.array(
    z.object({
      name: z.string(),
      role: z.string(),
      email: z.string().optional(),
      sourceUrl: z.string().url(),
    }),
  ),
  companyName: z.string().optional(),
  description: z.string().optional(),
  location: z.string().optional(),
  services: z.array(z.string()),
  branchCount: z.number().int().nonnegative().optional(),
  signals: z.array(
    z.object({
      kind: z.string(),
      statement: z.string(),
      sourceUrl: z.string().url(),
      confidence: confidenceSchema,
    }),
  ),
  errors: z.array(
    z.object({
      url: z.string(),
      code: z.string(),
    }),
  ),
});

export const scoreBreakdownSchema = z.object({
  total: z.number().min(0).max(100),
  components: z.object({
    companyValidation: z.number(),
    offerFit: z.number(),
    decisionMaker: z.number(),
    directChannel: z.number(),
    verifiedEmail: z.number(),
    opportunitySignal: z.number(),
    sourceQuality: z.number(),
  }),
  penalties: z.array(
    z.object({ label: z.string(), value: z.number().nonpositive() }),
  ),
  reasons: z.array(z.string()),
});

export const recommendedContactSchema = z.object({
  name: z.string().optional(),
  role: z.string().optional(),
  channel: z.enum(["email", "whatsapp", "generic_email"]),
  value: z.string(),
  confidence: confidenceSchema,
  sourceUrl: z.string().url().optional(),
});

export const messageDraftSchema = z.object({
  subject: z.string(),
  body: z.string(),
  cta: z.string(),
  evidenceUrls: z.array(z.string().url()).min(1),
  confidence: confidenceSchema,
  warnings: z.array(z.string()),
});

export const prospectingEnrichmentSchema = z.object({
  websiteResearch: websiteResearchSchema,
  scoreBreakdown: scoreBreakdownSchema,
  recommendedContact: recommendedContactSchema.nullable(),
  messageDraft: messageDraftSchema.nullable(),
});

export type WebsiteResearch = z.infer<typeof websiteResearchSchema>;
export type ProspectingScoreBreakdown = z.infer<typeof scoreBreakdownSchema>;
export type RecommendedProspectingContact = z.infer<
  typeof recommendedContactSchema
>;
export type PersonalizedMessageDraft = z.infer<typeof messageDraftSchema>;

export type ProspectingSearchClient = {
  searchWeb(input: {
    query: string;
    count: number;
    country?: string;
    searchLang?: string;
    includeKnownPlatforms?: boolean;
  }): Promise<BraveSearchResult[]>;
};

export type ProspectingLeadStatus = "actionable" | "review" | "discarded";

export type ProspectingLead = {
  companyName: string;
  domain: string;
  websiteUrl: string;
  status: ProspectingLeadStatus;
  score: number;
  decisionMakers: Array<{
    name: string;
    role: string;
    sourceUrl: string;
    linkedinUrl?: string;
    confidence: "low" | "medium" | "high";
    companyEvidence?: string;
    associationReason?: string;
  }>;
  contacts: {
    emails: string[];
    emailCandidates: Array<{
      email: string;
      source:
        | "official_website"
        | "pattern"
        | "public"
        | "hunter"
        | "reacher";
      verificationStatus:
        | "unverified"
        | "valid"
        | "risky"
        | "invalid"
        | "pending"
        | "unknown";
      verificationProvider?: "no2bounce" | "reacher";
      verificationTrackingId?: string;
      confidence?: number;
    }>;
    phones: string[];
    whatsapps: string[];
  };
  opportunitySignals: string[];
  evidence: Array<{
    label: string;
    url: string;
    description: string;
  }>;
  websiteResearch?: WebsiteResearch;
  scoreBreakdown?: ProspectingScoreBreakdown;
  recommendedContact?: RecommendedProspectingContact | null;
  messageDraft?: PersonalizedMessageDraft | null;
};

export type RejectedProspectingResult = {
  title: string;
  domain: string;
  url: string;
  kind: string;
  reason: string;
};
