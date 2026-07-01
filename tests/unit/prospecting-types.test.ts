import { describe, expect, it } from "vitest";

import { prospectingEnrichmentSchema } from "@/features/prospecting/prospecting-types";

describe("prospecting enrichment types", () => {
  it("parses an auditable enriched lead payload", () => {
    const parsed = prospectingEnrichmentSchema.parse({
      websiteResearch: {
        status: "completed",
        pages: [
          {
            requestedUrl: "https://clinica.com.ar/equipo",
            finalUrl: "https://clinica.com.ar/equipo",
            status: "fetched",
            title: "Equipo",
          },
        ],
        contacts: {
          emails: ["direccion@clinica.com.ar"],
          phones: ["5491123456789"],
          whatsapps: ["5491123456789"],
          linkedinUrls: [],
          instagramUrls: [],
        },
        people: [
          {
            name: "Ana Pérez",
            role: "Directora odontológica",
            sourceUrl: "https://clinica.com.ar/equipo",
          },
        ],
        services: ["Implantes"],
        signals: [
          {
            kind: "whatsapp_booking",
            statement: "La clínica ofrece turnos por WhatsApp.",
            sourceUrl: "https://clinica.com.ar/contacto",
            confidence: "high",
          },
        ],
        errors: [],
      },
      scoreBreakdown: {
        total: 86,
        components: {
          companyValidation: 20,
          offerFit: 14,
          decisionMaker: 18,
          directChannel: 14,
          verifiedEmail: 10,
          opportunitySignal: 7,
          sourceQuality: 3,
        },
        penalties: [],
        reasons: ["Decisor confirmado en el sitio oficial."],
      },
      recommendedContact: {
        name: "Ana Pérez",
        role: "Directora odontológica",
        channel: "email",
        value: "direccion@clinica.com.ar",
        confidence: "high",
        sourceUrl: "https://clinica.com.ar/equipo",
      },
      messageDraft: {
        subject: "Seguimiento de turnos en Clínica",
        body: "Vi que ofrecen turnos por WhatsApp.",
        cta: "¿Tiene sentido verlo 15 minutos?",
        evidenceUrls: ["https://clinica.com.ar/contacto"],
        confidence: "high",
        warnings: [],
      },
    });

    expect(parsed.scoreBreakdown.total).toBe(86);
    expect(parsed.websiteResearch.people[0].name).toBe("Ana Pérez");
  });
});
