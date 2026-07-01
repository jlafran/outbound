import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vitest";

import { ProspectingLeadEnrichment } from "@/app/(app)/campaigns/[id]/prospecting-test/prospecting-lead-enrichment";
import type { ProspectingLead } from "@/features/prospecting/prospecting-types";

describe("ProspectingLeadEnrichment", () => {
  it("renders official research, score, recommended contact and message evidence", () => {
    const lead = {
      companyName: "Clínica Sonrisa",
      domain: "clinica.com.ar",
      websiteUrl: "https://clinica.com.ar",
      status: "actionable",
      score: 95,
      decisionMakers: [],
      contacts: {
        emails: [],
        emailCandidates: [
          {
            email: "ana@clinica.com.ar",
            source: "official_website",
            verificationStatus: "unverified",
          },
          {
            email: "aperez@clinica.com.ar",
            source: "pattern",
            verificationStatus: "unknown",
            verificationProvider: "no2bounce",
          },
        ],
        phones: [],
        whatsapps: [],
      },
      opportunitySignals: [],
      evidence: [],
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
          emails: ["ana@clinica.com.ar"],
          phones: [],
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
            statement: "Ofrece turnos por WhatsApp.",
            sourceUrl: "https://clinica.com.ar/contacto",
            confidence: "high",
          },
        ],
        errors: [],
      },
      scoreBreakdown: {
        total: 95,
        components: {
          companyValidation: 20,
          offerFit: 15,
          decisionMaker: 20,
          directChannel: 15,
          verifiedEmail: 15,
          opportunitySignal: 5,
          sourceQuality: 5,
        },
        penalties: [],
        reasons: [],
      },
      recommendedContact: {
        name: "Ana Pérez",
        role: "Directora odontológica",
        channel: "email",
        value: "ana@clinica.com.ar",
        confidence: "high",
        sourceUrl: "https://clinica.com.ar/equipo",
      },
      messageDraft: {
        subject: "Seguimiento de consultas",
        body: "Hola Ana, vi que ofrecen turnos por WhatsApp.",
        cta: "¿Tiene sentido verlo 15 minutos?",
        evidenceUrls: ["https://clinica.com.ar/contacto"],
        confidence: "high",
        warnings: ["Validar la hipótesis."],
      },
    } satisfies ProspectingLead;

    const html = renderToStaticMarkup(
      createElement(ProspectingLeadEnrichment, { lead }),
    );

    expect(html).toContain("Research del sitio oficial");
    expect(html).toContain("Ana Pérez");
    expect(html).toContain("companyValidation: 20");
    expect(html).toContain("ana@clinica.com.ar");
    expect(html).toContain("Hola Ana, vi que ofrecen turnos por WhatsApp.");
    expect(html).toContain("https://clinica.com.ar/contacto");
    expect(html).toContain("Tomado de web oficial");
    expect(html).toContain("Sin verificación externa");
    expect(html).toContain("No verificado todavía");
    expect(html).not.toContain("unknown");
  });
});
