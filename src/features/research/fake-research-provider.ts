import { createHash } from "node:crypto";
import { z } from "zod";

import type { CompanyRepository } from "@/features/companies/company-repository";
import { normalizeCompanyDomain } from "@/features/companies/company-schema";

import {
  type ResearchCampaignInput,
  type ResearchCampaignResult,
  type ResearchCompany,
  type ResearchProvider,
} from "./research-provider";
import type { ResearchRepository } from "./research-repository";
import { evidenceSchema } from "./research-schema";
import {
  scoreCompany,
  type ScoreCompanyField,
  type ScoreCompanyInput,
} from "./score-company";

const fixedObservedAt = new Date("2026-06-20T12:00:00.000Z");

const campaignInputSchema = z
  .object({
    workspaceId: z.string().trim().min(1),
    campaignId: z.string().trim().min(1),
    offerId: z.string().trim().min(1).optional(),
  })
  .strict();

const contactSchema = z
  .object({
    name: z.string().trim().min(1),
    role: z.string().trim().min(1),
    corporateEmail: z.string().trim().email(),
  })
  .strict();

const scoreComponentSchema = z
  .object({
    input: z.number().finite().min(0).max(100),
    weight: z.number().finite().min(0).max(1),
    contribution: z.number().finite().min(0).max(100),
  })
  .strict();

const scoreFields = [
  "capacityToPay",
  "problemMagnitude",
  "urgency",
  "solutionFit",
  "decisionMakerAccess",
  "evidenceConfidence",
] as const satisfies readonly ScoreCompanyField[];

const scoreResultSchema = z
  .object({
    total: z.number().finite().min(0).max(100),
    components: z
      .object(
        Object.fromEntries(
          scoreFields.map((field) => [field, scoreComponentSchema]),
        ) as Record<ScoreCompanyField, typeof scoreComponentSchema>,
      )
      .strict(),
    explanation: z.string().trim().min(1),
  })
  .strict();

const researchCompanySchema = z
  .object({
    companyId: z.string().trim().min(1),
    campaignCompanyId: z.string().startsWith("dry-run:").min(9),
    name: z.string().trim().min(1),
    domain: z.string().trim().min(1),
    contacts: z.array(contactSchema).length(1),
    evidence: z.array(evidenceSchema).length(4),
    score: scoreResultSchema,
  })
  .strict()
  .superRefine((company, context) => {
    let normalizedDomain: string;
    try {
      normalizedDomain = normalizeCompanyDomain(company.domain);
    } catch {
      context.addIssue({
        code: "custom",
        path: ["domain"],
        message: "Research company domain must be public and valid",
      });
      return;
    }

    if (normalizedDomain !== company.domain) {
      context.addIssue({
        code: "custom",
        path: ["domain"],
        message: "Research company domain must be normalized",
      });
    }

    const contactDomain = company.contacts[0]?.corporateEmail
      .split("@")
      .at(-1);
    if (contactDomain !== company.domain) {
      context.addIssue({
        code: "custom",
        path: ["contacts", 0, "corporateEmail"],
        message: "Corporate contact email must match the company domain",
      });
    }

    const kinds = company.evidence.map(({ kind }) => kind);
    if (kinds.filter((kind) => kind === "researched_fact").length !== 2) {
      context.addIssue({
        code: "custom",
        path: ["evidence"],
        message: "Research company requires exactly two researched facts",
      });
    }
    if (kinds.filter((kind) => kind === "hypothesis").length !== 1) {
      context.addIssue({
        code: "custom",
        path: ["evidence"],
        message: "Research company requires exactly one hypothesis",
      });
    }
    if (kinds.filter((kind) => kind === "estimate").length !== 1) {
      context.addIssue({
        code: "custom",
        path: ["evidence"],
        message: "Research company requires exactly one estimate",
      });
    }

    company.evidence.forEach((item, index) => {
      if (!item.sourceUrl?.startsWith("https://example.com/")) {
        context.addIssue({
          code: "custom",
          path: ["evidence", index, "sourceUrl"],
          message: "Dry-run evidence requires an example.com source URL",
        });
      }
      if (
        item.kind === "researched_fact" &&
        item.confidence !== "high" &&
        item.confidence !== "medium"
      ) {
        context.addIssue({
          code: "custom",
          path: ["evidence", index, "confidence"],
          message: "Researched facts require medium or high confidence",
        });
      }
    });
  });

