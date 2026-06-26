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
import type { EmailVerifier } from "./email-verifier";

type DentalAestheticsProspectingServiceOptions = {
  searchClient: ProspectingSearchClient;
  emailVerifier?: EmailVerifier;
  maxCompanies?: number;
};

export type DentalAestheticsProspectingResult = {
  leads: ProspectingLead[];
  unassociatedDecisionMakers: ProspectingLead["decisionMakers"];
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
    const unassociatedDecisionMakers: ProspectingLead["decisionMakers"] = [];
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
        if (classification.kind === "person_candidate") {
          const person = extractDecisionMakerFromResult(result);
          if (person) unassociatedDecisionMakers.push(person);
          continue;
        }
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
      const emailCandidates = createEmailCandidates({
        domain: candidate.domain,
        decisionMakers,
        publicEmails: contacts.emails,
      });
      const verifiedEmailCandidates =
        await this.verifyEmailCandidates(emailCandidates);
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
          decisionMakers.length > 0 && score >= 80
            ? "actionable"
            : score >= 55
              ? "review"
              : "discarded",
        score,
        decisionMakers,
        contacts: {
          ...contacts,
          emailCandidates: verifiedEmailCandidates,
        },
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
    return {
      leads,
      unassociatedDecisionMakers: dedupeDecisionMakers(
        unassociatedDecisionMakers,
      ),
      rejected,
    };
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

  private async verifyEmailCandidates(
    candidates: ProspectingLead["contacts"]["emailCandidates"],
  ): Promise<ProspectingLead["contacts"]["emailCandidates"]> {
    if (!this.options.emailVerifier) return candidates;

    const verified: ProspectingLead["contacts"]["emailCandidates"] = [];
    for (const candidate of candidates) {
      const result = await this.options.emailVerifier.verify(candidate.email);
      verified.push({
        ...candidate,
        verificationStatus: result.status,
        verificationProvider: result.provider,
        verificationTrackingId: result.trackingId,
      });
    }
    return verified;
  }
}

function dedupeDecisionMakers(
  people: ProspectingLead["decisionMakers"],
): ProspectingLead["decisionMakers"] {
  const seen = new Set<string>();
  return people.filter((person) => {
    const key = `${person.name}:${person.linkedinUrl ?? person.sourceUrl}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function createEmailCandidates(input: {
  domain: string;
  decisionMakers: ProspectingLead["decisionMakers"];
  publicEmails: string[];
}): ProspectingLead["contacts"]["emailCandidates"] {
  const seen = new Set(input.publicEmails.map((email) => email.toLowerCase()));
  const candidates: ProspectingLead["contacts"]["emailCandidates"] = [];

  for (const person of input.decisionMakers) {
    const nameParts = splitName(person.name);
    if (!nameParts) continue;
    const values = [
      `${nameParts.first}.${nameParts.last}@${input.domain}`,
      `${nameParts.first[0]}${nameParts.last}@${input.domain}`,
      `${nameParts.first}@${input.domain}`,
    ];
    for (const email of values) {
      const normalized = email.toLowerCase();
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      candidates.push({
        email: normalized,
        source: "pattern",
        verificationStatus: "unverified",
      });
    }
  }

  return candidates;
}

function splitName(
  value: string,
): { first: string; last: string } | null {
  const parts = value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-zñ\s-]/g, "")
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length < 2) return null;
  return {
    first: parts[0],
    last: parts[parts.length - 1],
  };
}

function cleanCompanyName(value: string): string {
  return value
    .replace(/\s[|·-]\s.*$/, "")
    .replace(/\b(cl[ií]nica odontol[oó]gica [^|·-]+)\b/i, (match) => match)
    .replace(/\s+/g, " ")
    .trim();
}
