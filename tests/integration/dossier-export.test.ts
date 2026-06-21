import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";

import { chromium } from "playwright";
import { afterEach, describe, expect, it, vi } from "vitest";

// @ts-expect-error The portable Node launcher is intentionally plain ESM.
import { isPdfSmokeRequired } from "../../scripts/run-pdf-smoke.mjs";
import {
  createMemoryAuditRepository,
  type AuditRepository,
} from "@/features/audit/audit-repository";
import {
  createMarkdownDossierHandler,
  renderDossierMarkdown,
} from "@/features/dossiers/dossier-markdown";
import {
  createMemoryDossierRepository,
  type DossierRepository,
} from "@/features/dossiers/dossier-repository";
import {
  dossierSchema,
  type Dossier,
} from "@/features/dossiers/dossier-schema";
import { buildDossierExportView } from "@/features/dossiers/dossier-export-view";
import {
  createPdfDossierHandler,
  renderDossierHtml,
  renderDossierPdf,
} from "@/features/dossiers/dossier-pdf";

function createDossier(overrides: Partial<Dossier> = {}): Dossier {
  return dossierSchema.parse({
    id: "dossier-1",
    workspaceId: "workspace-1",
    campaignCompanyId: "campaign-company-1",
    meetingId: "meeting-1",
    version: 3,
    previousVersionId: "dossier-0",
    executiveSummary: "Resumen ejecutivo",
    companyOverview: "Descripción de la empresa",
    businessModel: "Suscripciones B2B",
    contacts: [],
    conversationSummary: "Conversación previa",
    confirmedNeeds: [],
    researchedFacts: [],
    hypotheses: [],
    estimates: [],
    competitors: [],
    recommendations: [],
    pendingQuestions: [],
    createdAt: new Date("2026-06-21T12:34:56.000Z"),
    createdBy: "user-1",
    ...overrides,
  });
}

