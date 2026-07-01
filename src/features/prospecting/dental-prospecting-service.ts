import {
  buildDentalAestheticsQueries,
  classifyProspectingResult,
  extractContactsFromText,
  extractDecisionMakerFromResult,
  hasDentalOpportunitySignal,
} from "./dental-aesthetics-profile";
import type {
  ProspectingLead,
  ProspectingSearchClient,
  RejectedProspectingResult,
} from "./prospecting-types";
import type { BraveSearchResult } from "@/features/research/brave-search-client";
import type { EmailVerifier } from "./email-verifier";
import { associateDecisionMakers } from "./decision-maker-associator";
import type { OfficialWebsiteCrawler } from "./official-website-crawler";
import { WebsiteResearchExtractor } from "./website-research-extractor";
import { scoreProspectingLead } from "./prospecting-lead-scorer";
import { buildPersonalizedMessage } from "./personalized-message-builder";
import type { WebsiteResearch } from "./prospecting-types";

type DentalAestheticsProspectingServiceOptions = {
  searchClient: ProspectingSearchClient;
  emailVerifier?: EmailVerifier;
  websiteCrawler?: Pick<OfficialWebsiteCrawler, "crawl">;
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
      const snippetContacts = extractContactsFromText(
        `${candidate.title} ${candidate.description}`,
      );
      const websiteResearch = await this.researchOfficialWebsite(candidate);
      const companyName =
        websiteResearch.companyName ?? cleanCompanyName(candidate.title);
      const searchedDecisionMakers = await this.findDecisionMakers(candidate);
      const association = associateDecisionMakers({
        companyName,
        domain: candidate.domain,
        websitePeople: websiteResearch.people,
        searchPeople: searchedDecisionMakers,
      });
      const decisionMakers = association.associated;
      unassociatedDecisionMakers.push(...association.unassociated);
      const contacts = mergeContacts(snippetContacts, websiteResearch.contacts);
      const emailCandidates = createEmailCandidates({
        domain: candidate.domain,
        decisionMakers,
        websiteResearch,
      });
      const verifiedEmailCandidates =
        await this.verifyEmailCandidates(emailCandidates);
      const opportunitySignals = websiteResearch.signals.length
        ? websiteResearch.signals.map(({ statement }) => statement)
        : hasDentalOpportunitySignal(candidate)
          ? [
              "La fuente pública menciona turnos, WhatsApp o tratamientos compatibles con la oferta.",
            ]
          : [];
      const sourceUrls = [
        candidate.url,
        ...websiteResearch.pages
          .filter(({ status }) => status === "fetched")
          .map(({ finalUrl, requestedUrl }) => finalUrl ?? requestedUrl),
        ...decisionMakers.map(({ sourceUrl }) => sourceUrl),
      ];
      const hasPersonalEmail = verifiedEmailCandidates.some(({ email }) =>
        isPersonalEmail(email),
      );
      const genericEmails = contacts.emails.filter((email) => !isPersonalEmail(email));
      const scoreBreakdown = scoreProspectingLead({
        companyValidated: websiteResearch.status !== "failed",
        offerFitEvidenceCount:
          websiteResearch.services.length + websiteResearch.signals.length,
        decisionMakerConfidences: decisionMakers.map(({ confidence }) => confidence),
        hasPersonalEmail,
        hasWhatsapp: contacts.whatsapps.length > 0,
        hasGenericEmail: genericEmails.length > 0,
        emailVerificationStatuses: verifiedEmailCandidates.map(
          ({ source, verificationStatus }) =>
            source === "official_website"
              ? "official_website"
              : verificationStatus,
        ),
        opportunitySignalCount: websiteResearch.signals.length,
        sourceUrls,
        flags: websiteResearch.status === "failed" ? ["ambiguous"] : [],
      });
      const recommendedContact = selectRecommendedContact({
        decisionMakers,
        emailCandidates: verifiedEmailCandidates,
        whatsapps: contacts.whatsapps,
        genericEmails,
        websiteResearch,
      });
      const messageDraft = buildPersonalizedMessage({
        companyName,
        decisionMaker: decisionMakers[0] ?? null,
        signal: websiteResearch.signals[0] ?? null,
      });

      leads.push({
        companyName,
        domain: candidate.domain,
        websiteUrl: candidate.url,
        status: scoreBreakdown.status,
        score: scoreBreakdown.total,
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
          ...websiteResearch.signals.map((signal) => ({
            label: "Evidencia del sitio oficial",
            url: signal.sourceUrl,
            description: signal.statement,
          })),
        ],
        websiteResearch,
        scoreBreakdown,
        recommendedContact,
        messageDraft,
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
    let submissions = 0;
    let foundValid = false;
    for (const candidate of candidates) {
      if (
        candidate.source === "official_website" ||
        foundValid ||
        submissions >= 3
      ) {
        verified.push(candidate);
        continue;
      }
      const result = await this.options.emailVerifier.verify(candidate.email);
      submissions += 1;
      verified.push({
        ...candidate,
        verificationStatus: result.status,
        verificationProvider: result.provider,
        verificationTrackingId: result.trackingId,
      });
      if (result.status === "valid") foundValid = true;
    }
    return verified;
  }

  private async researchOfficialWebsite(
    candidate: BraveSearchResult,
  ): Promise<WebsiteResearch> {
    if (!this.options.websiteCrawler) return failedWebsiteResearch(candidate.url);
    try {
      const crawled = await this.options.websiteCrawler.crawl({
        domain: candidate.domain,
        candidateUrl: candidate.url,
      });
      return new WebsiteResearchExtractor().extract(crawled);
    } catch {
      return failedWebsiteResearch(candidate.url);
    }
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
  websiteResearch: WebsiteResearch;
}): ProspectingLead["contacts"]["emailCandidates"] {
  const seen = new Set<string>();
  const candidates: ProspectingLead["contacts"]["emailCandidates"] = [];

  const publicPersonalEmails = unique([
    ...input.websiteResearch.people
      .map(({ email }) => email)
      .filter((email): email is string => Boolean(email)),
    ...input.websiteResearch.contacts.emails.filter(isPersonalEmail),
  ]).filter((email) => email.toLowerCase().endsWith(`@${input.domain}`));
  for (const email of publicPersonalEmails) {
    const normalized = email.toLowerCase();
    seen.add(normalized);
    candidates.push({
      email: normalized,
      source: "official_website",
      verificationStatus: "unverified",
      confidence: 95,
    });
  }

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

function mergeContacts(
  snippet: ReturnType<typeof extractContactsFromText>,
  website: WebsiteResearch["contacts"],
) {
  return {
    emails: unique([...snippet.emails, ...website.emails]),
    phones: unique([...snippet.phones, ...website.phones]),
    whatsapps: unique([...snippet.whatsapps, ...website.whatsapps]),
  };
}

function isPersonalEmail(email: string): boolean {
  return !/^(info|contacto|ventas|recepcion|turnos|administracion|consultas)@/i.test(
    email,
  );
}

function selectRecommendedContact(input: {
  decisionMakers: ProspectingLead["decisionMakers"];
  emailCandidates: ProspectingLead["contacts"]["emailCandidates"];
  whatsapps: string[];
  genericEmails: string[];
  websiteResearch: WebsiteResearch;
}): ProspectingLead["recommendedContact"] {
  const email =
    input.emailCandidates.find(({ verificationStatus }) => verificationStatus === "valid") ??
    input.emailCandidates.find(
      ({ source, verificationStatus }) =>
        source === "official_website" && verificationStatus !== "invalid",
    );
  const person = input.decisionMakers[0];
  if (email) {
    return {
      name: person?.name,
      role: person?.role,
      channel: "email",
      value: email.email,
      confidence: email.verificationStatus === "valid" ? "high" : "medium",
      sourceUrl: person?.sourceUrl,
    };
  }
  if (input.whatsapps[0]) {
    return {
      name: person?.name,
      role: person?.role,
      channel: "whatsapp",
      value: input.whatsapps[0],
      confidence: "medium",
      sourceUrl: input.websiteResearch.signals[0]?.sourceUrl,
    };
  }
  if (input.genericEmails[0]) {
    return {
      channel: "generic_email",
      value: input.genericEmails[0],
      confidence: "low",
    };
  }
  return null;
}

function failedWebsiteResearch(url: string): WebsiteResearch {
  return {
    status: "failed",
    pages: [{ requestedUrl: url, status: "blocked" }],
    contacts: {
      emails: [],
      phones: [],
      whatsapps: [],
      linkedinUrls: [],
      instagramUrls: [],
    },
    people: [],
    services: [],
    signals: [],
    errors: [{ url, code: "crawl_failed" }],
  };
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

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
