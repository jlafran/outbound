import {
  createDrizzleAuditRepository,
  type AuditRepository,
} from "@/features/audit/audit-repository";
import {
  CampaignDryRunService,
} from "@/features/campaigns/campaign-dry-run-service";
import {
  createMemoryCampaignDryRunProjection,
  createMemoryNicheRecommendationProjection,
  createResearchCampaignDryRunProjection,
  type CampaignDryRunProjection,
  type NicheRecommendationProjection,
} from "@/features/campaigns/campaign-projections";
import {
  createDrizzleCampaignPersistenceExecutor,
  createDrizzleCampaignRepository,
  type CampaignRepository,
} from "@/features/campaigns/campaign-repository";
import { CampaignService } from "@/features/campaigns/campaign-service";
import {
  createDrizzleCampaignUnitOfWork,
  createMemoryCampaignUnitOfWork,
} from "@/features/campaigns/campaign-unit-of-work";
import {
  createDrizzleCompanyPersistenceExecutor,
  createDrizzleCompanyRepository,
  createMemoryCompanyRepository,
  type CompanyRepository,
} from "@/features/companies/company-repository";
import {
  createDrizzleDossierPersistenceExecutor,
  createDrizzleDossierRepository,
  type DossierRepository,
} from "@/features/dossiers/dossier-repository";
import {
  DossierService,
  type DossierSourceMaterial,
  type DossierSourceReader,
} from "@/features/dossiers/dossier-service";
import { dossierEvidenceItemSchema } from "@/features/dossiers/dossier-schema";
import {
  createDrizzleDossierUnitOfWork,
  createMemoryDossierUnitOfWork,
} from "@/features/dossiers/dossier-unit-of-work";
import { FakeNicheAdvisor } from "@/features/niches/fake-niche-advisor";
import type { NicheAdvisor } from "@/features/niches/niche-advisor";
import { rankedNicheRecommendationListSchema } from "@/features/niches/niche-schema";
import {
  createDrizzleOfferRepository,
  type OfferRepository,
} from "@/features/offers/offer-repository";
import { normalizedOfferSchema } from "@/features/offers/offer-schema";
import { OfferService } from "@/features/offers/offer-service";
import {
  createDrizzleOfferUnitOfWork,
  createMemoryOfferUnitOfWork,
} from "@/features/offers/offer-unit-of-work";
import { FakeResearchProvider } from "@/features/research/fake-research-provider";
import type {
  ResearchCompany,
  ResearchProvider,
} from "@/features/research/research-provider";
import {
  createDrizzleResearchRepository,
  type ResearchRepository,
} from "@/features/research/research-repository";

export interface AppServices {
  offerService: OfferService;
  offerRepository: OfferRepository;
  campaignService: CampaignService;
  campaignRepository: CampaignRepository;
  nicheRecommendationProjection: NicheRecommendationProjection;
  campaignDryRunService: CampaignDryRunService;
  campaignDryRunProjection: CampaignDryRunProjection;
  companyRepository: CompanyRepository;
  dossierService: DossierService;
  dossierRepository: DossierRepository;
  auditRepository: AuditRepository;
}

function toDossierSource(company: ResearchCompany): DossierSourceMaterial {
  return {
    executiveSummary: `${company.name} lidera el ranking dry-run con un score de ${company.score.total}.`,
    companyOverview: company.evidence
      .filter(({ kind }) => kind === "researched_fact")
      .map(({ statement }) => statement)
      .join(" "),
    businessModel:
      "Empresa ficticia argentina incluida para validar el flujo de discovery sin comprar datos.",
    contacts: company.contacts,
    conversationSummary: "",
    evidence: company.evidence.map(
      ({ kind, statement, sourceUrl, confidence, assumptions }, index) =>
        dossierEvidenceItemSchema.parse({
          id: `${company.campaignCompanyId}-evidence-${index + 1}`,
          kind,
          statement,
          sourceUrl,
          confidence,
          assumptions,
          hidden: false,
        }),
    ),
    competitors: [],
    recommendations: [
      {
        id: `${company.campaignCompanyId}-recommendation-1`,
        kind: "recommendation" as const,
        statement: company.score.explanation,
        confidence: "medium" as const,
        assumptions: [],
        hidden: false,
      },
    ],
    pendingQuestions: [
      "¿Qué parte del proceso genera más trabajo manual hoy?",
      "¿Quién validaría el impacto económico de una mejora?",
    ],
  };
}

