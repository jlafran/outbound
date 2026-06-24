import type { AuditRepository } from "@/features/audit/audit-repository";

import {
  buildDossierExportView,
  EMPTY_DOSSIER_SECTION,
  type DossierExportItem,
} from "./dossier-export-view";
import {
  campaignCompanySlug,
  dossierExportErrorResponse,
  parseDossierId,
  type DossierRequestContext,
  type DossierRouteContext,
} from "./dossier-markdown";
import type { DossierRepository } from "./dossier-repository";
import type { Dossier } from "./dossier-schema";

type PdfPage = {
  setContent(
    html: string,
    options: { waitUntil: "load" },
  ): Promise<unknown>;
  pdf(options: {
    format: "A4";
    printBackground: true;
    margin: {
      top: "16mm";
      right: "14mm";
      bottom: "16mm";
      left: "14mm";
    };
  }): Promise<Uint8Array>;
  close(): Promise<unknown>;
};

type PdfBrowser = {
  newPage(): Promise<PdfPage>;
  close(): Promise<unknown>;
};

export type DossierPdfBrowserFactory = {
  launch(options: { headless: true }): Promise<PdfBrowser>;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderText(value: string): string {
  return value
    ? `<p>${escapeHtml(value)}</p>`
    : `<p class="empty">${EMPTY_DOSSIER_SECTION}</p>`;
}

function renderItem(item: DossierExportItem): string {
  const source = item.sourceUrl
    ? `<p><strong>Fuente:</strong> <a href="${escapeHtml(
        item.sourceUrl,
      )}">${escapeHtml(item.sourceUrl)}</a></p>`
    : "";
  const assumptions =
    item.assumptions.length > 0
      ? `<div><strong>Supuestos:</strong><ul>${item.assumptions
          .map((assumption) => `<li>${escapeHtml(assumption)}</li>`)
          .join("")}</ul></div>`
      : "";

  return `<article class="item">
  <p class="statement">${escapeHtml(item.statement)}</p>
  <p><strong>Etiqueta epistémica: ${escapeHtml(
    item.epistemicLabel,
  )}</strong></p>
  <p><strong>Confianza: ${escapeHtml(item.confidenceLabel)}</strong></p>
  ${source}
  ${assumptions}
</article>`;
}

export function renderDossierHtml(dossier: Dossier): string {
  const view = buildDossierExportView(dossier);
  const companyDetails = [
    view.companyOverview
      ? `<p><strong>Empresa:</strong> ${escapeHtml(
          view.companyOverview,
        )}</p>`
      : "",
    view.businessModel
      ? `<p><strong>Modelo de negocio:</strong> ${escapeHtml(
          view.businessModel,
        )}</p>`
      : "",
  ]
    .filter(Boolean)
    .join("");
  const contacts =
    view.contacts.length > 0
      ? `<div class="cards">${view.contacts
          .map(
            (contact) => `<article class="contact">
  <p><strong>Nombre:</strong> ${escapeHtml(contact.name)}</p>
  <p><strong>Rol:</strong> ${escapeHtml(contact.role)}</p>
  ${
    contact.corporateEmail
      ? `<p><strong>Correo corporativo:</strong> ${escapeHtml(
          contact.corporateEmail,
        )}</p>`
      : ""
  }
</article>`,
          )
          .join("")}</div>`
      : `<p class="empty">${EMPTY_DOSSIER_SECTION}</p>`;
  const evidenceSections = view.sections
    .map(
      (section) => `<section>
  <h2>${escapeHtml(section.title)}</h2>
  ${
    section.items.length > 0
      ? section.items.map(renderItem).join("")
      : `<p class="empty">${EMPTY_DOSSIER_SECTION}</p>`
  }
</section>`,
    )
    .join("");
  const pendingQuestions =
    view.pendingQuestions.length > 0
      ? `<ol>${view.pendingQuestions
          .map((question) => `<li>${escapeHtml(question)}</li>`)
          .join("")}</ol>`
      : `<p class="empty">${EMPTY_DOSSIER_SECTION}</p>`;

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Dossier previo a la reunión</title>
  <style>
    @page { size: A4; margin: 16mm 14mm; }
    * { box-sizing: border-box; }
    html { color: #172033; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; font-size: 10.5pt; line-height: 1.5; }
    body { margin: 0; }
    header { border-bottom: 2px solid #243b64; margin-bottom: 8mm; padding-bottom: 4mm; }
    h1 { color: #172d52; font-size: 23pt; letter-spacing: -0.02em; line-height: 1.15; margin: 0 0 3mm; }
    h2 { border-bottom: 1px solid #ccd5e3; color: #243b64; font-size: 14pt; margin: 8mm 0 3mm; padding-bottom: 1.5mm; page-break-after: avoid; }
    p { margin: 0 0 2mm; white-space: pre-wrap; }
    ul, ol { margin: 1.5mm 0 2mm 6mm; padding-left: 4mm; }
    a { color: #1c4f91; overflow-wrap: anywhere; }
    .metadata { color: #45536a; display: grid; gap: 1mm; }
    .metadata p { margin: 0; }
    .item, .contact { background: #f6f8fb; border: 1px solid #dbe2ec; border-left: 3px solid #5877a6; border-radius: 3px; margin: 0 0 3mm; padding: 3mm 4mm; break-inside: avoid; page-break-inside: avoid; }
    .statement { color: #101828; font-size: 11pt; font-weight: 600; }
    .empty { color: #697586; font-style: italic; }
    footer { border-top: 1px solid #ccd5e3; color: #697586; font-size: 8.5pt; margin-top: 10mm; padding-top: 3mm; text-align: center; }
  </style>
</head>
<body>
  <header>
    <h1>Dossier previo a la reunión</h1>
    <div class="metadata">
      <p><strong>Versión ${view.version}</strong></p>
      <p><strong>Fecha:</strong> ${escapeHtml(view.createdAt)}</p>
      <p><strong>ID dossier:</strong> ${escapeHtml(view.id)}</p>
      <p><strong>ID campaña-empresa:</strong> ${escapeHtml(
        view.campaignCompanyId,
      )}</p>
      ${
        view.meetingId
          ? `<p><strong>ID reunión:</strong> ${escapeHtml(
              view.meetingId,
            )}</p>`
          : ""
      }
    </div>
  </header>
  <main>
    <section>
      <h2>Resumen ejecutivo</h2>
      ${renderText(view.executiveSummary)}
    </section>
    <section>
      <h2>Empresa y modelo de negocio</h2>
      ${
        companyDetails ||
        `<p class="empty">${EMPTY_DOSSIER_SECTION}</p>`
      }
    </section>
    <section>
      <h2>Contactos</h2>
      ${contacts}
    </section>
    <section>
      <h2>Historial / resumen de conversación</h2>
      ${renderText(view.conversationSummary)}
    </section>
    ${evidenceSections}
    <section>
      <h2>Preguntas pendientes</h2>
      ${pendingQuestions}
    </section>
  </main>
  <footer>Dossier ${escapeHtml(view.id)} · versión ${view.version}</footer>
</body>
</html>`;
}

export async function renderDossierPdf(
  dossier: Dossier,
  browserFactory?: DossierPdfBrowserFactory,
): Promise<Buffer> {
  const html = renderDossierHtml(dossier);
  const factory =
    browserFactory ??
    ((await import("playwright")).chromium as DossierPdfBrowserFactory);
  const browser = await factory.launch({ headless: true });
  let page: PdfPage | undefined;
  let operationError: unknown;

  try {
    page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: {
        top: "16mm",
        right: "14mm",
        bottom: "16mm",
        left: "14mm",
      },
    });
    return Buffer.from(pdf);
  } catch (error) {
    operationError = error;
    throw error;
  } finally {
    let closeError: unknown;
    if (page) {
      try {
        await page.close();
      } catch (error) {
        closeError = error;
      }
    }
    try {
      await browser.close();
    } catch (error) {
      closeError ??= error;
    }
    if (!operationError && closeError) {
      throw closeError;
    }
  }
}

type PdfDossierHandlerDependencies = {
  dossierRepository: DossierRepository;
  auditRepository: AuditRepository;
  renderPdf?: (dossier: Dossier) => Promise<Buffer>;
  resolveRequestContext(
    request: Request,
  ): Promise<DossierRequestContext | null>;
};

export function createPdfDossierHandler({
  dossierRepository,
  auditRepository,
  renderPdf = renderDossierPdf,
  resolveRequestContext,
}: PdfDossierHandlerDependencies) {
  return async function pdfDossierHandler(
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

    const baseFilename = `dossier-${campaignCompanySlug(
      dossier.campaignCompanyId,
    )}-v${dossier.version}`;

    let pdf: Buffer;
    try {
      pdf = await renderPdf(dossier);
    } catch {
      try {
        await auditRepository.append({
          workspaceId: requestContext.workspaceId,
          actorId: requestContext.actorId,
          action: "dossier.exported",
          entityId: dossier.id,
          metadata: {
            format: "pdf_html_fallback",
            dossierId: dossier.id,
            campaignCompanyId: dossier.campaignCompanyId,
            version: dossier.version,
          },
        });
      } catch {
        return dossierExportErrorResponse(500);
      }

      return new Response(renderDossierHtml(dossier), {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Disposition": `inline; filename="${baseFilename}.html"`,
          "X-Dossier-PDF-Fallback": "html",
        },
      });
    }

    try {
      await auditRepository.append({
        workspaceId: requestContext.workspaceId,
        actorId: requestContext.actorId,
        action: "dossier.exported",
        entityId: dossier.id,
        metadata: {
          format: "pdf",
          dossierId: dossier.id,
          campaignCompanyId: dossier.campaignCompanyId,
          version: dossier.version,
        },
      });
      const body = new Uint8Array(pdf);

      return new Response(body, {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${baseFilename}.pdf"`,
          "Content-Length": String(body.byteLength),
        },
      });
    } catch {
      return dossierExportErrorResponse(500);
    }
  };
}
