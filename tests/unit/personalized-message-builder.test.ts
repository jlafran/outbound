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

  it("does not create a personalized message without specific evidence", () => {
    expect(
      buildPersonalizedMessage({
        companyName: "Clínica Sin Evidencia",
        decisionMaker: null,
        signal: null,
      }),
    ).toBeNull();
  });
});
