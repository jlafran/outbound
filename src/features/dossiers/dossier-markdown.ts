import type { AuditRepository } from "@/features/audit/audit-repository";

import {
  buildDossierExportView,
  EMPTY_DOSSIER_SECTION,
  type DossierExportItem,
  type DossierExportView,
} from "./dossier-export-view";
import {
  type Dossier,
} from "./dossier-schema";
import type { DossierRepository } from "./dossier-repository";

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
  return value ? escapeMarkdownText(value) : EMPTY_DOSSIER_SECTION;
}

function renderCompany(dossier: DossierExportView): string {
  const lines = [
    dossier.companyOverview
      ? `Empresa: ${escapeMarkdownText(dossier.companyOverview)}`
      : null,
    dossier.businessModel
      ? `Modelo de negocio: ${escapeMarkdownText(dossier.businessModel)}`
      : null,
  ].filter((line): line is string => line !== null);

  return lines.length > 0
    ? lines.join("\n\n")
    : EMPTY_DOSSIER_SECTION;
}

function renderContacts(dossier: DossierExportView): string {
  if (dossier.contacts.length === 0) {
    return EMPTY_DOSSIER_SECTION;
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

function renderItem(item: DossierExportItem): string {
  return [
    `- Declaración: ${escapeMarkdownText(item.statement)}`,
    `  - Etiqueta epistémica: ${item.epistemicLabel}`,
    `  - Confianza: ${item.confidenceLabel}`,
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

function renderItems(items: DossierExportItem[]): string {
  return items.length > 0
    ? items.map(renderItem).join("\n\n")
    : EMPTY_DOSSIER_SECTION;
}

function renderPendingQuestions(dossier: DossierExportView): string {
  return dossier.pendingQuestions.length > 0
    ? dossier.pendingQuestions
        .map(
          (question, index) =>
            `${index + 1}. ${escapeMarkdownText(question)}`,
        )
        .join("\n")
    : EMPTY_DOSSIER_SECTION;
}

export function renderDossierMarkdown(dossier: Dossier): string {
  const view = buildDossierExportView(dossier);
  const sections = Object.fromEntries(
    view.sections.map((section) => [section.key, section]),
  ) as Record<
    DossierExportView["sections"][number]["key"],
    DossierExportView["sections"][number]
  >;

  const lines = [
    "# Dossier previo a la reunión",
    "",
    `- Versión: ${view.version}`,
    `- Fecha: ${view.createdAt}`,
    `- ID campaña-empresa: ${escapeMarkdownText(
      view.campaignCompanyId,
    )}`,
    ...(view.meetingId
      ? [`- ID reunión: ${escapeMarkdownText(view.meetingId)}`]
      : []),
    "",
    "## Resumen ejecutivo",
    "",
    renderText(view.executiveSummary),
    "",
    "## Empresa y modelo de negocio",
    "",
    renderCompany(view),
    "",
    "## Contactos",
    "",
    renderContacts(view),
    "",
    "## Historial / resumen de conversación",
    "",
    renderText(view.conversationSummary),
    "",
    "## Necesidades confirmadas",
    "",
    renderItems(sections.confirmedNeeds.items),
    "",
    "## Hechos investigados",
    "",
    renderItems(sections.researchedFacts.items),
    "",
    "## Hipótesis a validar",
    "",
    renderItems(sections.hypotheses.items),
    "",
    "## Estimaciones",
    "",
    renderItems(sections.estimates.items),
    "",
    "## Competidores y brechas",
    "",
    renderItems(sections.competitors.items),
    "",
    "## Recomendaciones",
    "",
    renderItems(sections.recommendations.items),
    "",
    "## Preguntas pendientes",
    "",
    renderPendingQuestions(view),
  ];

  return `${lines.join("\n")}\n`;
}

export type DossierRequestContext = {
  workspaceId: string;
  actorId: string;
};

type DossierRouteParams = {
  id?: unknown;
};

export type DossierRouteContext = {
  params: DossierRouteParams | Promise<DossierRouteParams>;
};

type MarkdownDossierHandlerDependencies = {
  dossierRepository: DossierRepository;
  auditRepository: AuditRepository;
  resolveRequestContext(
    request: Request,
  ): Promise<DossierRequestContext | null>;
};

export function dossierExportErrorResponse(status: number): Response {
  return new Response("No se pudo exportar el dossier.", { status });
}

export function parseDossierId(value: unknown): string | null {
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

export function campaignCompanySlug(
  campaignCompanyId: string,
): string {
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
    { params }: DossierRouteContext,
  ): Promise<Response> {
    const requestContext = await resolveRequestContext(request);
    if (!requestContext) {
      return dossierExportErrorResponse(401);
    }

    const dossierId = parseDossierId((await params).id);
    if (!dossierId) {
      return dossierExportErrorResponse(400);
    }

    const dossier = await dossierRepository.getById(
      requestContext.workspaceId,
      dossierId,
    );
    if (!dossier) {
      return dossierExportErrorResponse(404);
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
      return dossierExportErrorResponse(500);
    }
  };
}