describe("renderDossierMarkdown", () => {
  it("renders the stable title, metadata, and section order", () => {
    const markdown = renderDossierMarkdown(createDossier());

    expect(markdown).toContain("# Dossier previo a la reunión\n");
    expect(markdown).toContain("- Versión: 3");
    expect(markdown).toContain("- Fecha: 2026-06-21T12:34:56.000Z");
    expect(markdown).toContain(
      "- ID campaña-empresa: campaign-company-1",
    );
    expect(markdown).toContain("- ID reunión: meeting-1");
    expect(
      [
        "## Resumen ejecutivo",
        "## Empresa y modelo de negocio",
        "## Contactos",
        "## Historial / resumen de conversación",
        "## Necesidades confirmadas",
        "## Hechos investigados",
        "## Hipótesis a validar",
        "## Estimaciones",
        "## Competidores y brechas",
        "## Recomendaciones",
        "## Preguntas pendientes",
      ].map((heading) => markdown.indexOf(heading)),
    ).toEqual(
      [
        "## Resumen ejecutivo",
        "## Empresa y modelo de negocio",
        "## Contactos",
        "## Historial / resumen de conversación",
        "## Necesidades confirmadas",
        "## Hechos investigados",
        "## Hipótesis a validar",
        "## Estimaciones",
        "## Competidores y brechas",
        "## Recomendaciones",
        "## Preguntas pendientes",
      ]
        .map((heading) => markdown.indexOf(heading))
        .sort((left, right) => left - right),
    );
  });

  it("rejects invalid runtime input", () => {
    expect(() =>
      renderDossierMarkdown({
        ...createDossier(),
        version: 0,
      }),
    ).toThrow();
  });

  it("renders visible evidence with epistemic labels, confidence, sources, and assumptions", () => {
    const markdown = renderDossierMarkdown(
      createDossier({
        confirmedNeeds: [
          {
            id: "need-1",
            kind: "confirmed_by_prospect",
            statement: "Necesita mejorar la calificación",
            confidence: "high",
            assumptions: [],
            hidden: false,
          },
        ],
        researchedFacts: [
          {
            id: "fact-1",
            kind: "researched_fact",
            statement: "Abrió una segunda oficina",
            sourceUrl: "https://example.com/news",
            confidence: "high",
            assumptions: ["La nota sigue vigente"],
            hidden: false,
          },
        ],
        hypotheses: [
          {
            id: "hypothesis-1",
            kind: "hypothesis",
            statement: "El crecimiento puede presionar onboarding",
            confidence: "medium",
            assumptions: ["La oficina está contratando"],
            hidden: false,
          },
        ],
        estimates: [
          {
            id: "estimate-1",
            kind: "estimate",
            statement: "El piloto podría ahorrar diez horas",
            confidence: "low",
            assumptions: ["Cinco representantes lo usarían"],
            hidden: false,
          },
        ],
        competitors: [
          {
            id: "competitor-1",
            kind: "hypothesis",
            statement: "Puede estar evaluando otro CRM",
            confidence: "low",
            assumptions: ["La compra está activa"],
            hidden: false,
          },
        ],
        recommendations: [
          {
            id: "recommendation-1",
            kind: "recommendation",
            statement: "Proponer un piloto de dos semanas",
            confidence: "medium",
            assumptions: [],
            hidden: false,
          },
        ],
      }),
    );

    expect(markdown).toContain("Etiqueta epistémica: Confirmado por el prospecto");
    expect(markdown).toContain("Etiqueta epistémica: Hecho investigado");
    expect(markdown).toContain("Etiqueta epistémica: Hipótesis");
    expect(markdown).toContain("Etiqueta epistémica: Estimación");
    expect(markdown).toContain("Etiqueta epistémica: Recomendación");
    expect(markdown).toContain("Confianza: alta");
    expect(markdown).toContain("Confianza: media");
    expect(markdown).toContain("Confianza: baja");
    expect(markdown).toContain("Fuente: https\\://example\\.com/news");
    expect(markdown).toContain("Supuestos:");
    expect(markdown).toContain("La oficina está contratando");
  });

  it("omits hidden items and every malicious field nested in them", () => {
    const markdown = renderDossierMarkdown(
      createDossier({
        hypotheses: [
          {
            id: "hidden-1",
            kind: "hypothesis",
            statement: "MALICIOUS_STATEMENT",
            sourceUrl: "https://example.com/MALICIOUS_SOURCE",
            confidence: "low",
            assumptions: ["MALICIOUS_ASSUMPTION"],
            hidden: true,
          },
        ],
      }),
    );

    expect(markdown).not.toContain("MALICIOUS_STATEMENT");
    expect(markdown).not.toContain("MALICIOUS_SOURCE");
    expect(markdown).not.toContain("MALICIOUS_ASSUMPTION");
    expect(markdown).toContain(
      "## Hipótesis a validar\n\nSin información registrada.",
    );
  });

  it("uses the empty-state sentence and omits optional meeting metadata", () => {
    const markdown = renderDossierMarkdown(
      createDossier({
        meetingId: null,
        executiveSummary: "",
        companyOverview: "",
        businessModel: "",
        conversationSummary: "",
      }),
    );

    expect(markdown).not.toContain("ID reunión:");
    expect(
      markdown.match(/Sin información registrada\./g)?.length,
    ).toBe(11);
  });

  it("preserves contact, item, and pending-question order", () => {
    const markdown = renderDossierMarkdown(
      createDossier({
        contacts: [
          { name: "Contacto Uno", role: "CEO" },
          { name: "Contacto Dos", role: "CTO" },
        ],
        recommendations: [
          {
            id: "recommendation-1",
            kind: "recommendation",
            statement: "Primera recomendación",
            confidence: "medium",
            assumptions: [],
            hidden: false,
          },
          {
            id: "recommendation-2",
            kind: "recommendation",
            statement: "Segunda recomendación",
            confidence: "medium",
            assumptions: [],
            hidden: false,
          },
        ],
        pendingQuestions: ["Primera pregunta", "Segunda pregunta"],
      }),
    );

    expect(markdown.indexOf("Contacto Uno")).toBeLessThan(
      markdown.indexOf("Contacto Dos"),
    );
    expect(markdown.indexOf("Primera recomendación")).toBeLessThan(
      markdown.indexOf("Segunda recomendación"),
    );
    expect(markdown.indexOf("Primera pregunta")).toBeLessThan(
      markdown.indexOf("Segunda pregunta"),
    );
  });

  it("escapes Markdown, HTML, links, code fences, lists, and tables in untrusted fields", () => {
    const malicious =
      "# título\nSubtítulo\n===\n[enlace](https://evil.example)\n<script>alert(1)</script>\n```js\nmal()\n```\n~~~js\nmal()\n~~~\n- nuevo ítem\n| a | b |\n> cita";
    const markdown = renderDossierMarkdown(
      createDossier({
        executiveSummary: malicious,
        contacts: [
          {
            name: "[Contacto](https://evil.example)",
            role: "<admin>",
            corporateEmail: "safe@example.com",
          },
        ],
        researchedFacts: [
          {
            id: "fact-1",
            kind: "researched_fact",
            statement: malicious,
            sourceUrl:
              "https://example.com/path?next=https://evil.example",
            confidence: "high",
            assumptions: [],
            hidden: false,
          },
        ],
        pendingQuestions: [malicious],
      }),
    );

    expect(markdown).not.toContain("\n# título");
    expect(markdown).not.toContain("[enlace](https://evil.example)");
    expect(markdown).not.toContain("<script>");
    expect(markdown).not.toContain("```");
    expect(markdown).not.toContain("\n===");
    expect(markdown).not.toContain("~~~");
    expect(markdown).not.toContain("\n- nuevo ítem");
    expect(markdown).not.toContain("| a | b |");
    expect(markdown).not.toContain("\n> cita");
    expect(markdown).not.toContain("[Contacto](https://evil.example)");
    expect(markdown).not.toContain(
      "https://example.com/path?next=https://evil.example",
    );
    expect(markdown).toContain("\\# título");
    expect(markdown).toContain(
      "\\[enlace\\]\\(https\\://evil\\.example\\)",
    );
    expect(markdown).toContain(
      "\\<script\\>alert\\(1\\)\\</script\\>",
    );
    expect(markdown).toContain("\\| a \\| b \\|");
  });

  it("is byte-deterministic and ends with exactly one newline", () => {
    const dossier = createDossier();
    const first = renderDossierMarkdown(dossier);
    const second = renderDossierMarkdown(dossier);

    expect(second).toBe(first);
    expect(first.endsWith("\n")).toBe(true);
    expect(first.endsWith("\n\n")).toBe(false);
  });

  it("matches the stable empty-dossier snapshot", () => {
    expect(
      renderDossierMarkdown(
        createDossier({
          meetingId: null,
          executiveSummary: "",
          companyOverview: "",
          businessModel: "",
          conversationSummary: "",
        }),
      ),
    ).toMatchInlineSnapshot(`
      "# Dossier previo a la reunión

      - Versión: 3
      - Fecha: 2026-06-21T12:34:56.000Z
      - ID campaña-empresa: campaign-company-1

      ## Resumen ejecutivo

      Sin información registrada.

      ## Empresa y modelo de negocio

      Sin información registrada.

      ## Contactos

      Sin información registrada.

      ## Historial / resumen de conversación

      Sin información registrada.

      ## Necesidades confirmadas

      Sin información registrada.

      ## Hechos investigados

      Sin información registrada.

      ## Hipótesis a validar

      Sin información registrada.

      ## Estimaciones

      Sin información registrada.

      ## Competidores y brechas

      Sin información registrada.

      ## Recomendaciones

      Sin información registrada.

      ## Preguntas pendientes

      Sin información registrada.
      "
    `);
  });
});

