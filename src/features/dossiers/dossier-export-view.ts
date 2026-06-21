import {
  dossierSchema,
  type Dossier,
  type DossierItem,
} from "./dossier-schema";

export const EMPTY_DOSSIER_SECTION = "Sin información registrada.";

const epistemicLabels: Record<DossierItem["kind"], string> = {
  confirmed_by_prospect: "Confirmado por el prospecto",
  researched_fact: "Hecho investigado",
  hypothesis: "Hipótesis",
  estimate: "Estimación",
  recommendation: "Recomendación",
};

const confidenceLabels: Record<DossierItem["confidence"], string> = {
  low: "baja",
  medium: "media",
  high: "alta",
};

export type DossierExportItem = {
  id: string;
  statement: string;
  sourceUrl?: string;
  assumptions: string[];
  epistemicLabel: string;
  confidenceLabel: string;
};

export type DossierExportSection = {
  key:
    | "confirmedNeeds"
    | "researchedFacts"
    | "hypotheses"
    | "estimates"
    | "competitors"
    | "recommendations";
  title: string;
  items: DossierExportItem[];
};

export type DossierExportView = {
  id: string;
  workspaceId: string;
  campaignCompanyId: string;
  meetingId: string | null;
  version: number;
  createdAt: string;
  executiveSummary: string;
  companyOverview: string;
  businessModel: string;
  contacts: Array<{
    name: string;
    role: string;
    corporateEmail?: string;
  }>;
  conversationSummary: string;
  sections: DossierExportSection[];
  pendingQuestions: string[];
};

function buildItems(items: DossierItem[]): DossierExportItem[] {
  return items
    .filter((item) => !item.hidden)
    .map((item) => ({
      id: item.id,
      statement: item.statement,
      ...(item.sourceUrl ? { sourceUrl: item.sourceUrl } : {}),
      assumptions: [...item.assumptions],
      epistemicLabel: epistemicLabels[item.kind],
      confidenceLabel: confidenceLabels[item.confidence],
    }));
}

export function buildDossierExportView(
  dossier: Dossier,
): DossierExportView {
  const parsed = dossierSchema.parse(dossier);

  return {
    id: parsed.id,
    workspaceId: parsed.workspaceId,
    campaignCompanyId: parsed.campaignCompanyId,
    meetingId: parsed.meetingId,
    version: parsed.version,
    createdAt: parsed.createdAt.toISOString(),
    executiveSummary: parsed.executiveSummary,
    companyOverview: parsed.companyOverview,
    businessModel: parsed.businessModel,
    contacts: parsed.contacts.map((contact) => ({ ...contact })),
    conversationSummary: parsed.conversationSummary,
    sections: [
      {
        key: "confirmedNeeds",
        title: "Necesidades confirmadas",
        items: buildItems(parsed.confirmedNeeds),
      },
      {
        key: "researchedFacts",
        title: "Hechos investigados",
        items: buildItems(parsed.researchedFacts),
      },
      {
        key: "hypotheses",
        title: "Hipótesis a validar",
        items: buildItems(parsed.hypotheses),
      },
      {
        key: "estimates",
        title: "Estimaciones",
        items: buildItems(parsed.estimates),
      },
      {
        key: "competitors",
        title: "Competidores y brechas",
        items: buildItems(parsed.competitors),
      },
      {
        key: "recommendations",
        title: "Recomendaciones",
        items: buildItems(parsed.recommendations),
      },
    ],
    pendingQuestions: [...parsed.pendingQuestions],
  };
}
