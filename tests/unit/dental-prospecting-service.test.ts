import { describe, expect, it, vi } from "vitest";

import { DentalAestheticsProspectingService } from "@/features/prospecting/dental-prospecting-service";
import type { ProspectingSearchClient } from "@/features/prospecting/prospecting-types";

describe("DentalAestheticsProspectingService", () => {
  it("uses the industrial distributor profile for the active production prospecting test", async () => {
    const queries: string[] = [];
    const searchClient: ProspectingSearchClient = {
      searchWeb: vi.fn(async ({ query }) => {
        queries.push(query);
        if (query.includes("Distribuidora Norte")) {
          return [
            {
              title: "María Gómez - Gerente Comercial en Distribuidora Norte",
              url: "https://www.linkedin.com/in/maria-gomez-industrial",
              description:
                "Gerente comercial de Distribuidora Norte, mayorista de insumos industriales.",
              domain: "linkedin.com",
            },
          ];
        }
        return [
          {
            title: "Distribuidora Norte | Insumos industriales y EPP",
            url: "https://distribuidoranorte.com.ar/empresa",
            description:
              "Mayorista de herramientas, seguridad industrial y abastecimiento para empresas con sucursales en Argentina.",
            domain: "distribuidoranorte.com.ar",
          },
        ];
      }),
    };
    const service = new DentalAestheticsProspectingService({
      searchClient,
      maxCompanies: 1,
      websiteCrawler: {
        async crawl() {
          return {
            pages: [
              {
                requestedUrl: "https://distribuidoranorte.com.ar/empresa",
                finalUrl: "https://distribuidoranorte.com.ar/empresa",
                status: "fetched" as const,
                html: `
                  <meta property="og:site_name" content="Distribuidora Norte">
                  <h1>Distribuidora Norte</h1>
                  <p>Mayorista de insumos industriales, herramientas, EPP y seguridad industrial.</p>
                  <p>Contamos con 3 sucursales y catálogo para empresas industriales.</p>
                  <a href="mailto:ventas@distribuidoranorte.com.ar">Ventas</a>
                `,
              },
            ],
          };
        },
      },
    });

    const result = await service.run();

    expect(queries[0]).toContain("distribuidora industrial");
    expect(queries).toEqual(
      expect.arrayContaining([
        expect.stringContaining('"Distribuidora Norte" "gerente comercial"'),
      ]),
    );
    expect(result.leads[0]).toMatchObject({
      companyName: "Distribuidora Norte",
      domain: "distribuidoranorte.com.ar",
      decisionMakers: [
        expect.objectContaining({
          name: "María Gómez",
          role: "Gerente comercial",
        }),
      ],
    });
    expect(result.leads[0].messageDraft?.body).toContain("nuevos clientes B2B");
  });

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
    const verify = vi.fn(async (email: string) => ({
      status: email.startsWith("mariana.lopez")
        ? ("valid" as const)
        : ("unknown" as const),
      provider: "no2bounce" as const,
      trackingId: `tracking:${email}`,
    }));
    const service = new DentalAestheticsProspectingService({
      searchClient,
      maxCompanies: 1,
      emailVerifier: { verify },
      websiteCrawler: {
        async crawl() {
          return {
            pages: [
              {
                requestedUrl: "https://clinicadentalpalermo.com.ar/equipo",
                finalUrl: "https://clinicadentalpalermo.com.ar/equipo",
                status: "fetched" as const,
                html: `
                  <meta property="og:site_name" content="Clínica Odontológica Palermo">
                  <section class="team-member">
                    <h2>Dra. Mariana López</h2>
                    <p>Directora odontológica</p>
                    <a href="mailto:mariana.lopez@clinicadentalpalermo.com.ar">Email</a>
                  </section>
                  <p>Implantes y ortodoncia invisible.</p>
                  <a href="https://wa.me/5491123456789">Pedí tu turno por WhatsApp</a>
                `,
              },
            ],
          };
        },
      },
    });

    const result = await service.run();

    expect(result.leads).toHaveLength(1);
    expect(result.leads[0]).toMatchObject({
      companyName: "Clínica Odontológica Palermo",
      domain: "clinicadentalpalermo.com.ar",
      status: "review",
      decisionMakers: [
        {
          name: "Mariana López",
          role: "Directora odontológica",
        },
      ],
      contacts: {
        emails: [
          "recepcion@clinicadentalpalermo.com.ar",
          "mariana.lopez@clinicadentalpalermo.com.ar",
        ],
        emailCandidates: [
          {
            email: "mariana.lopez@clinicadentalpalermo.com.ar",
            source: "official_website",
            verificationStatus: "unverified",
            confidence: 95,
          },
          {
            email: "mlopez@clinicadentalpalermo.com.ar",
            source: "pattern",
            verificationStatus: "unknown",
            verificationProvider: "no2bounce",
            verificationTrackingId: "tracking:mlopez@clinicadentalpalermo.com.ar",
          },
          {
            email: "mariana@clinicadentalpalermo.com.ar",
            source: "pattern",
            verificationStatus: "unknown",
            verificationProvider: "no2bounce",
            verificationTrackingId:
              "tracking:mariana@clinicadentalpalermo.com.ar",
          },
        ],
        whatsapps: ["5491123456789"],
      },
    });
    expect(result.leads[0].websiteResearch?.people[0].name).toBe("Mariana López");
    expect(result.leads[0].scoreBreakdown?.components.decisionMaker).toBe(20);
    expect(result.leads[0].messageDraft?.evidenceUrls).toEqual([
      "https://clinicadentalpalermo.com.ar/equipo",
    ]);
    expect(result.leads[0].recommendedContact).toMatchObject({
      name: "Mariana López",
      channel: "email",
      value: "mariana.lopez@clinicadentalpalermo.com.ar",
    });
    expect(verify).toHaveBeenCalledTimes(2);
    expect(verify).not.toHaveBeenCalledWith(
      "mariana.lopez@clinicadentalpalermo.com.ar",
    );
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

  it("does not spend verifier credits on emails copied from the official website", async () => {
    const searchClient: ProspectingSearchClient = {
      searchWeb: vi.fn(async ({ query }) =>
        query.includes("site:linkedin.com/in")
          ? []
          : [
              {
                title: "Clínica Web Oficial",
                url: "https://clinicaweb.com.ar",
                description: "Implantes y contacto por email.",
                domain: "clinicaweb.com.ar",
              },
            ],
      ),
    };
    const verify = vi.fn(async () => ({
      status: "valid" as const,
      provider: "no2bounce" as const,
    }));
    const service = new DentalAestheticsProspectingService({
      searchClient,
      maxCompanies: 1,
      emailVerifier: { verify },
      websiteCrawler: {
        async crawl() {
          return {
            pages: [
              {
                requestedUrl: "https://clinicaweb.com.ar/equipo",
                finalUrl: "https://clinicaweb.com.ar/equipo",
                status: "fetched" as const,
                html: `
                  <section class="team">
                    <h2>Dra. Paula Ruiz</h2>
                    <p>Fundadora</p>
                    <a href="mailto:paula.ruiz@clinicaweb.com.ar">Email</a>
                  </section>
                  <p>Implantes dentales.</p>
                `,
              },
            ],
          };
        },
      },
    });

    const result = await service.run();

    expect(verify).not.toHaveBeenCalledWith("paula.ruiz@clinicaweb.com.ar");
    expect(result.leads[0].contacts.emailCandidates).toContainEqual(
      expect.objectContaining({
        email: "paula.ruiz@clinicaweb.com.ar",
        source: "official_website",
        verificationStatus: "unverified",
      }),
    );
  });

  it("keeps public LinkedIn people out of rejected trash when they are associated", async () => {
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
      websiteCrawler: {
        async crawl() {
          return {
            pages: [
              {
                requestedUrl: "https://clinicaescribano.com.ar",
                finalUrl: "https://clinicaescribano.com.ar",
                status: "fetched" as const,
                html: "<main>Clínica dental con turnos por WhatsApp.</main>",
              },
            ],
          };
        },
      },
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
    expect(result.unassociatedDecisionMakers).toEqual([]);
  });

  it("continues researching other companies when one official site fails", async () => {
    const searchClient: ProspectingSearchClient = {
      searchWeb: vi.fn(async ({ query }) =>
        query.includes("site:linkedin.com/in")
          ? []
          : [
              {
                title: "Clínica Uno",
                url: "https://uno.com.ar",
                description: "Clínica odontológica",
                domain: "uno.com.ar",
              },
              {
                title: "Clínica Dos",
                url: "https://dos.com.ar",
                description: "Clínica odontológica",
                domain: "dos.com.ar",
              },
            ],
      ),
    };
    const service = new DentalAestheticsProspectingService({
      searchClient,
      maxCompanies: 2,
      websiteCrawler: {
        async crawl({ domain }: { domain: string }) {
          if (domain === "uno.com.ar") throw new Error("timeout");
          return {
            pages: [
              {
                requestedUrl: "https://dos.com.ar",
                finalUrl: "https://dos.com.ar",
                status: "fetched" as const,
                html: "<main>Clínica odontológica con implantes.</main>",
              },
            ],
          };
        },
      },
    });

    const result = await service.run();

    expect(result.leads).toHaveLength(2);
    expect(result.leads.find(({ domain }) => domain === "uno.com.ar")?.websiteResearch?.status).toBe("failed");
    expect(result.leads.find(({ domain }) => domain === "dos.com.ar")?.websiteResearch?.status).toBe("completed");
  });
});