function createProjectionSourceReader(
  projection: CampaignDryRunProjection,
): DossierSourceReader {
  return {
    async read({ workspaceId, campaignCompanyId }) {
      const company = await projection.getCompany(
        workspaceId,
        campaignCompanyId,
      );
      if (!company) {
        throw new Error("DOSSIER_SOURCE_NOT_FOUND");
      }
      return toDossierSource(company);
    },
  };
}

function createResearchSourceReader(
  researchRepository: ResearchRepository,
): DossierSourceReader {
  return {
    async read({ workspaceId, campaignCompanyId }) {
      const company =
        await researchRepository.getCampaignCompanyMaterial({
          workspaceId,
          campaignCompanyId,
        });
      if (!company) {
        throw new Error("DOSSIER_SOURCE_NOT_FOUND");
      }
      return toDossierSource(company);
    },
  };
}

function createRegeneratingNicheRecommendationProjection(input: {
  campaignRepository: CampaignRepository;
  offerRepository: OfferRepository;
  nicheAdvisor: NicheAdvisor;
}): NicheRecommendationProjection {
  return {
    async get(workspaceId, campaignId) {
      const campaign = await input.campaignRepository.getById(
        workspaceId,
        campaignId,
      );
      if (!campaign || campaign.nicheRecommendationIds.length === 0) {
        return [];
      }
      const offer = await input.offerRepository.getById(
        workspaceId,
        campaign.offerId,
      );
      if (!offer) {
        return [];
      }
      const effectiveOffer = normalizedOfferSchema.parse({
        ...offer,
        ticketBand: campaign.targetTicketBand,
      });
      const recommendations = rankedNicheRecommendationListSchema.parse(
        await input.nicheAdvisor.recommend(effectiveOffer),
      );
      const selectedIds = new Set(campaign.nicheRecommendationIds);

      return recommendations.filter((recommendation) =>
        selectedIds.has(recommendation.id),
      );
    },
    async save() {
      // The campaign row is the durable source of truth for recommendation ids.
      // Recommendations are deterministic in Phase 1, so they can be regenerated
      // from the persisted offer + campaign ticket band whenever the page loads.
    },
  };
}

function composeServices(input: {
  offerService: OfferService;
  offerRepository: OfferRepository;
  campaignService: CampaignService;
  campaignRepository: CampaignRepository;
  companyRepository: CompanyRepository;
  dossierService: DossierService;
  dossierRepository: DossierRepository;
  auditRepository: AuditRepository;
  nicheRecommendationProjection: NicheRecommendationProjection;
  campaignDryRunProjection: CampaignDryRunProjection;
  researchProvider: ResearchProvider;
}): AppServices {
  return {
    ...input,
    campaignDryRunService: new CampaignDryRunService(
      input.campaignRepository,
      input.researchProvider,
      input.dossierService,
      input.dossierRepository,
      input.campaignDryRunProjection,
      input.auditRepository,
    ),
  };
}

