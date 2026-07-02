import type { ProspectingDecisionMaker } from "./dental-aesthetics-profile";
import type { WebsiteResearch } from "./prospecting-types";

const genericCompanyTokens = new Set([
  "clinica",
  "odontologica",
  "odontologia",
  "dental",
  "centro",
  "consultorio",
  "argentina",
  "buenos",
  "aires",
  "industrial",
  "industriales",
  "seguridad",
  "distribuidora",
  "distribuidor",
  "mayorista",
  "insumos",
  "herramientas",
  "proveedor",
  "proveedora",
]);

export function associateDecisionMakers(input: {
  companyName: string;
  domain: string;
  websitePeople: WebsiteResearch["people"];
  searchPeople: ProspectingDecisionMaker[];
}): {
  associated: ProspectingDecisionMaker[];
  unassociated: ProspectingDecisionMaker[];
} {
  const associated = new Map<string, ProspectingDecisionMaker>();
  const unassociated: ProspectingDecisionMaker[] = [];

  for (const person of input.websitePeople) {
    if (!belongsToDomain(person.sourceUrl, input.domain)) continue;
    associated.set(normalizePersonName(person.name), {
      name: person.name,
      role: person.role,
      sourceUrl: person.sourceUrl,
      confidence: "high",
      associationReason: "Cargo publicado en el sitio oficial de la empresa.",
      companyEvidence: `${person.name} · ${person.role}`,
    });
  }

  const companyPhrase = normalize(input.companyName);
  const distinctiveTokens = companyPhrase
    .split(" ")
    .filter((token) => token.length >= 4 && !genericCompanyTokens.has(token));

  for (const person of input.searchPeople) {
    const key = normalizePersonName(person.name);
    if (associated.has(key)) {
      const existing = associated.get(key)!;
      if (!existing.linkedinUrl && person.linkedinUrl) {
        existing.linkedinUrl = person.linkedinUrl;
      }
      continue;
    }
    const evidence = normalize(person.companyEvidence ?? "");
    const exactCompany = companyPhrase.length >= 5 && evidence.includes(companyPhrase);
    const distinctiveMatch = distinctiveTokens.some((token) => evidence.includes(token));
    const domainToken = normalize(input.domain.split(".")[0]);
    const domainMatch = domainToken.length >= 5 && evidence.includes(domainToken);
    if (exactCompany || distinctiveMatch || domainMatch) {
      associated.set(key, {
        ...person,
        confidence: "medium",
        associationReason: exactCompany
          ? "El perfil público menciona el nombre de la empresa."
          : "El perfil público coincide con un identificador distintivo de la empresa.",
      });
    } else {
      unassociated.push(person);
    }
  }

  return { associated: [...associated.values()], unassociated };
}

function belongsToDomain(value: string, domain: string): boolean {
  try {
    const hostname = new URL(value).hostname.replace(/^www\./, "").toLowerCase();
    return hostname === domain.replace(/^www\./, "").toLowerCase();
  } catch {
    return false;
  }
}

function normalizePersonName(value: string): string {
  return normalize(value).replace(/\b(?:dra|dr)\b/g, "").trim();
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
