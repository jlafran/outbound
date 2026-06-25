import {
  buildDentalAestheticsQueries,
  classifyProspectingResult,
  extractContactsFromText,
  extractDecisionMakerFromResult,
  hasDentalOpportunitySignal,
  scoreDentalAestheticsLead,
} from "./dental-aesthetics-profile";
import type {
  ProspectingLead,
  ProspectingSearchClient,
  RejectedProspectingResult,
} from "./prospecting-types";
import type { BraveSearchResult } from "@/features/research/brave-search-client";

type DentalAestheticsProspectingServiceOptions = {
  searchClient: ProspectingSearchClient;
  maxCompanies?: number;
};

export type DentalAestheticsProspectingResult = {
  leads: ProspectingLead[];
  rejected: RejectedProspectingResult[];
};

export class DentalAestheticsProspectingService {
  private readonly maxCompanies: number;

  constructor(
    private readonly options: DentalAestheticsProspectingServiceOptions,
  ) {
    this.maxCompanies = options.maxCompanies ?? 20;
  }

  async run(): Promise<DentalAestheticsProspectingResult> {
    const rejected: RejectedProspectingResult[] = [];
    const candidates = new Map<string, BraveSearchResult>();

    for (const query of buildDentalAestheticsQueries()) {
      if (candidates.size >= this.maxCompanies) break;
      const results = await this.options.searchClient.searchWeb({
        query,
        count: 10,
        country: "AR",
        searchLang: "es",
        includeKnownPlatforms: query.includes("linkedin.com"),
      });

      for (const result of results) {
        const classification = classifyProspectingResult(result);
        if (classification.kind !== "company_candidate") {
          rejected.push({
            title: result.title,
            domain: result.domain,
            url: result.url,
            kind: classification.kind,
            reason: classification.reason,
          });
          continue;
        }
        if (
          candidates.size < this.maxCompanies &&
          !candidates.has(result.domain)
        ) {
          candidates.set(result.domain, result);
        }
      }
    }

    const leads: ProspectingLead[] = [];
    for (const candidate of candidates.values()) {
      const decisionMakers = await this.findDecisionMakers(candidate);
      const contacts = extractContactsFromText(
        `${candidate.title} ${candidate.description}`,
      );
      const companyName = cleanCompanyName(candidate.title);
      const opportunitySignals = hasDentalOpportunitySignal(candidate)
        ? [
            "La fuente pública menciona turnos/WhatsApp/tratamientos de estética dental, señal útil para automatización de seguimiento.",
          ]
        : [];
      const hasHumanEmail = contacts.emails.some(
        (email) => !/^(info|contacto|ventas|recepcion|turnos)@/i.test(email),
      );
      const hasUsableDirectContact =
        hasHumanEmail ||
        contacts.whatsapps.length > 0 ||
        contacts.emails.some((email) =>
          /^(recepcion|turnos|contacto)@/i.test(email),
        );
      const score = scoreDentalAestheticsLead({
        companyCandidate: true,
        officialWebsite: true,
        hasDecisionMaker: decisionMakers.length > 0,
        hasHumanEmail: hasUsableDirectContact,
        hasWhatsapp: contacts.whatsapps.length > 0,
        hasOpportunitySignal: opportunitySignals.length > 0,
      });

      leads.push({
        companyName,
        domain: candidate.domain,
        websiteUrl: candidate.url,
        status:
          score >= 80
            ? "actionable"
            : score >= 55
              ? "review"
              : "discarded",
        score,
        decisionMakers,
        contacts,
        opportunitySignals,
        evidence: [
          {
            label: "Fuente empresa",
            url: candidate.url,
            description: candidate.description || candidate.title,
          },
          ...decisionMakers.map((person) => ({
            label: "Fuente decisor",
            url: person.sourceUrl,
            description: `${person.name} · ${person.role}`,
          })),
        ],
      });
    }

    leads.sort((left, right) => right.score - left.score);
    return { leads, rejected };
  }

  private async findDecisionMakers(
    candidate: BraveSearchResult,
  ): Promise<ProspectingLead["decisionMakers"]> {
    const companyName = cleanCompanyName(candidate.title);
    const queries = [
      `site:linkedin.com/in "${companyName}" "directora odontológica"`,
      `site:linkedin.com/in "${companyName}" "fundadora"`,
      `"${companyName}" "directora odontológica"`,
      `"${companyName}" "fundadora"`,
    ];
    const seen = new Set<string>();
    const people: ProspectingLead["decisionMakers"] = [];

    for (const query of queries) {
      if (people.length >= 3) break;
      const results = await this.options.searchClient.searchWeb({
        query,
        count: 5,
        country: "AR",
        searchLang: "es",
        includeKnownPlatforms: true,
      });
      for (const result of results) {
        const person = extractDecisionMakerFromResult(result);
        if (!person || seen.has(`${person.name}:${person.role}`)) continue;
        seen.add(`${person.name}:${person.role}`);
        people.push(person);
        if (people.length >= 3) break;
      }
    }

    return people;
  }
}

function cleanCompanyName(value: string): string {
  return value
    .replace(/\s[|·-]\s.*$/, "")
    .replace(/\b(cl[ií]nica odontol[oó]gica [^|·-]+)\b/i, (match) => match)
    .replace(/\s+/g, " ")
    .trim();
}