const researchResultSchema = z
  .object({
    companies: z.array(researchCompanySchema).length(3),
  })
  .strict();

type FixtureCompany = Omit<
  ResearchCompany,
  "companyId" | "campaignCompanyId" | "score"
> & {
  scoreInput: ScoreCompanyInput;
};

const fixtureCompanies: FixtureCompany[] = [
  {
    name: "Logística Pampa",
    domain: "logistica-pampa.example.com",
    contacts: [
      {
        name: "Marina Quiroga",
        role: "Directora de Operaciones",
        corporateEmail: "marina.quiroga@logistica-pampa.example.com",
      },
    ],
    evidence: [
      {
        kind: "researched_fact",
        statement:
          "La empresa ficticia opera distribución terrestre para clientes corporativos argentinos.",
        sourceUrl: "https://example.com/logistica-pampa/operaciones",
        observedAt: fixedObservedAt,
        confidence: "high",
        assumptions: [],
      },
      {
        kind: "researched_fact",
        statement:
          "La empresa ficticia publica una oferta de seguimiento digital de entregas.",
        sourceUrl: "https://example.com/logistica-pampa/seguimiento",
        observedAt: fixedObservedAt,
        confidence: "medium",
        assumptions: [],
      },
      {
        kind: "hypothesis",
        statement:
          "La coordinación entre tráfico y atención al cliente podría incluir tareas manuales repetitivas.",
        sourceUrl: "https://example.com/logistica-pampa/hipotesis",
        observedAt: fixedObservedAt,
        confidence: "medium",
        assumptions: [
          "El volumen de entregas requiere coordinación entre áreas.",
        ],
      },
      {
        kind: "estimate",
        statement:
          "Una mejora de visibilidad operativa podría reducir tiempos de seguimiento interno.",
        sourceUrl: "https://example.com/logistica-pampa/estimacion",
        observedAt: fixedObservedAt,
        confidence: "medium",
        assumptions: [
          "Parte del seguimiento se realiza fuera de un flujo centralizado.",
        ],
      },
    ],
    scoreInput: {
      capacityToPay: 82,
      problemMagnitude: 91,
      urgency: 88,
      solutionFit: 90,
      decisionMakerAccess: 76,
      evidenceConfidence: 84,
    },
  },
  {
    name: "Nexo B2B Sistemas",
    domain: "nexo-b2b.example.com",
    contacts: [
      {
        name: "Tomás Ferrero",
        role: "Director Comercial",
        corporateEmail: "tomas.ferrero@nexo-b2b.example.com",
      },
    ],
    evidence: [
      {
        kind: "researched_fact",
        statement:
          "La empresa ficticia ofrece software de gestión para equipos comerciales B2B.",
        sourceUrl: "https://example.com/nexo-b2b/producto",
        observedAt: fixedObservedAt,
        confidence: "high",
        assumptions: [],
      },
      {
        kind: "researched_fact",
        statement:
          "La empresa ficticia describe integraciones con herramientas de ventas.",
        sourceUrl: "https://example.com/nexo-b2b/integraciones",
        observedAt: fixedObservedAt,
        confidence: "medium",
        assumptions: [],
      },
      {
        kind: "hypothesis",
        statement:
          "El crecimiento comercial podría aumentar la necesidad de estandarizar la calificación de oportunidades.",
        sourceUrl: "https://example.com/nexo-b2b/hipotesis",
        observedAt: fixedObservedAt,
        confidence: "medium",
        assumptions: [
          "El equipo comercial gestiona múltiples oportunidades en paralelo.",
        ],
      },
      {
        kind: "estimate",
        statement:
          "La automatización de tareas comerciales podría liberar capacidad del equipo para conversaciones de venta.",
        sourceUrl: "https://example.com/nexo-b2b/estimacion",
        observedAt: fixedObservedAt,
        confidence: "medium",
        assumptions: [
          "Existen tareas repetitivas en la preparación y seguimiento de oportunidades.",
        ],
      },
    ],
    scoreInput: {
      capacityToPay: 86,
      problemMagnitude: 83,
      urgency: 79,
      solutionFit: 92,
      decisionMakerAccess: 85,
      evidenceConfidence: 81,
    },
  },
  {
    name: "Salud Privada del Plata",
    domain: "salud-del-plata.example.com",
    contacts: [
      {
        name: "Lucía Benítez",
        role: "Gerenta de Administración",
        corporateEmail: "lucia.benitez@salud-del-plata.example.com",
      },
    ],
    evidence: [
      {
        kind: "researched_fact",
        statement:
          "La empresa ficticia administra centros privados de atención ambulatoria.",
        sourceUrl: "https://example.com/salud-del-plata/centros",
        observedAt: fixedObservedAt,
        confidence: "high",
        assumptions: [],
      },
      {
        kind: "researched_fact",
        statement:
          "La empresa ficticia informa canales digitales para turnos y consultas administrativas.",
        sourceUrl: "https://example.com/salud-del-plata/canales",
        observedAt: fixedObservedAt,
        confidence: "medium",
        assumptions: [],
      },
      {
        kind: "hypothesis",
        statement:
          "La coordinación administrativa podría enfrentar fricción entre turnos, autorizaciones y facturación.",
        sourceUrl: "https://example.com/salud-del-plata/hipotesis",
        observedAt: fixedObservedAt,
        confidence: "medium",
        assumptions: [
          "Los procesos administrativos involucran múltiples sistemas o responsables.",
        ],
      },
      {
        kind: "estimate",
        statement:
          "La reducción de tareas administrativas repetitivas podría mejorar la capacidad de atención.",
        sourceUrl: "https://example.com/salud-del-plata/estimacion",
        observedAt: fixedObservedAt,
        confidence: "medium",
        assumptions: [
          "Una porción relevante de las consultas requiere intervención manual.",
        ],
      },
    ],
    scoreInput: {
      capacityToPay: 88,
      problemMagnitude: 89,
      urgency: 86,
      solutionFit: 78,
      decisionMakerAccess: 68,
      evidenceConfidence: 79,
    },
  },
];