export function createMemoryAppServices(): AppServices {
  const offerUnitOfWork = createMemoryOfferUnitOfWork();
  const campaignUnitOfWork = createMemoryCampaignUnitOfWork();
  const companyRepository = createMemoryCompanyRepository();
  const dossierUnitOfWork = createMemoryDossierUnitOfWork();
  const nicheRecommendationProjection =
    createMemoryNicheRecommendationProjection();
  const campaignDryRunProjection =
    createMemoryCampaignDryRunProjection();
  const offerService = new OfferService(offerUnitOfWork);
  const campaignService = new CampaignService(
    campaignUnitOfWork.campaignRepository,
    offerUnitOfWork.offerRepository,
    new FakeNicheAdvisor(),
    campaignUnitOfWork,
  );
  const dossierService = new DossierService(
    dossierUnitOfWork,
    createProjectionSourceReader(campaignDryRunProjection),
  );

  return composeServices({
    offerService,
    offerRepository: offerUnitOfWork.offerRepository,
    campaignService,
    campaignRepository: campaignUnitOfWork.campaignRepository,
    companyRepository,
    dossierService,
    dossierRepository: dossierUnitOfWork.dossierRepository,
    auditRepository: campaignUnitOfWork.auditRepository,
    nicheRecommendationProjection,
    campaignDryRunProjection,
    researchProvider: new FakeResearchProvider(companyRepository),
  });
}

async function createProductionAppServices(): Promise<AppServices> {
  const { db } = await import("@/db/client");
  const offerUnitOfWork = createDrizzleOfferUnitOfWork(db);
  const offerRepository = createDrizzleOfferRepository(db);
  const campaignUnitOfWork = createDrizzleCampaignUnitOfWork(db);
  const campaignRepository = createDrizzleCampaignRepository(
    createDrizzleCampaignPersistenceExecutor(db),
  );
  const companyRepository = createDrizzleCompanyRepository(
    createDrizzleCompanyPersistenceExecutor(db),
  );
  const dossierUnitOfWork = createDrizzleDossierUnitOfWork(db);
  const dossierRepository = createDrizzleDossierRepository(
    createDrizzleDossierPersistenceExecutor(db),
  );
  const auditRepository = createDrizzleAuditRepository(db);
  const researchRepository = createDrizzleResearchRepository(db);
  const nicheAdvisor = new FakeNicheAdvisor();
  const nicheRecommendationProjection =
    createRegeneratingNicheRecommendationProjection({
      campaignRepository,
      offerRepository,
      nicheAdvisor,
    });
  const campaignDryRunProjection = createResearchCampaignDryRunProjection(
    researchRepository,
    dossierRepository,
  );
  const dossierService = new DossierService(
    dossierUnitOfWork,
    createResearchSourceReader(researchRepository),
  );

  return composeServices({
    offerService: new OfferService(offerUnitOfWork),
    offerRepository,
    campaignService: new CampaignService(
      campaignRepository,
      offerRepository,
      nicheAdvisor,
      campaignUnitOfWork,
    ),
    campaignRepository,
    companyRepository,
    dossierService,
    dossierRepository,
    auditRepository,
    nicheRecommendationProjection,
    campaignDryRunProjection,
    researchProvider: new FakeResearchProvider(
      companyRepository,
      researchRepository,
    ),
  });
}

const globalServices = globalThis as typeof globalThis & {
  __outreachE2eServices?: AppServices;
  __outreachProductionServices?: Promise<AppServices>;
};

export async function getAppServices(): Promise<AppServices> {
  if (process.env.OUTREACH_E2E_MODE === "1") {
    if (process.env.NODE_ENV === "production") {
      throw new Error("E2E_MODE_FORBIDDEN_IN_PRODUCTION");
    }
    globalServices.__outreachE2eServices ??= createMemoryAppServices();
    return globalServices.__outreachE2eServices;
  }

  globalServices.__outreachProductionServices ??=
    createProductionAppServices();
  return globalServices.__outreachProductionServices;
}

export function resetAppServicesForE2E(): void {
  if (
    process.env.OUTREACH_E2E_MODE !== "1" ||
    process.env.NODE_ENV === "production"
  ) {
    throw new Error("E2E_RESET_NOT_AVAILABLE");
  }
  globalServices.__outreachE2eServices = createMemoryAppServices();
}
