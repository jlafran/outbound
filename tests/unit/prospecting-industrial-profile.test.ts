import { describe, expect, it } from "vitest";

import {
  buildIndustrialDistributorQueries,
  classifyProspectingResult,
  extractDecisionMakerFromResult,
  hasIndustrialOpportunitySignal,
  passesIndustrialSizeGate,
} from "@/features/prospecting/dental-aesthetics-profile";

describe("industrial distributor prospecting profile", () => {
  it("builds separate searches for companies, decision makers and evidence", () => {
    const queries = buildIndustrialDistributorQueries();

    expect(queries.company).toEqual(
      expect.arrayContaining([
        '"distribuidora industrial" Argentina "sucursales"',
        '"insumos industriales" "Argentina" "mayorista"',
      ]),
    );
    expect(queries.decisionMakerRoles).toEqual(
      expect.arrayContaining([
        "gerente comercial",
        "gerente de ventas",
        "director comercial",
      ]),
    );
    expect(queries.evidenceTerms).toEqual(
      expect.arrayContaining(["sucursales", "marcas representadas", "catálogo"]),
    );
  });

  it("classifies industrial B2B distributors separately from directories, retail and editorial noise", () => {
    expect(
      classifyProspectingResult({
        title: "Distribuidora Norte | Insumos industriales y EPP",
        url: "https://distribuidoranorte.com.ar/empresa",
        description:
          "Mayorista de herramientas, seguridad industrial y abastecimiento para empresas con sucursales en Argentina.",
        domain: "distribuidoranorte.com.ar",
      }),
    ).toMatchObject({ kind: "company_candidate", useful: true });

    expect(
      classifyProspectingResult({
        title: "Las 10 mejores herramientas para el taller",
        url: "https://example.com/blog/herramientas-taller",
        description: "Guía editorial de herramientas.",
        domain: "example.com",
      }),
    ).toMatchObject({ kind: "irrelevant", useful: false });

    expect(
      classifyProspectingResult({
        title: "Cámara Argentina de Seguridad Industrial",
        url: "https://camara.example.org",
        description: "Asociación y cámara del sector.",
        domain: "camara.example.org",
      }),
    ).toMatchObject({ kind: "source_only", useful: false });

    expect(
      classifyProspectingResult({
        title: "Tienda minorista de herramientas",
        url: "https://tiendaherramientas.com.ar",
        description: "Compra online una pinza para tu casa con envío minorista.",
        domain: "tiendaherramientas.com.ar",
      }),
    ).toMatchObject({ kind: "irrelevant", useful: false });
  });

  it("extracts approved commercial decision makers from public result text", () => {
    expect(
      extractDecisionMakerFromResult({
        title: "María Gómez - Gerente Comercial en Distribuidora Norte",
        url: "https://www.linkedin.com/in/maria-gomez-industrial",
        description:
          "Gerente comercial de Distribuidora Norte, mayorista de insumos industriales.",
        domain: "linkedin.com",
      }),
    ).toMatchObject({
      name: "María Gómez",
      role: "Gerente comercial",
      confidence: "medium",
    });
  });

  it("extracts decision makers when the name is in the snippet instead of the result title", () => {
    expect(
      extractDecisionMakerFromResult({
        title: "Gerente Comercial en Suministros Oeste | LinkedIn",
        url: "https://www.linkedin.com/in/carlos-ramos-industrial",
        description:
          "Carlos Ramos es gerente comercial en Suministros Oeste, distribuidor de insumos industriales.",
        domain: "linkedin.com",
      }),
    ).toMatchObject({
      name: "Carlos Ramos",
      role: "Gerente comercial",
      confidence: "medium",
      companyEvidence: expect.stringContaining("Suministros Oeste"),
    });
  });

  it("requires confirmed size evidence before a company can pass the industrial gate", () => {
    expect(
      passesIndustrialSizeGate({ employeeCount: 50, branchCount: undefined }),
    ).toMatchObject({ passes: true, reason: "50+ empleados confirmados" });
    expect(
      passesIndustrialSizeGate({ employeeCount: undefined, branchCount: 3 }),
    ).toMatchObject({ passes: true, reason: "3+ sucursales confirmadas" });
    expect(
      passesIndustrialSizeGate({ employeeCount: undefined, branchCount: 2 }),
    ).toMatchObject({ passes: false });
  });

  it("detects outbound-growth opportunity signals for industrial distributors", () => {
    expect(
      hasIndustrialOpportunitySignal({
        title: "Distribuidora Norte incorpora nueva sucursal",
        url: "https://distribuidoranorte.com.ar/noticias/nueva-sucursal",
        description:
          "La empresa amplía su catálogo de EPP y herramientas para nuevas industrias clientes.",
        domain: "distribuidoranorte.com.ar",
      }),
    ).toBe(true);
  });
});