function createCampaignCompanyId(
  workspaceId: string,
  campaignId: string,
  domain: string,
): string {
  const digest = createHash("sha256")
    .update(`${workspaceId}\0${campaignId}\0${domain}`)
    .digest("hex")
    .slice(0, 32);

  return `dry-run:${digest}`;
}

export class FakeResearchProvider implements ResearchProvider {
  constructor(
    private readonly companyRepository: CompanyRepository,
    private readonly researchRepository?: ResearchRepository,
  ) {}

  async researchCampaign(
    input: ResearchCampaignInput,
  ): Promise<ResearchCampaignResult> {
    const parsedInput = campaignInputSchema.parse(input);
    const companies: ResearchCompany[] = [];

    for (const fixture of fixtureCompanies) {
      const record = await this.companyRepository.upsertByDomain({
        workspaceId: parsedInput.workspaceId,
        domain: fixture.domain,
        name: fixture.name,
      });
      companies.push({
        companyId: record.id,
        campaignCompanyId: createCampaignCompanyId(
          parsedInput.workspaceId,
          parsedInput.campaignId,
          record.normalizedDomain,
        ),
        name: record.name,
        domain: record.normalizedDomain,
        contacts: fixture.contacts,
        evidence: fixture.evidence,
        score: scoreCompany(fixture.scoreInput),
      });
    }

    const result = researchResultSchema.parse({ companies });
    await this.researchRepository?.persistCampaignResearch({
      workspaceId: parsedInput.workspaceId,
      campaignId: parsedInput.campaignId,
      offerId: parsedInput.offerId,
      companies: result.companies,
    });

    return structuredClone(result);
  }
}
