import { describe, expect, it } from "vitest";

import { buildPersonalizedMessage } from "@/features/prospecting/personalized-message-builder";

describe("buildPersonalizedMessage", () => {
  it("builds a draft from a cited official signal and labels the problem as a hypothesis", () => {
    const result = buildPersonalizedMessage({
      companyName: "Clínica Sonrisa",
      decisionMaker: { name: "Ana Pérez", role: "Directora odontológica" },
      signal: {
        kind: "whatsapp_booking",
        statement: "El sitio oficial ofrece turnos por WhatsApp.",
        sourceUrl: "https://clinica.com.ar/contacto",
        confidence: "high",
      },
    });

    expect(result).not.toBeNull();
    expect(result?.body.startsWith("Hola Ana, vi que Clínica Sonrisa ofrece turnos o consultas por WhatsApp.")).toBe(true);
    expect(result?.body).toContain("podría");
    expect(result?.body).not.toContain("están perdiendo pacientes");
    expect(result?.evidenceUrls).toEqual(["https://clinica.com.ar/contacto"]);
  });

  it("does not create a personalized message without a named decision maker or evidence", () => {
    expect(
      buildPersonalizedMessage({
        companyName: "Clínica Sin Evidencia",
        decisionMaker: null,
        signal: null,
      }),
    ).toBeNull();
    expect(
      buildPersonalizedMessage({
        companyName: "Distribuidora Sin Decisor",
        decisionMaker: null,
        signal: {
          kind: "industrial_distribution",
          statement: "El sitio oficial comunica catálogo industrial.",
          sourceUrl: "https://distribuidora.com.ar/catalogo",
          confidence: "high",
        },
      }),
    ).toBeNull();
  });

  it("builds industrial outbound copy from distribution evidence", () => {
    const result = buildPersonalizedMessage({
      companyName: "Distribuidora Norte",
      decisionMaker: { name: "María Gómez", role: "Gerente comercial" },
      signal: {
        kind: "industrial_distribution",
        statement: "El sitio oficial comunica catálogo industrial.",
        sourceUrl: "https://distribuidoranorte.com.ar/catalogo",
        confidence: "high",
      },
    });

    expect(result?.subject).toContain("Nuevos clientes B2B");
    expect(result?.body).toContain("nuevos clientes B2B");
    expect(result?.body).toContain("podría");
  });
});
