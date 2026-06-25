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
    confidence: "low" | "medium" | "high";
  }>;
  contacts: {
    emails: string[];
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
