import type { AuditRepository } from "@/features/audit/audit-repository";

import {
  dossierSchema,
  type Dossier,
  type DossierItem,
} from "./dossier-schema";
import type { DossierRepository } from "./dossier-repository";

const EMPTY_SECTION = "Sin información registrada.";

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

export function escapeMarkdownText(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replace(
      /[`*_[\]{}()<>#+.!|>:=~]/g,
      (character) => `\\${character}`,
    )
    .split("\n")
    .map((line) =>
      line
        .replace(/^(\s*)([-+])(?=\s)/, "$1\\$2")
        .replace(/^(\s*)(\d+)\\\.(?=\s)/, "$1$2\\."),
    )
    .join("\n");
}

function renderText(value: string): string {
  return value ? escapeMarkdownText(value) : EMPTY_SECTION;
}

function renderCompany(dossier: Dossier): string {
  const lines = [
    dossier.companyOverview
      ? `Empresa: ${escapeMarkdownText(dossier.companyOverview)}`
      : null,
    dossier.businessModel
      ? `Modelo de negocio: ${escapeMarkdownText(dossier.businessModel)}`
      : null,
  ].filter((line): line is string => line !== null);

  return lines.length > 0 ? lines.join("\n\n") : EMPTY_SECTION;
}

function renderContacts(dossier: Dossier): string {
  if (dossier.contacts.length === 0) {
    return EMPTY_SECTION;
  }

  return dossier.contacts
    .map((contact) =>
      [
        `- Nombre: ${escapeMarkdownText(contact.name)}`,
        `  - Rol: ${escapeMarkdownText(contact.role)}`,
        ...(contact.corporateEmail
          ? [
              `  - Correo corporativo: ${escapeMarkdownText(
                contact.corporateEmail,
              )}`,
            ]
          : []),
      ].join("\n"),
    )
    .join("\n");
}

function renderItem(item: DossierItem): string {
  return [
    `- Declaración: ${escapeMarkdownText(item.statement)}`,
    `  - Etiqueta epistémica: ${epistemicLabels[item.kind]}`,
    `  - Confianza: ${confidenceLabels[item.confidence]}`,
    ...(item.sourceUrl
      ? [`  - Fuente: ${escapeMarkdownText(item.sourceUrl)}`]
      : []),
    ...(item.assumptions.length > 0
      ? [
          "  - Supuestos:",
          ...item.assumptions.map(
            (assumption) => `    - ${escapeMarkdownText(assumption)}`,
          ),
        ]
      : []),
  ].join("\n");
}

function renderItems(items: DossierItem[]): string {
  const visibleItems = items.filter((item) => !item.hidden);
  return visibleItems.length > 0
    ? visibleItems.map(renderItem).join("\n\n")
    : EMPTY_SECTION;
}

function renderPendingQuestions(dossier: Dossier): string {
  return dossier.pendingQuestions.length > 0
    ? dossier.pendingQuestions
        .map(
          (question, index) =>
            `${index + 1}. ${escapeMarkdownText(question)}`,
        )
        .join("\n")
    : EMPTY_SECTION;
}

export function renderDossierMarkdown(dossier: Dossier): string {
  const parsed = dossierSchema.parse(dossier);

  const lines = [
    "# Dossier previo a la reunión",
    "",
    `- Versión: ${parsed.version}`,
    `- Fecha: ${parsed.createdAt.toISOString()}`,
    `- ID campaña-empresa: ${escapeMarkdownText(
      parsed.campaignCompanyId,
    )}`,
    ...(parsed.meetingId
      ? [`- ID reunión: ${escapeMarkdownText(parsed.meetingId)}`]
      : []),
    "",
    "## Resumen ejecutivo",
    "",
    renderText(parsed.executiveSummary),
    "",
    "## Empresa y modelo de negocio",
    "",
    renderCompany(parsed),
    "",
    "## Contactos",
    "",
    renderContacts(parsed),
    "",
    "## Historial / resumen de conversación",
    "",
    renderText(parsed.conversationSummary),
    "",
    "## Necesidades confirmadas",
    "",
    renderItems(parsed.confirmedNeeds),
    "",
    "## Hechos investigados",
    "",
    renderItems(parsed.researchedFacts),
    "",
    "## Hipótesis a validar",
    "",
    renderItems(parsed.hypotheses),
    "",
    "## Estimaciones",
    "",
    renderItems(parsed.estimates),
    "",
    "## Competidores y brechas",
    "",
    renderItems(parsed.competitors),
    "",
    "## Recomendaciones",
    "",
    renderItems(parsed.recommendations),
    "",
    "## Preguntas pendientes",
    "",
    renderPendingQuestions(parsed),
  ];

  return `${lines.join("\n")}\n`;
}

type RequestContext = {
  workspaceId: string;
  actorId: string;
};

type RouteParams = {
  id?: unknown;
};

type MarkdownRouteContext = {
  params: RouteParams | Promise<RouteParams>;
};

type MarkdownDossierHandlerDependencies = {
  dossierRepository: DossierRepository;
  auditRepository: AuditRepository;
  resolveRequestContext(
    request: Request,
  ): Promise<RequestContext | null>;
};

function errorResponse(status: number): Response {
  return new Response("No se pudo exportar el dossier.", { status });
}

function parseDossierId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const id = value.trim();
  return id.length > 0 &&
    id.length <= 256 &&
    !/[\u0000-\u001f\u007f]/.test(id)
    ? id
    : null;
}

function campaignCompanySlug(campaignCompanyId: string): string {
  const slug = campaignCompanyId
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/g, "");

  return slug || "empresa";
}

export function createMarkdownDossierHandler({
  dossierRepository,
  auditRepository,
  resolveRequestContext,
}: MarkdownDossierHandlerDependencies) {
  return async function markdownDossierHandler(
    request: Request,
    { params }: MarkdownRouteContext,
  ): Promise<Response> {
    const requestContext = await resolveRequestContext(request);
    if (!requestContext) {
      return errorResponse(401);
    }

    const dossierId = parseDossierId((await params).id);
    if (!dossierId) {
      return errorResponse(400);
    }

    const dossier = await dossierRepository.getById(
      requestContext.workspaceId,
      dossierId,
    );
    if (!dossier) {
      return errorResponse(404);
    }

    try {
      const markdown = renderDossierMarkdown(dossier);

      await auditRepository.append({
        workspaceId: requestContext.workspaceId,
        actorId: requestContext.actorId,
        action: "dossier.exported",
        entityId: dossier.id,
        metadata: {
          format: "markdown",
          dossierId: dossier.id,
          campaignCompanyId: dossier.campaignCompanyId,
          version: dossier.version,
        },
      });

      const filename = `dossier-${campaignCompanySlug(
        dossier.campaignCompanyId,
      )}-v${dossier.version}.md`;

      return new Response(markdown, {
        status: 200,
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    } catch {
      return errorResponse(500);
    }
  };
}
