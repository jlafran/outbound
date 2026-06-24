import { createHash } from "node:crypto";

import type { CampaignRepository } from "@/features/campaigns/campaign-repository";
import type { CompanyRepository } from "@/features/companies/company-repository";
import type { OfferRepository } from "@/features/offers/offer-repository";

import type {
  ResearchCampaignInput,
  ResearchCampaignResult,
  ResearchCompany,
  ResearchProvider,
} from "./research-provider";
import type { ResearchRepository } from "./research-repository";
import { scoreCompany } from "./score-company";
import type { BraveSearchResult } from "./brave-search-client";

export type BraveResearchSearchClient = {
  searchWeb(input: {
    query: string;
    count: number;
    country?: string;
    searchLang?: string;
  }): Promise<BraveSearchResult[]>;
};

type BraveResearchProviderOptions = {
  searchClient: BraveResearchSearchClient;
  campaignRepository: CampaignRepository;
  offerRepository: OfferRepository;
  companyRepository: CompanyRepository;
  researchRepository?: ResearchRepository;
  now?: () => Date;
  maxCompanies?: number;
};

const nicheNames: Record<string, string> = {
  "logistica-ar": "logistica",
  "software-b2b-ar": "software b2b",
  "salud-privada-ar": "salud privada",
};

function createCampaignCompanyId(
  workspaceId: string,
  campaignId: string,
  domain: string,
): string {
  const digest = createHash("sha256")
    .update(`${workspaceId}\0${campaignId}\0${domain}`)
    .digest("hex")
    .slice(0, 32);

  return `brave:${digest}`;
}

function firstProblem(value: string | undefined): string {
  return (value ?? "problemas comerciales").toLowerCase();
}

function cleanTitle(value: string): string {
  return value
    .replace(/\s[|·-]\s.*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

export class BraveResearchProvider implements ResearchProvider {
  private readonly now: () => Date;
  private readonly maxCompanies: number;

  constructor(private readonly options: BraveResearchProviderOptions) {
    this.now = options.now ?? (() => new Date());
    this.maxCompanies = options.maxCompanies ?? 10;
  }

  async researchCampaign(
    input: ResearchCampaignInput,
  ): Promise<ResearchCampaignResult> {
    const campaign = await this.options.campaignRepository.getById(
      input.workspaceId,
      input.campaignId,
    );
    if (!campaign) {
      return { companies: [] };
    }
    const offer = await this.options.offerRepository.getById(
      input.workspaceId,
      input.offerId ?? campaign.offerId,
    );
    if (!offer) {
      return { companies: [] };
    }

    const seen = new Set<string>();
    const companies: ResearchCompany[] = [];
    const approvedNiches =
      campaign.approvedNicheIds.length > 0
        ? campaign.approvedNicheIds
        : campaign.nicheRecommendationIds;

    for (const nicheId of approvedNiches) {
      if (companies.length >= this.maxCompanies) break;
      const niche = nicheNames[nicheId] ?? nicheId.replaceAll("-", " ");
      const query = `empresas ${niche} argentina B2B ${
        campaign.targetTicketBand === "usd_15k_plus"
          ? "USD 15k+"
          : "USD 5k-15k"
      } ${firstProblem(offer.problems[0])}`;
      const results = await this.options.searchClient.searchWeb({
        query,
        count: 10,
        country: "AR",
        searchLang: "es",
      });

      for (const result of results) {
        if (companies.length >= this.maxCompanies) break;
        if (seen.has(result.domain)) continue;
        seen.add(result.domain);

        const company = await this.options.companyRepository.upsertByDomain({
          workspaceId: input.workspaceId,
          domain: result.domain,
          name: cleanTitle(result.title) || result.domain,
        });
        const description = result.description || result.title;

        companies.push({
          companyId: company.id,
          campaignCompanyId: createCampaignCompanyId(
            input.workspaceId,
            input.campaignId,
            company.normalizedDomain,
          ),
          name: company.name,
          domain: company.normalizedDomain,
          contacts: [
            {
              name: "Contacto comercial",
              role: "Área comercial",
              corporateEmail: `contacto@${company.normalizedDomain}`,
            },
          ],
          evidence: [
            {
              kind: "researched_fact",
              statement: description,
              sourceUrl: result.url,
              observedAt: this.now(),
              confidence: "medium",
              assumptions: [],
            },
            {
              kind: "hypothesis",
              statement: `La empresa podría beneficiarse de ${offer.name} si hoy resuelve ${firstProblem(
                offer.problems[0],
              )} de forma manual.`,
              observedAt: this.now(),
              confidence: "low",
              assumptions: [
                "La hipótesis se basa en el resultado de búsqueda y debe validarse antes de contactar.",
              ],
            },
            {
              kind: "estimate",
              statement:
                "La oportunidad requiere validación humana antes de enviar outreach.",
              observedAt: this.now(),
              confidence: "low",
              assumptions: [
                "No se enriquecieron contactos pagos ni se verificó email en este v0.",
              ],
            },
          ],
          score: scoreCompany({
            capacityToPay:
              campaign.targetTicketBand === "usd_15k_plus" ? 82 : 70,
            problemMagnitude: 78,
            urgency: 70,
            solutionFit: 76,
            decisionMakerAccess: 55,
            evidenceConfidence: 62,
          }),
        });
      }
    }

    await this.options.researchRepository?.persistCampaignResearch({
      workspaceId: input.workspaceId,
      campaignId: input.campaignId,
      offerId: input.offerId ?? campaign.offerId,
      companies,
    });

    return { companies: structuredClone(companies) };
  }
}