describe("renderDossierHtml", () => {
  it("renders a complete Spanish document with dossier metadata", () => {
    const html = renderDossierHtml(createDossier());

    expect(html).toContain("<!doctype html>");
    expect(html).toContain('<html lang="es">');
    expect(html).toContain("<meta charset=\"utf-8\">");
    expect(html).toContain("Dossier previo a la reunión");
    expect(html).toContain("Versión 3");
  });

  it("escapes all untrusted HTML and includes no external resources", () => {
    const html = renderDossierHtml(
      createDossier({
        campaignCompanyId: `campaign-company-"'><script>bad()</script>`,
        executiveSummary:
          `<img src=x onerror="bad()"><script>bad()</script>&"'`,
        contacts: [
          {
            name: `<svg onload="bad()">`,
            role: `CEO & "admin"`,
            corporateEmail: "safe@example.com",
          },
        ],
        researchedFacts: [
          {
            id: "fact-1",
            kind: "researched_fact",
            statement: `<a href="javascript:bad()">malicioso</a>`,
            sourceUrl:
              "https://example.com/path?quote=%22&next=%3Cbad%3E",
            confidence: "high",
            assumptions: [`<style>body{display:none}</style>`],
            hidden: false,
          },
        ],
      }),
    );

    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<svg");
    expect(html).not.toContain("<style>body");
    expect(html).not.toContain('href="javascript:');
    expect(html).toContain("&lt;script&gt;bad()&lt;/script&gt;");
    expect(html).toContain("&amp;");
    expect(html).toContain("&quot;");
    expect(html).toContain("&#39;");
    expect(html).toContain(
      'href="https://example.com/path?quote=%22&amp;next=%3Cbad%3E"',
    );
    expect(html).not.toMatch(/<(?:script|link|img|iframe)\b/i);
  });

  it("uses the shared semantic view, omits hidden items, and preserves order", () => {
    const dossier = createDossier({
      confirmedNeeds: [
        {
          id: "need-1",
          kind: "confirmed_by_prospect",
          statement: "Primera necesidad",
          confidence: "high",
          assumptions: [],
          hidden: false,
        },
      ],
      hypotheses: [
        {
          id: "hidden-1",
          kind: "hypothesis",
          statement: "CONTENIDO OCULTO",
          confidence: "low",
          assumptions: ["SUPUESTO OCULTO"],
          hidden: true,
        },
      ],
      recommendations: [
        {
          id: "recommendation-1",
          kind: "recommendation",
          statement: "Primera recomendación",
          confidence: "medium",
          assumptions: [],
          hidden: false,
        },
        {
          id: "recommendation-2",
          kind: "recommendation",
          statement: "Segunda recomendación",
          confidence: "low",
          assumptions: [],
          hidden: false,
        },
      ],
    });

    const view = buildDossierExportView(dossier);
    const html = renderDossierHtml(dossier);

    expect(view.version).toBe(3);
    expect(view.createdAt).toBe("2026-06-21T12:34:56.000Z");
    expect(view.sections.map((section) => section.title)).toEqual([
      "Necesidades confirmadas",
      "Hechos investigados",
      "Hipótesis a validar",
      "Estimaciones",
      "Competidores y brechas",
      "Recomendaciones",
    ]);
    expect(view.sections[2]?.items).toEqual([]);
    expect(html).not.toContain("CONTENIDO OCULTO");
    expect(html).not.toContain("SUPUESTO OCULTO");
    expect(html).toContain("Confirmado por el prospecto");
    expect(html).toContain("Recomendación");
    expect(html).toContain("Confianza: alta");
    expect(html).toContain("Confianza: media");
    expect(html).toContain("Confianza: baja");
    expect(html).toContain("Sin información registrada.");
    expect(html.indexOf("Primera recomendación")).toBeLessThan(
      html.indexOf("Segunda recomendación"),
    );
    expect(renderDossierMarkdown(dossier)).toContain(
      `- Versión: ${view.version}`,
    );
  });
});

