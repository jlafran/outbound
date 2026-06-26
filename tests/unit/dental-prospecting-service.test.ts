import { describe, expect, it, vi } from "vitest";

import { DentalAestheticsProspectingService } from "@/features/prospecting/dental-prospecting-service";
import type { ProspectingSearchClient } from "@/features/prospecting/prospecting-types";

describe("DentalAestheticsProspectingService", () => {
  it("turns Brave results into scored actionable company leads with decision makers", async () => {
    const searchClient: ProspectingSearchClient = {
      searchWeb: vi.fn(async ({ query }) => {
        if (query.includes("site:linkedin.com/in")) {
          return [
            {
              title:
                "Dra. Mariana López - Directora Clínica Odontológica Palermo",
              url: "https://www.linkedin.com/in/mariana-lopez-odontologia",
              description:
                "Directora odontológica y fundadora de Clínica Odontológica Palermo.",
              domain: "linkedin.com",
            },
          ];
        }

        return [
          {
            title: "Clínica Odontológica Palermo | Estética dental",
            url: "https://clinicadentalpalermo.com.ar/contacto",
            description:
              "Implantes, ortodoncia invisible y estética dental. Turnos por WhatsApp +54 9 11 2345-6789 o recepcion@clinicadentalpalermo.com.ar.",
            domain: "clinicadentalpalermo.com.ar",
          },
          {
            title: "Las mejores clínicas odontológicas de Buenos Aires",
            url: "https://example.com/blog/mejores-clinicas",
            description: "Ranking y guía.",
            domain: "example.com",
          },
        ];
      }),
    };
    const service = new DentalAestheticsProspectingService({
      searchClient,
      maxCompanies: 1,
      emailVerifier: {
        async verify(email) {
          return {
            status: email.startsWith("mariana.lopez")
              ? "valid"
              : "unknown",
          };
        },
      },
    });

    const result = await service.run();

    expect(result.leads).toHaveLength(1);
    expect(result.leads[0]).toMatchObject({
      companyName: "Clínica Odontológica Palermo",
      domain: "clinicadentalpalermo.com.ar",
      status: "actionable",
      decisionMakers: [
        {
          name: "Mariana López",
          role: "Directora odontológica",
        },
      ],
      contacts: {
        emails: ["recepcion@clinicadentalpalermo.com.ar"],
        emailCandidates: [
          {
            email: "mariana.lopez@clinicadentalpalermo.com.ar",
            source: "pattern",
            verificationStatus: "valid",
          },
          {
            email: "mlopez@clinicadentalpalermo.com.ar",
            source: "pattern",
            verificationStatus: "unknown",
          },
          {
            email: "mariana@clinicadentalpalermo.com.ar",
            source: "pattern",
            verificationStatus: "unknown",
          },
        ],
        whatsapps: ["5491123456789"],
      },
    });
    expect(result.leads[0].score).toBeGreaterThanOrEqual(85);
    expect(result.rejected).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          domain: "example.com",
          kind: "irrelevant",
        }),
      ]),
    );
  });

  it("keeps public LinkedIn people as unassociated decision makers instead of rejected trash", async () => {
    const searchClient: ProspectingSearchClient = {
      searchWeb: vi.fn(async ({ query }) => {
        if (query.includes("site:linkedin.com/in")) {
          return [
            {
              title: "Daniel Escribano - Director médico",
              url: "https://www.linkedin.com/in/daniel-escribano",
              description:
                "Director médico en Clínica Odontológica Daniel Escribano.",
              domain: "linkedin.com",
            },
          ];
        }
        return [
          {
            title: "Clínica Odontológica Daniel Escribano",
            url: "https://clinicaescribano.com.ar",
            description: "Clínica dental con turnos por WhatsApp.",
            domain: "clinicaescribano.com.ar",
          },
        ];
      }),
    };
    const service = new DentalAestheticsProspectingService({
      searchClient,
      maxCompanies: 10,
    });

    const result = await service.run();

    expect(result.leads[0].decisionMakers).toEqual([
      expect.objectContaining({
        name: "Daniel Escribano",
        linkedinUrl: "https://www.linkedin.com/in/daniel-escribano",
      }),
    ]);
    expect(result.rejected).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "person_candidate" }),
      ]),
    );
    expect(result.unassociatedDecisionMakers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Daniel Escribano",
          linkedinUrl: "https://www.linkedin.com/in/daniel-escribano",
        }),
      ]),
    );
  });
});
