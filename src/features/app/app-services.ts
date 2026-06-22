import {
  CampaignDryRunService,
} from "@/features/campaigns/campaign-dry-run-service";
import {
  createMemoryCampaignDryRunProjection,
  createMemoryNicheRecommendationProjection,
  createUnsupportedCampaignDryRunProjection,
  createUnsupportedNicheRecommendationProjection,
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
import {
  createDrizzleOfferRepository,
  type OfferRepository,
} from "@/features/offers/offer-repository";
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

function composeServices(input: {
  offerService: OfferService;
  offerRepository: OfferRepository;
  campaignService: CampaignService;
  campaignRepository: CampaignRepository;
  companyRepository: CompanyRepository;
  dossierService: DossierService;
  dossierRepository: DossierRepository;
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
    nicheRecommendationProjection,
    campaignDryRunProjection,
    researchProvider: new FakeResearchProvider(companyRepository),
  });
}

class UnsupportedNicheAdvisor implements NicheAdvisor {
  async recommend(): Promise<never> {
    throw new Error("NICHE_ADVISOR_NOT_CONFIGURED");
  }
}

class UnsupportedResearchProvider implements ResearchProvider {
  async researchCampaign(): Promise<never> {
    throw new Error("DRY_RUN_RESEARCH_E2E_ONLY");
  }
}

const unsupportedDossierSourceReader: DossierSourceReader = {
  async read() {
    throw new Error("DOSSIER_SOURCE_READER_NOT_CONFIGURED");
  },
};

export function createProductionProjections(): {
  nicheRecommendationProjection: NicheRecommendationProjection;
  campaignDryRunProjection: CampaignDryRunProjection;
} {
  return {
    nicheRecommendationProjection:
      createUnsupportedNicheRecommendationProjection(),
    campaignDryRunProjection: createUnsupportedCampaignDryRunProjection(),
  };
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
  const {
    nicheRecommendationProjection,
    campaignDryRunProjection,
  } = createProductionProjections();
  const dossierService = new DossierService(
    dossierUnitOfWork,
    unsupportedDossierSourceReader,
  );

  return composeServices({
    offerService: new OfferService(offerUnitOfWork),
    offerRepository,
    campaignService: new CampaignService(
      campaignRepository,
      offerRepository,
      new UnsupportedNicheAdvisor(),
      campaignUnitOfWork,
    ),
    campaignRepository,
    companyRepository,
    dossierService,
    dossierRepository,
    nicheRecommendationProjection,
    campaignDryRunProjection,
    researchProvider: new UnsupportedResearchProvider(),
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