type FakePdfPage = {
  setContent: ReturnType<typeof vi.fn>;
  pdf: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
};

function createBrowserFactory(options: {
  setContentError?: Error;
  pdfError?: Error;
} = {}) {
  const page: FakePdfPage = {
    setContent: options.setContentError
      ? vi.fn().mockRejectedValue(options.setContentError)
      : vi.fn().mockResolvedValue(undefined),
    pdf: options.pdfError
      ? vi.fn().mockRejectedValue(options.pdfError)
      : vi.fn().mockResolvedValue(Buffer.from("%PDF-mocked")),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const browser = {
    newPage: vi.fn().mockResolvedValue(page),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const factory = {
    launch: vi.fn().mockResolvedValue(browser),
  };

  return { factory, browser, page };
}

describe("renderDossierPdf", () => {
  it("propagates arbitrary browser launch errors", async () => {
    const factory = {
      launch: vi
        .fn()
        .mockRejectedValue(new Error("unexpected launch failure")),
    };

    await expect(
      renderDossierPdf(createDossier(), factory),
    ).rejects.toThrow("unexpected launch failure");
  });

  it("uses exact Chromium and A4 PDF options and returns a Buffer", async () => {
    const { factory, browser, page } = createBrowserFactory();

    const result = await renderDossierPdf(createDossier(), factory);

    expect(factory.launch).toHaveBeenCalledWith({ headless: true });
    expect(browser.newPage).toHaveBeenCalledOnce();
    expect(page.setContent).toHaveBeenCalledWith(
      expect.stringContaining("<!doctype html>"),
      { waitUntil: "load" },
    );
    expect(page.pdf).toHaveBeenCalledWith({
      format: "A4",
      printBackground: true,
      margin: {
        top: "16mm",
        right: "14mm",
        bottom: "16mm",
        left: "14mm",
      },
    });
    expect(Buffer.isBuffer(result)).toBe(true);
    expect(page.close).toHaveBeenCalledOnce();
    expect(browser.close).toHaveBeenCalledOnce();
  });

  it.each([
    ["setContent", { setContentError: new Error("content failed") }],
    ["pdf", { pdfError: new Error("pdf failed") }],
  ])("closes the page and browser when %s fails", async (_, options) => {
    const { factory, browser, page } = createBrowserFactory(options);

    await expect(
      renderDossierPdf(createDossier(), factory),
    ).rejects.toThrow();

    expect(page.close).toHaveBeenCalledOnce();
    expect(browser.close).toHaveBeenCalledOnce();
  });

  it("closes the page before closing the browser", async () => {
    let pageClosed = false;
    const page = {
      setContent: vi.fn().mockResolvedValue(undefined),
      pdf: vi.fn().mockResolvedValue(Buffer.from("%PDF-mocked")),
      close: vi.fn().mockImplementation(async () => {
        await Promise.resolve();
        pageClosed = true;
      }),
    };
    const browser = {
      newPage: vi.fn().mockResolvedValue(page),
      close: vi.fn().mockImplementation(async () => {
        if (!pageClosed) {
          throw new Error("browser closed before page");
        }
      }),
    };
    const factory = {
      launch: vi.fn().mockResolvedValue(browser),
    };

    await expect(
      renderDossierPdf(createDossier(), factory),
    ).resolves.toBeInstanceOf(Buffer);
  });
});

describe("renderDossierPdf real Chromium smoke", () => {
  function isKnownMacOsSandboxLaunchFailure(error: unknown): boolean {
    return (
      error instanceof Error &&
      error.message.includes("browserType.launch:") &&
      error.message.includes("MachPortRendezvousServer") &&
      error.message.includes("Permission denied")
    );
  }

  it(
    "renders a real PDF when local Chromium is installed",
    async ({ skip }) => {
      const smokeRequired = isPdfSmokeRequired(process.env);
      if (!existsSync(chromium.executablePath())) {
        if (smokeRequired) {
          throw new Error(
            "Playwright Chromium is required for the PDF smoke test.",
          );
        }
        skip();
        return;
      }

      let pdf: Buffer;
      try {
        pdf = await renderDossierPdf(createDossier());
      } catch (error) {
        if (
          !smokeRequired &&
          isKnownMacOsSandboxLaunchFailure(error)
        ) {
          skip();
          return;
        }
        throw error;
      }

      expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
      expect(pdf.byteLength).toBeGreaterThan(1000);

      if (process.env.DOSSIER_PDF_SMOKE_OUTPUT) {
        await writeFile(process.env.DOSSIER_PDF_SMOKE_OUTPUT, pdf);
      }
    },
  );
});

describe("PDF smoke requirement policy", () => {
  it.each([
    [{}, false],
    [{ CI: "true" }, true],
    [{ CI: "" }, true],
    [{ REQUIRE_PDF_SMOKE: "1" }, true],
    [{ REQUIRE_PDF_SMOKE: "0" }, false],
  ])("evaluates environment %j as %s", (environment, expected) => {
    expect(isPdfSmokeRequired(environment)).toBe(expected);
  });
});

function createRouteHandler(options: {
  dossier?: Dossier;
  workspaceId?: string;
  actorId?: string;
  auditRepository?: AuditRepository;
  dossierRepository?: DossierRepository;
}) {
  const dossier = options.dossier ?? createDossier();
  const dossierRepository =
    options.dossierRepository ??
    createMemoryDossierRepository(
      new Map([[dossier.id, structuredClone(dossier)]]),
    );
  const auditRepository =
    options.auditRepository ?? createMemoryAuditRepository();

  return {
    auditRepository,
    handler: createMarkdownDossierHandler({
      dossierRepository,
      auditRepository,
      async resolveRequestContext() {
        return options.workspaceId === undefined
          ? null
          : {
              workspaceId: options.workspaceId,
              actorId: options.actorId ?? "user-1",
            };
      },
    }),
  };
}

function createRequest() {
  return new Request(
    "http://localhost/api/dossiers/dossier-1/markdown",
  );
}

describe("createMarkdownDossierHandler", () => {
  it("returns 401 when request context cannot be resolved", async () => {
    const { handler } = createRouteHandler({});

    const response = await handler(createRequest(), {
      params: Promise.resolve({ id: "dossier-1" }),
    });

    expect(response.status).toBe(401);
    expect(await response.text()).not.toContain("Resumen ejecutivo");
  });

  it("returns 400 for a missing or invalid dossier id", async () => {
    const { handler } = createRouteHandler({
      workspaceId: "workspace-1",
    });

    for (const params of [{}, { id: " \r\n " }]) {
      const response = await handler(createRequest(), {
        params: Promise.resolve(params),
      });

      expect(response.status).toBe(400);
    }
  });

  it("returns 404 when the dossier is absent from the request workspace", async () => {
    const { handler } = createRouteHandler({
      workspaceId: "workspace-2",
    });

    const response = await handler(createRequest(), {
      params: Promise.resolve({ id: "dossier-1" }),
    });

    expect(response.status).toBe(404);
  });

  it("returns the exact Markdown response and appends the export audit", async () => {
    const dossier = createDossier();
    const { handler, auditRepository } = createRouteHandler({
      dossier,
      workspaceId: "workspace-1",
      actorId: "actor-9",
    });

    const response = await handler(createRequest(), {
      params: Promise.resolve({ id: dossier.id }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(
      "text/markdown; charset=utf-8",
    );
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="dossier-campaign-company-1-v3.md"',
    );
    expect(await response.text()).toBe(renderDossierMarkdown(dossier));
    expect(await auditRepository.list("workspace-1")).toEqual([
      {
        workspaceId: "workspace-1",
        actorId: "actor-9",
        action: "dossier.exported",
        entityId: "dossier-1",
        metadata: {
          format: "markdown",
          dossierId: "dossier-1",
          campaignCompanyId: "campaign-company-1",
          version: 3,
        },
      },
    ]);
  });

  it("supports synchronous Next route params", async () => {
    const { handler } = createRouteHandler({
      workspaceId: "workspace-1",
    });

    const response = await handler(createRequest(), {
      params: { id: "dossier-1" },
    });

    expect(response.status).toBe(200);
  });

  it("sanitizes malicious campaign-company ids in the attachment filename", async () => {
    const dossier = createDossier({
      campaignCompanyId:
        "../../ÁCME Corp\r\nX-Injected: yes/" + "A".repeat(100),
    });
    const { handler } = createRouteHandler({
      dossier,
      workspaceId: "workspace-1",
    });

    const response = await handler(createRequest(), {
      params: Promise.resolve({ id: dossier.id }),
    });
    const disposition = response.headers.get("Content-Disposition");

    expect(response.status).toBe(200);
    expect(disposition).toMatch(
      /^attachment; filename="dossier-[a-z0-9-]+-v3\.md"$/,
    );
    expect(disposition).not.toMatch(/[\r\n/\\:]/);
    expect(disposition?.length).toBeLessThanOrEqual(110);
  });

  it("uses empresa when the campaign-company id has no ASCII slug", async () => {
    const dossier = createDossier({ campaignCompanyId: "東京" });
    const { handler } = createRouteHandler({
      dossier,
      workspaceId: "workspace-1",
    });

    const response = await handler(createRequest(), {
      params: Promise.resolve({ id: dossier.id }),
    });

    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="dossier-empresa-v3.md"',
    );
  });

  it("returns 500 without auditing when rendering fails", async () => {
    let auditCalled = false;
    const invalidDossier = {
      ...createDossier(),
      version: 0,
    } as Dossier;
    const dossierRepository: DossierRepository = {
      ...createMemoryDossierRepository(),
      async getById() {
        return invalidDossier;
      },
    };
    const auditRepository = {
      async append() {
        auditCalled = true;
      },
      async list() {
        return [];
      },
    };
    const { handler } = createRouteHandler({
      workspaceId: "workspace-1",
      dossierRepository,
      auditRepository,
    });

    const response = await handler(createRequest(), {
      params: Promise.resolve({ id: "dossier-1" }),
    });

    expect(response.status).toBe(500);
    expect(auditCalled).toBe(false);
    expect(await response.text()).not.toContain("Dossier previo");
  });

  it("returns 500 and never returns the document when audit append fails", async () => {
    const auditRepository: AuditRepository = {
      async append() {
        throw new Error("sensitive database failure");
      },
      async list() {
        return [];
      },
    };
    const { handler } = createRouteHandler({
      workspaceId: "workspace-1",
      auditRepository,
    });

    const response = await handler(createRequest(), {
      params: Promise.resolve({ id: "dossier-1" }),
    });
    const body = await response.text();

    expect(response.status).toBe(500);
    expect(response.headers.get("Content-Type")).not.toBe(
      "text/markdown; charset=utf-8",
    );
    expect(body).not.toContain("Dossier previo");
    expect(body).not.toContain("sensitive database failure");
  });
});

function createPdfRouteHandler(options: {
  dossier?: Dossier;
  workspaceId?: string;
  actorId?: string;
  auditRepository?: AuditRepository;
  dossierRepository?: DossierRepository;
  renderPdf?: (dossier: Dossier) => Promise<Buffer>;
}) {
  const dossier = options.dossier ?? createDossier();
  const dossierRepository =
    options.dossierRepository ??
    createMemoryDossierRepository(
      new Map([[dossier.id, structuredClone(dossier)]]),
    );
  const auditRepository =
    options.auditRepository ?? createMemoryAuditRepository();
  const renderPdf =
    options.renderPdf ??
    vi.fn().mockResolvedValue(Buffer.from("%PDF-route-body"));

  return {
    auditRepository,
    renderPdf,
    handler: createPdfDossierHandler({
      dossierRepository,
      auditRepository,
      renderPdf,
      async resolveRequestContext() {
        return options.workspaceId === undefined
          ? null
          : {
              workspaceId: options.workspaceId,
              actorId: options.actorId ?? "user-1",
            };
      },
    }),
  };
}

function createPdfRequest() {
  return new Request("http://localhost/api/dossiers/dossier-1/pdf");
}

describe("createPdfDossierHandler", () => {
  it.each([
    ["unauthorized", undefined, { id: "dossier-1" }, 401],
    ["invalid id", "workspace-1", { id: " \r\n " }, 400],
    ["wrong workspace", "workspace-2", { id: "dossier-1" }, 404],
  ])(
    "returns the expected status for %s",
    async (_, workspaceId, params, expectedStatus) => {
      const { handler, renderPdf } = createPdfRouteHandler({
        workspaceId,
      });

      const response = await handler(createPdfRequest(), {
        params: Promise.resolve(params),
      });

      expect(response.status).toBe(expectedStatus);
      expect(renderPdf).not.toHaveBeenCalled();
    },
  );

  it("returns exact PDF headers/body and appends the export audit", async () => {
    const dossier = createDossier();
    const pdf = Buffer.from("%PDF-exact-route-body");
    const renderPdf = vi.fn().mockResolvedValue(pdf);
    const { handler, auditRepository } = createPdfRouteHandler({
      dossier,
      workspaceId: "workspace-1",
      actorId: "actor-9",
      renderPdf,
    });

    const response = await handler(createPdfRequest(), {
      params: { id: dossier.id },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="dossier-campaign-company-1-v3.pdf"',
    );
    expect(response.headers.get("Content-Length")).toBe(
      String(pdf.byteLength),
    );
    expect(
      Buffer.from(await response.arrayBuffer()).equals(pdf),
    ).toBe(true);
    expect(renderPdf).toHaveBeenCalledWith(dossier);
    expect(await auditRepository.list("workspace-1")).toEqual([
      {
        workspaceId: "workspace-1",
        actorId: "actor-9",
        action: "dossier.exported",
        entityId: "dossier-1",
        metadata: {
          format: "pdf",
          dossierId: "dossier-1",
          campaignCompanyId: "campaign-company-1",
          version: 3,
        },
      },
    ]);
  });

  it("sanitizes the PDF attachment filename", async () => {
    const dossier = createDossier({
      campaignCompanyId:
        "../../ÁCME Corp\r\nX-Injected: yes/" + "A".repeat(100),
    });
    const { handler } = createPdfRouteHandler({
      dossier,
      workspaceId: "workspace-1",
    });

    const response = await handler(createPdfRequest(), {
      params: Promise.resolve({ id: dossier.id }),
    });
    const disposition = response.headers.get("Content-Disposition");

    expect(disposition).toMatch(
      /^attachment; filename="dossier-[a-z0-9-]+-v3\.pdf"$/,
    );
    expect(disposition).not.toMatch(/[\r\n/\\:]/);
    expect(disposition?.length).toBeLessThanOrEqual(111);
  });

  it.each(["render", "audit"])(
    "returns 500 without a PDF document when %s fails",
    async (failure) => {
      const auditRepository: AuditRepository =
        failure === "audit"
          ? {
              async append() {
                throw new Error("sensitive audit failure");
              },
              async list() {
                return [];
              },
            }
          : createMemoryAuditRepository();
      const renderPdf =
        failure === "render"
          ? vi.fn().mockRejectedValue(new Error("sensitive PDF failure"))
          : vi.fn().mockResolvedValue(Buffer.from("%PDF-secret"));
      const { handler } = createPdfRouteHandler({
        workspaceId: "workspace-1",
        auditRepository,
        renderPdf,
      });

      const response = await handler(createPdfRequest(), {
        params: Promise.resolve({ id: "dossier-1" }),
      });
      const body = await response.text();

      expect(response.status).toBe(500);
      expect(response.headers.get("Content-Type")).not.toBe(
        "application/pdf",
      );
      expect(body).not.toContain("%PDF");
      expect(body).not.toContain("sensitive");
      expect(await auditRepository.list("workspace-1")).toEqual([]);
    },
  );
});

describe("Markdown dossier production route", () => {
  const originalEnvironment = {
    DATABASE_URL: process.env.DATABASE_URL,
    AUTH_SECRET: process.env.AUTH_SECRET,
    ALLOWED_EMAILS: process.env.ALLOWED_EMAILS,
  };

  afterEach(() => {
    for (const [name, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
    vi.resetModules();
  });

  it("loads without evaluating runtime secrets or database configuration", async () => {
    delete process.env.DATABASE_URL;
    delete process.env.AUTH_SECRET;
    delete process.env.ALLOWED_EMAILS;
    vi.resetModules();

    await expect(
      import("@/app/api/dossiers/[id]/markdown/route"),
    ).resolves.toMatchObject({
      GET: expect.any(Function),
    });
  });
});

describe("PDF dossier production route", () => {
  const originalEnvironment = {
    DATABASE_URL: process.env.DATABASE_URL,
    AUTH_SECRET: process.env.AUTH_SECRET,
    ALLOWED_EMAILS: process.env.ALLOWED_EMAILS,
  };

  afterEach(() => {
    for (const [name, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
    vi.resetModules();
  });

  it("loads without evaluating runtime secrets or database configuration", async () => {
    delete process.env.DATABASE_URL;
    delete process.env.AUTH_SECRET;
    delete process.env.ALLOWED_EMAILS;
    vi.resetModules();

    await expect(
      import("@/app/api/dossiers/[id]/pdf/route"),
    ).resolves.toMatchObject({
      GET: expect.any(Function),
    });
  });
});
