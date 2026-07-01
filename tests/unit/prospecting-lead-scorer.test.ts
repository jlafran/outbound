import { describe, expect, it } from "vitest";

import { scoreProspectingLead } from "@/features/prospecting/prospecting-lead-scorer";

describe("scoreProspectingLead", () => {
  it("returns an explainable actionable score for a complete lead", () => {
    const result = scoreProspectingLead({
      companyValidated: true,
      offerFitEvidenceCount: 2,
      decisionMakerConfidences: ["high"],
      hasPersonalEmail: true,
      hasWhatsapp: true,
      hasGenericEmail: true,
      emailVerificationStatuses: ["valid"],
      opportunitySignalCount: 2,
      sourceUrls: [
        "https://clinica.com.ar/equipo",
        "https://clinica.com.ar/contacto",
        "https://linkedin.com/in/ana",
      ],
      flags: [],
    });

    expect(result.status).toBe("actionable");
    expect(result.total).toBeGreaterThanOrEqual(90);
    expect(result.components).toEqual({
      companyValidation: 20,
      offerFit: 15,
      decisionMaker: 20,
      directChannel: 15,
      verifiedEmail: 15,
      opportunitySignal: 10,
      sourceQuality: 5,
    });
  });

  it("never marks a lead actionable without an associated decision maker", () => {
    const result = scoreProspectingLead({
      companyValidated: true,
      offerFitEvidenceCount: 3,
      decisionMakerConfidences: [],
      hasPersonalEmail: true,
      hasWhatsapp: true,
      hasGenericEmail: true,
      emailVerificationStatuses: ["valid"],
      opportunitySignalCount: 3,
      sourceUrls: ["https://clinica.com.ar", "https://clinica.com.ar/contacto"],
      flags: [],
    });

    expect(result.status).toBe("review");
    expect(result.reasons).toContain("Falta un decisor asociado con confianza suficiente.");
  });

  it("credits official website emails without requiring external verification", () => {
    const result = scoreProspectingLead({
      companyValidated: true,
      offerFitEvidenceCount: 2,
      decisionMakerConfidences: ["high"],
      hasPersonalEmail: true,
      hasWhatsapp: false,
      hasGenericEmail: false,
      emailVerificationStatuses: ["official_website"],
      opportunitySignalCount: 1,
      sourceUrls: ["https://clinica.com.ar/equipo"],
      flags: [],
    });

    expect(result.components.verifiedEmail).toBe(12);
    expect(result.status).toBe("actionable");
  });

  it("applies explicit penalties and discards an ambiguous content result", () => {
    const result = scoreProspectingLead({
      companyValidated: false,
      offerFitEvidenceCount: 1,
      decisionMakerConfidences: ["low"],
      hasPersonalEmail: false,
      hasWhatsapp: false,
      hasGenericEmail: false,
      emailVerificationStatuses: [],
      opportunitySignalCount: 0,
      sourceUrls: ["https://example.com/blog/clinicas"],
      flags: ["editorial", "ambiguous"],
    });

    expect(result.status).toBe("discarded");
    expect(result.penalties).toEqual(
      expect.arrayContaining([
        { label: "Contenido editorial", value: -20 },
        { label: "Identidad empresarial ambigua", value: -15 },
      ]),
    );
  });
});
