import type { Evidence } from "./research-schema";
import type { ScoreCompanyResult } from "./score-company";

export type ResearchContact = {
  name: string;
  role: string;
  corporateEmail: string;
};

export type ResearchCompany = {
  companyId: string;
  campaignCompanyId: string;
  name: string;
  domain: string;
  contacts: ResearchContact[];
  evidence: Evidence[];
  score: ScoreCompanyResult;
};

export type ResearchCampaignInput = {
  workspaceId: string;
  campaignId: string;
};

export type ResearchCampaignResult = {
  companies: ResearchCompany[];
};

export interface ResearchProvider {
  researchCampaign(
    input: ResearchCampaignInput,
  ): Promise<{ companies: ResearchCompany[] }>;
}
