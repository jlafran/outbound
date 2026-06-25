import { describe, expect, it, vi } from "vitest";

import {
  createMemoryCampaignRepository,
  type CampaignRepository,
} from "@/features/campaigns/campaign-repository";
import type { CampaignRecord } from "@/features/campaigns/campaign-schema";
import { createMemoryCompanyRepository } from "@/features/companies/company-repository";
import {
  BraveResearchProvider,
  type BraveResearchSearchClient,
} from "@/features/research/brave-research-provider";
import { createMemoryOfferRepository } from "@/features/offers/offer-repository";
import type { OfferRecord } from "@/features/offers/offer-repository";
import { createMemoryResearchRepository } from "@/features/research/research-repository";

const now = new Date("2026-06-24T00:00:00.000Z");

function createOffer(): OfferRecord {
  return {
    id: "offer-1",
    workspaceId: "workspace-1",
    createdBy: "user-1",
    name: "Sistema de outreach B2B",
    rawText:
      "Sistema para investigar prospectos, detectar oportunidades y generar mensajes personalizados para reuniones B2B.",
    problems: [
      "Prospección manual lenta",
      "Mensajes genéricos con baja respuesta",
    ],
    expectedResults: [
      "Más reuniones calificadas",
      "Menos tiempo de research manual",
    ],
    ticketBand: "usd_15k_plus",
    allowedPilot: "Diagnóstico inicial gratuito",
    prohibitedClaims: ["No prometer ventas garantizadas"],
    version: 1,
    createdAt: now,
  };
}

function createCampaign(): CampaignRecord {
  return {
    id: "campaign-1",
    workspaceId: "workspace-1",
    offerId: "offer-1",
    createdBy: "user-1",
    name: "Outreach B2B high-ticket LATAM",
    targetDailyEmails: 50,
    paidDataMode: "free",
    targetTicketBand: "usd_15k_plus",
    state: "discovery_ready",
    nicheRecommendationIds: [
      "logistica-ar",
      "software-b2b-ar",
      "salud-privada-ar",
    ],
    approvedNicheIds: ["logistica-ar", "software-b2b-ar"],
    version: 5,
    createdAt: now,
    updatedAt: now,
  };
}

async function createProvider(input?: {
  searchClient?: BraveResearchSearchClient;
  researchRepository?: ReturnType<typeof createMemoryResearchRepository>;
}) {
  const campaignRepository: CampaignRepository =
    createMemoryCampaignRepository();
  await campaignRepository.create(createCampaign());
  const offerRepository = createMemoryOfferRepository();
  await offerRepository.create(createOffer());
  const searchClient =
    input?.searchClient ??
    ({
      searchWeb: vi.fn().mockResolvedValue([]),
    } satisfies BraveResearchSearchClient);

  return {
    campaignRepository,
    offerRepository,
    searchClient,
    researchRepository:
      input?.researchRepository ?? createMemoryResearchRepository(),
    provider: new BraveResearchProvider({
      searchClient,
      campaignRepository,
      offerRepository,
      companyRepository: createMemoryCompanyRepository(),
      researchRepository:
        input?.researchRepository ?? createMemoryResearchRepository(),
      now: () => now,
      maxCompanies: 3,
    }),
  };
}

describe("BraveResearchProvider", () => {
  it("builds Brave queries from the approved niches and offer context", async () => {
    const searchClient: BraveResearchSearchClient = {
      searchWeb: vi.fn().mockResolvedValue([]),
    };
    const { provider } = await createProvider({ searchClient });

    await provider.researchCampaign({
      workspaceId: "workspace-1",
      campaignId: "campaign-1",
      offerId: "offer-1",
    });

    expect(searchClient.searchWeb).toHaveBeenCalledWith({
      query: "empresas logistica argentina B2B USD 15k+",
      count: 10,
      country: "AR",
      searchLang: "es",
    });
    expect(searchClient.searchWeb).toHaveBeenCalledWith({
      query: '"logistica" "Argentina" "contacto" "empresa"',
      count: 10,
      country: "AR",
      searchLang: "es",
    });
    expect(searchClient.searchWeb).toHaveBeenCalledWith({
      query: "empresas software b2b argentina B2B USD 15k+",
      count: 10,
      country: "AR",
      searchLang: "es",
    });
  });

  it("returns deduped scored companies with sourced evidence and generic contacts", async () => {
    const researchRepository = createMemoryResearchRepository();
    const searchClient: BraveResearchSearchClient = {
      searchWeb: vi
        .fn()
        .mockResolvedValue([])
        .mockResolvedValueOnce([
          {
            title: "ACME Logística",
            url: "https://acme.com.ar/servicios",
            description: "Operador logístico argentino con soluciones B2B.",
            domain: "acme.com.ar",
          },
          {
            title: "ACME duplicado",
            url: "https://www.acme.com.ar/contacto",
            description: "Duplicado.",
            domain: "acme.com.ar",
          },
        ])
        .mockResolvedValueOnce([
          {
            title: "Nexo B2B",
            url: "https://nexob2b.com/",
            description: "Software B2B para ventas.",
            domain: "nexob2b.com",
          },
        ]),
    };
    const { provider } = await createProvider({
      searchClient,
      researchRepository,
    });

    const result = await provider.researchCampaign({
      workspaceId: "workspace-1",
      campaignId: "campaign-1",
      offerId: "offer-1",
    });

    expect(result.companies.map(({ name, domain }) => ({ name, domain }))).toEqual([
      { name: "ACME Logística", domain: "acme.com.ar" },
      { name: "Nexo B2B", domain: "nexob2b.com" },
    ]);
    expect(result.companies[0]?.contacts).toEqual([
      {
        name: "Contacto comercial",
        role: "Área comercial",
        corporateEmail: "contacto@acme.com.ar",
      },
    ]);
    expect(result.companies[0]?.evidence[0]).toMatchObject({
      kind: "researched_fact",
      sourceUrl: "https://acme.com.ar/servicios",
      confidence: "medium",
    });
    expect(result.companies[0]?.score.total).toBeGreaterThan(70);
    await expect(
      researchRepository.listCampaignCompaniesMaterial({
        workspaceId: "workspace-1",
        campaignId: "campaign-1",
      }),
    ).resolves.toHaveLength(2);
  });

  it("filters content and article results before saving companies", async () => {
    const searchClient: BraveResearchSearchClient = {
      searchWeb: vi
        .fn()
        .mockResolvedValue([])
        .mockResolvedValueOnce([
          {
            title:
              "B2B: Los principales dolores en logística y cómo solucionarlos",
            url: "https://beetrack.com/blog/dolores-logistica-b2b",
            description: "Artículo SEO sobre logística.",
            domain: "beetrack.com",
          },
          {
            title:
              "Logística y servicio: el verdadero diferencial en empresas B2B",
            url: "https://infobae.com/economia/logistica-servicio",
            description: "Nota de medio.",
            domain: "infobae.com",
          },
          {
            title: "Esa Logística",
            url: "https://esalogistica.com.ar/contacto",
            description: "Logística y distribución para empresas.",
            domain: "esalogistica.com.ar",
          },
        ]),
    };
    const { provider } = await createProvider({ searchClient });

    const result = await provider.researchCampaign({
      workspaceId: "workspace-1",
      campaignId: "campaign-1",
      offerId: "offer-1",
    });

    expect(result.companies.map(({ domain }) => domain)).toEqual([
      "esalogistica.com.ar",
    ]);
  });
});
