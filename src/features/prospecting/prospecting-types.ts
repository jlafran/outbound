import type { BraveSearchResult } from "@/features/research/brave-search-client";

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
  }>;
  contacts: {
    emails: string[];
    emailCandidates: Array<{
      email: string;
      source: "pattern" | "public" | "hunter" | "reacher";
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
};

export type RejectedProspectingResult = {
  title: string;
  domain: string;
  url: string;
  kind: string;
  reason: string;
};
