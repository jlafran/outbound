import type { BraveSearchResult } from "@/features/research/brave-search-client";

export type ProspectingSourceKind =
  | "company_candidate"
  | "person_candidate"
  | "source_only"
  | "signal_only"
  | "irrelevant";

export type ProspectingClassification = {
  kind: ProspectingSourceKind;
  useful: boolean;
  reason: string;
};

export type ProspectingDecisionMaker = {
  name: string;
  role: string;
  sourceUrl: string;
  linkedinUrl?: string;
  confidence: "low" | "medium" | "high";
  companyEvidence?: string;
  associationReason?: string;
};

type ScoreDentalLeadInput = {
  companyCandidate: boolean;
  officialWebsite: boolean;
  hasDecisionMaker: boolean;
  hasHumanEmail: boolean;
  hasWhatsapp: boolean;
  hasOpportunitySignal: boolean;
};

const directoryDomains = new Set([
  "doctoralia.com.ar",
  "topdoctors.com.ar",
  "google.com",
  "google.com.ar",
  "facebook.com",
  "instagram.com",
]);

const contentPatterns = [
  /\btop\s*\d+/i,
  /\bmejores?\b/i,
  /\branking\b/i,
  /\bgu[ií]a\b/i,
  /\bqu[eé]\s+es\b/i,
  /\bc[oó]mo\b/i,
  /\bcurso\b/i,
  /\bcapacitaci[oó]n\b/i,
  /\buniversidad\b/i,
  /\bempleo\b/i,
  /\btrabajo\b/i,
];

const institutionPatterns = [
  /\bcolegio\b/i,
  /\basociaci[oó]n\b/i,
  /\bfederaci[oó]n\b/i,
  /\bconsejo\b/i,
  /\bc[aá]mara\b/i,
  /\buniversidad\b/i,
  /\bfacultad\b/i,
];

const opportunityPatterns = [
  /\bwhatsapp\b/i,
  /\bturnos?\b/i,
  /\bimplantes?\b/i,
  /\best[eé]tica dental\b/i,
  /\bortodoncia invisible\b/i,
  /\bmedicina est[eé]tica\b/i,
];

const rolePatterns: Array<{ pattern: RegExp; role: string }> = [
  { pattern: /\bdirectora? odontol[oó]gica?\b/i, role: "Directora odontológica" },
  { pattern: /\bdirectora? m[eé]dica?\b/i, role: "Director/a médica" },
  { pattern: /\bdirector m[eé]dico\b/i, role: "Director/a médica" },
  { pattern: /\bdirectora?\b/i, role: "Director/a" },
  { pattern: /\bfundadora?\b/i, role: "Fundador/a" },
  { pattern: /\bdueña?o?\b/i, role: "Dueño/a" },
  { pattern: /\bgerente general\b/i, role: "Gerente general" },
  { pattern: /\badministradora?\b/i, role: "Administrador/a" },
];

export function buildDentalAestheticsQueries(): string[] {
  return [
    '"clínica odontológica" "Buenos Aires" "WhatsApp"',
    '"odontología estética" "Argentina" "contacto"',
    '"clínica dental" "Buenos Aires" "equipo"',
    '"centro odontológico" "Argentina" "turnos" "WhatsApp"',
    'site:.com.ar "odontología estética" "contacto" "WhatsApp"',
    'site:.com.ar "clínica odontológica" "equipo"',
    'site:linkedin.com/in "clínica odontológica" "director"',
    'site:linkedin.com/in "odontología estética" "fundador"',
  ];
}

export function classifyProspectingResult(
  result: BraveSearchResult,
): ProspectingClassification {
  const text = `${result.title} ${result.description}`;
  const url = safeUrl(result.url);
  const pathname = url?.pathname ?? "";

  if (result.domain.endsWith("linkedin.com")) {
    return {
      kind: "person_candidate",
      useful: true,
      reason: "Perfil público potencialmente asociado a un decisor.",
    };
  }

  if (directoryDomains.has(result.domain)) {
    return {
      kind: "source_only",
      useful: false,
      reason: "Directorio útil para descubrir, pero no es el lead final.",
    };
  }

  if (institutionPatterns.some((pattern) => pattern.test(text))) {
    return {
      kind: "source_only",
      useful: false,
      reason: "Institución/cámara/colegio útil como fuente, no como cliente final.",
    };
  }

  if (
    contentPatterns.some((pattern) => pattern.test(text)) ||
    /\/(blog|ranking|guia|noticias?|empleo|trabajo)\b/i.test(pathname)
  ) {
    return {
      kind: "irrelevant",
      useful: false,
      reason: "Contenido informativo o ruido, no una empresa prospectable.",
    };
  }

  if (
    /\b(cl[ií]nica|centro|consultorio|odontolog[ií]a|dental|est[eé]tica)\b/i.test(
      text,
    )
  ) {
    return {
      kind: "company_candidate",
      useful: true,
      reason: "Parece web o página de una clínica/centro prospectable.",
    };
  }

  if (opportunityPatterns.some((pattern) => pattern.test(text))) {
    return {
      kind: "signal_only",
      useful: true,
      reason: "Señal de oportunidad para investigar, pero no confirma empresa.",
    };
  }

  return {
    kind: "irrelevant",
    useful: false,
    reason: "No contiene señales suficientes del caso test.",
  };
}

export function extractContactsFromText(text: string): {
  emails: string[];
  phones: string[];
  whatsapps: string[];
} {
  const emails = unique(
    [...text.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)].map(
      ([email]) => email.toLowerCase(),
    ),
  );
  const phones = unique(
    [...text.matchAll(/(?:\+?54\s?)?(?:9\s?)?(?:11|[2368]\d{2,3})[\s.-]?\d{3,4}[\s.-]?\d{4}/g)]
      .map(([phone]) => normalizeArgentinaPhone(phone))
      .filter((phone) => phone.length >= 10),
  );
  const whatsapps = /\bwhatsapp\b/i.test(text) ? phones : [];

  return { emails, phones, whatsapps };
}

export function extractDecisionMakerFromResult(
  result: BraveSearchResult,
): ProspectingDecisionMaker | null {
  const text = `${result.title}. ${result.description}`;
  const matchedRole = rolePatterns.find(({ pattern }) => pattern.test(text));
  if (!matchedRole) return null;

  const nameMatch =
    text.match(
      /\b(?:Dr\.?|Dra\.?)\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){1,3})\b/,
    ) ??
    text.match(
      /^([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){1,3})\s+[-–|·]/,
    );
  if (!nameMatch) return null;

  const isLinkedIn = result.domain.endsWith("linkedin.com");
  return {
    name: nameMatch[1],
    role: matchedRole.role,
    sourceUrl: result.url,
    linkedinUrl: isLinkedIn ? result.url : undefined,
    confidence: isLinkedIn ? "medium" : "low",
    companyEvidence: text,
  };
}

export function scoreDentalAestheticsLead(input: ScoreDentalLeadInput): number {
  let score = 0;
  if (input.companyCandidate) score += 25;
  if (input.officialWebsite) score += 15;
  if (input.hasDecisionMaker) score += 20;
  if (input.hasHumanEmail) score += 15;
  if (input.hasWhatsapp) score += 15;
  if (input.hasOpportunitySignal) score += 10;
  return Math.min(100, score);
}

export function hasDentalOpportunitySignal(result: BraveSearchResult): boolean {
  const text = `${result.title} ${result.description}`;
  return opportunityPatterns.some((pattern) => pattern.test(text));
}

function safeUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function normalizeArgentinaPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("54")) return digits;
  if (digits.startsWith("9")) return `54${digits}`;
  return `549${digits}`;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
