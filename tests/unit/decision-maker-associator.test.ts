import { describe, expect, it } from "vitest";

import { associateDecisionMakers } from "@/features/prospecting/decision-maker-associator";

describe("associateDecisionMakers", () => {
  it("assigns high confidence to a decision maker published by the official site", () => {
    const result = associateDecisionMakers({
      companyName: "Clínica Sonrisa",
      domain: "clinica.com.ar",
      websitePeople: [
        {
          name: "Ana Pérez",
          role: "Directora odontológica",
          sourceUrl: "https://clinica.com.ar/equipo",
        },
      ],
      searchPeople: [],
    });

    expect(result.associated).toEqual([
      expect.objectContaining({
        name: "Ana Pérez",
        confidence: "high",
        associationReason: "Cargo publicado en el sitio oficial de la empresa.",
      }),
    ]);
  });

  it("associates a public profile when it names the distinctive company", () => {
    const result = associateDecisionMakers({
      companyName: "Clínica Sonrisa",
      domain: "clinica.com.ar",
      websitePeople: [],
      searchPeople: [
        {
          name: "Ana Pérez",
          role: "Fundador/a",
          sourceUrl: "https://linkedin.com/in/ana-perez",
          linkedinUrl: "https://linkedin.com/in/ana-perez",
          confidence: "low",
          companyEvidence:
            "Ana Pérez, fundadora de Clínica Sonrisa en Buenos Aires.",
        },
      ],
    });

    expect(result.associated[0]).toMatchObject({
      name: "Ana Pérez",
      confidence: "medium",
    });
    expect(result.unassociated).toEqual([]);
  });

  it("does not associate a role-only homonym without company evidence", () => {
    const person = {
      name: "Ana Pérez",
      role: "Directora odontológica",
      sourceUrl: "https://linkedin.com/in/otra-ana",
      linkedinUrl: "https://linkedin.com/in/otra-ana",
      confidence: "low" as const,
      companyEvidence: "Directora odontológica con 15 años de experiencia.",
    };
    const result = associateDecisionMakers({
      companyName: "Clínica Sonrisa",
      domain: "clinica.com.ar",
      websitePeople: [],
      searchPeople: [person],
    });

    expect(result.associated).toEqual([]);
    expect(result.unassociated).toEqual([person]);
  });

  it("does not associate industrial people through generic industry words only", () => {
    const person = {
      name: "Juan Pérez",
      role: "Gerente comercial",
      sourceUrl: "https://linkedin.com/in/juan-perez",
      linkedinUrl: "https://linkedin.com/in/juan-perez",
      confidence: "low" as const,
      companyEvidence:
        "Gerente comercial en empresa de seguridad industrial y distribuidora mayorista en Argentina.",
    };

    const result = associateDecisionMakers({
      companyName: "Seguridad Industrial Argentina",
      domain: "seguridadindustrial.com.ar",
      websitePeople: [],
      searchPeople: [person],
    });

    expect(result.associated).toEqual([]);
    expect(result.unassociated).toEqual([person]);
  });
});
