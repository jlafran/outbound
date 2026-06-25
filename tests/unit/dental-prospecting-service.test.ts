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
});
