import { describe, expect, it } from "vitest";

import {
  buildDentalAestheticsQueries,
  classifyProspectingResult,
  extractContactsFromText,
  extractDecisionMakerFromResult,
  scoreDentalAestheticsLead,
} from "@/features/prospecting/dental-aesthetics-profile";

describe("dental aesthetics prospecting profile", () => {
  it("builds focused searches for real companies and decision makers", () => {
    expect(buildDentalAestheticsQueries()).toEqual(
      expect.arrayContaining([
        '"clínica odontológica" "Buenos Aires" "WhatsApp"',
        'site:.com.ar "odontología estética" "contacto" "WhatsApp"',
        'site:linkedin.com/in "clínica odontológica" "director"',
      ]),
    );
  });

  it("classifies official company websites separately from directories and content", () => {
    expect(
      classifyProspectingResult({
        title: "Clínica Dental Palermo | Odontología estética",
        url: "https://clinicadentalpalermo.com.ar/contacto",
        description:
          "Implantes, ortodoncia invisible y estética dental. Pedí turno por WhatsApp.",
        domain: "clinicadentalpalermo.com.ar",
      }),
    ).toMatchObject({
      kind: "company_candidate",
      useful: true,
    });

    expect(
      classifyProspectingResult({
        title: "Las 10 mejores clínicas odontológicas en Buenos Aires",
        url: "https://example.com/blog/mejores-clinicas-odontologicas",
        description: "Ranking y guía para elegir clínica dental.",
        domain: "example.com",
      }),
    ).toMatchObject({
      kind: "irrelevant",
      useful: false,
    });

    expect(
      classifyProspectingResult({
        title: "Clínicas odontológicas en Buenos Aires - Doctoralia",
        url: "https://www.doctoralia.com.ar/clinicas/odontologia/buenos-aires",
        description: "Directorio de profesionales y turnos.",
        domain: "doctoralia.com.ar",
      }),
    ).toMatchObject({
      kind: "source_only",
        useful: false,
      });

    expect(
      classifyProspectingResult({
        title: "Colegio de Odontólogos Distrito I",
        url: "https://colescba.org.ar",
        description: "Turnos, trámites y WhatsApp institucional.",
        domain: "colescba.org.ar",
      }),
    ).toMatchObject({
      kind: "source_only",
      useful: false,
    });
  });

  it("extracts public email, whatsapp and phone contact signals from text", () => {
    const contacts = extractContactsFromText(
      "Turnos por WhatsApp +54 9 11 2345-6789 o escribinos a recepcion@clinicadental.com.ar",
    );

    expect(contacts.emails).toEqual(["recepcion@clinicadental.com.ar"]);
    expect(contacts.whatsapps).toEqual(["5491123456789"]);
    expect(contacts.phones).toEqual(["5491123456789"]);
  });

  it("extracts likely decision makers from public result text", () => {
    expect(
      extractDecisionMakerFromResult({
        title: "Dra. Mariana López - Directora Clínica Odontológica Palermo",
        url: "https://www.linkedin.com/in/mariana-lopez-odontologia",
        description:
          "Directora odontológica y fundadora de Clínica Odontológica Palermo.",
        domain: "linkedin.com",
      }),
    ).toMatchObject({
      name: "Mariana López",
      role: "Directora odontológica",
      confidence: "medium",
    });

    expect(
      extractDecisionMakerFromResult({
        title: "Daniel Escribano - Director médico",
        url: "https://www.linkedin.com/in/daniel-escribano",
        description: "Director médico en Clínica Odontológica Daniel Escribano.",
        domain: "linkedin.com",
      }),
    ).toMatchObject({
      name: "Daniel Escribano",
      role: "Director/a médica",
    });
  });

  it("scores leads higher when company, decision maker and direct contact are present", () => {
    expect(
      scoreDentalAestheticsLead({
        companyCandidate: true,
        officialWebsite: true,
        hasDecisionMaker: true,
        hasHumanEmail: true,
        hasWhatsapp: true,
        hasOpportunitySignal: true,
      }),
    ).toBeGreaterThanOrEqual(85);

    expect(
      scoreDentalAestheticsLead({
        companyCandidate: true,
        officialWebsite: false,
        hasDecisionMaker: false,
        hasHumanEmail: false,
        hasWhatsapp: false,
        hasOpportunitySignal: false,
      }),
    ).toBeLessThan(50);
  });
});
