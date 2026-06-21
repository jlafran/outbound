import { afterEach, describe, expect, it, vi } from "vitest";

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
