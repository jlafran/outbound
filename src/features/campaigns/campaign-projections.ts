import type { NicheRecommendation } from "@/features/niches/niche-schema";
import type { ResearchCompany } from "@/features/research/research-provider";

export interface NicheRecommendationProjection {
  get(
    workspaceId: string,
    campaignId: string,
  ): Promise<NicheRecommendation[]>;
  save(
    workspaceId: string,
    campaignId: string,
    recommendations: NicheRecommendation[],
  ): Promise<void>;
}

export type GeneratedCampaignData = {
  campaignId: string;
  companies: ResearchCompany[];
  dossierId: string;
};

export interface CampaignDryRunProjection {
  get(
    workspaceId: string,
    campaignId: string,
  ): Promise<GeneratedCampaignData | null>;
  getOrCreate(
    workspaceId: string,
    campaignId: string,
    create: () => Promise<GeneratedCampaignData>,
  ): Promise<GeneratedCampaignData>;
  getCompany(
    workspaceId: string,
    campaignCompanyId: string,
  ): Promise<ResearchCompany | null>;
  stageCompanies(
    workspaceId: string,
    companies: ResearchCompany[],
  ): Promise<void>;
}

function projectionKey(workspaceId: string, campaignId: string) {
  return `${workspaceId}\0${campaignId}`;
}

export function createMemoryNicheRecommendationProjection(): NicheRecommendationProjection {
  const records = new Map<string, NicheRecommendation[]>();

  return {
    async get(workspaceId, campaignId) {
      return structuredClone(
        records.get(projectionKey(workspaceId, campaignId)) ?? [],
      );
    },
    async save(workspaceId, campaignId, recommendations) {
      records.set(
        projectionKey(workspaceId, campaignId),
        structuredClone(recommendations),
      );
    },
  };
}

export function createMemoryCampaignDryRunProjection(): CampaignDryRunProjection {
  const runs = new Map<string, GeneratedCampaignData>();
  const companies = new Map<string, ResearchCompany>();
  let queue = Promise.resolve();

  function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = queue.then(operation, operation);
    queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  return {
    async get(workspaceId, campaignId) {
      await queue;
      const run = runs.get(projectionKey(workspaceId, campaignId));
      return run ? structuredClone(run) : null;
    },
    getOrCreate(workspaceId, campaignId, create) {
      return enqueue(async () => {
        const key = projectionKey(workspaceId, campaignId);
        const existing = runs.get(key);
        if (existing) {
          return structuredClone(existing);
        }

        const generated = await create();
        runs.set(key, structuredClone(generated));
        return structuredClone(generated);
      });
    },
    async getCompany(workspaceId, campaignCompanyId) {
      const company = companies.get(
        projectionKey(workspaceId, campaignCompanyId),
      );
      return company ? structuredClone(company) : null;
    },
    async stageCompanies(workspaceId, generatedCompanies) {
      for (const company of generatedCompanies) {
        companies.set(
          projectionKey(workspaceId, company.campaignCompanyId),
          structuredClone(company),
        );
      }
    },
  };
}
