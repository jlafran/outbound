import * as cheerio from "cheerio";

import type { CrawledWebsite } from "./official-website-crawler";
import type { WebsiteResearch } from "./prospecting-types";

const servicePattern =
  /\b(implantes?|ortodoncia|invisible|est[eé]tica|blanqueamiento|carillas?|pr[oó]tesis|endodoncia|periodoncia|cirug[ií]a|odontopediatr[ií]a|insumos industriales|herramientas|seguridad industrial|\bEPP\b|cat[aá]logo|mayorista)\b/i;
const rolePatterns: Array<{ pattern: RegExp; role: string }> = [
  { pattern: /gerente comercial/i, role: "Gerente comercial" },
  { pattern: /gerente de ventas/i, role: "Gerente de ventas" },
  { pattern: /directora? comercial/i, role: "Director/a comercial" },
  { pattern: /business development/i, role: "Business development" },
  { pattern: /gerente de marketing/i, role: "Gerente de marketing" },
  { pattern: /directora? odontol[oó]gica?/i, role: "Directora odontológica" },
  { pattern: /directora? m[eé]dica?/i, role: "Director/a médica" },
  { pattern: /\b(?:ceo|director(?:a)? general)\b/i, role: "Director general/CEO" },
  { pattern: /fundadora?/i, role: "Fundador/a" },
  { pattern: /dueñ[oa]/i, role: "Dueño/a" },
  { pattern: /gerente general/i, role: "Gerente general" },
  { pattern: /administradora?/i, role: "Administrador/a" },
  { pattern: /responsable (?:de )?(?:marketing|comercial)/i, role: "Responsable comercial/marketing" },
];

export class WebsiteResearchExtractor {
  extract(crawled: CrawledWebsite): WebsiteResearch {
    const pageSummaries: WebsiteResearch["pages"] = [];
    const errors: WebsiteResearch["errors"] = [];
    const emails = new Set<string>();
    const phones = new Set<string>();
    const whatsapps = new Set<string>();
    const linkedinUrls = new Set<string>();
    const instagramUrls = new Set<string>();
    const people = new Map<string, WebsiteResearch["people"][number]>();
    const services = new Set<string>();
    const signals = new Map<string, WebsiteResearch["signals"][number]>();
    let companyName: string | undefined;
    let description: string | undefined;
    let location: string | undefined;
    let branchMentions = 0;
    let explicitBranchCountTotal: number | undefined;
    let usefulPages = 0;

    for (const page of crawled.pages) {
      if (page.status !== "fetched" || !page.html || !page.finalUrl) {
        pageSummaries.push({
          requestedUrl: page.requestedUrl,
          finalUrl: page.finalUrl,
          status: page.status,
          title: page.title,
        });
        errors.push({ url: page.requestedUrl, code: page.status });
        continue;
      }

      const $ = cheerio.load(page.html);
      $("script,style,noscript,svg").remove();
      const bodyText = $("body").text().replace(/\s+/g, " ").trim();
      const scriptCount = cheerio.load(page.html)("script").length;
      const javascriptRequired = bodyText.length < 40 && scriptCount >= 2;
      pageSummaries.push({
        requestedUrl: page.requestedUrl,
        finalUrl: page.finalUrl,
        status: javascriptRequired ? "javascript_required" : "fetched",
        title: page.title,
      });
      if (javascriptRequired) {
        errors.push({ url: page.finalUrl, code: "javascript_required" });
        continue;
      }
      usefulPages += 1;

      companyName ??= cleanText(
        $('meta[property="og:site_name"]').attr("content") ??
          $("h1").first().text() ??
          page.title,
      );
      description ??= cleanText(
        $('meta[name="description"]').attr("content") ?? "",
      );
      location ??= cleanText($("address").first().text());

      for (const email of bodyText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,6}\b(?![A-Z0-9.-])/gi) ?? []) {
        const normalized = normalizeEmail(email, { allowEncodedPrefix: false });
        if (normalized) emails.add(normalized);
      }
      $('a[href^="mailto:"]').each((_, element) => {
        const value = ($(element).attr("href") ?? "").slice(7).split("?")[0];
        const normalized = normalizeEmail(value, { allowEncodedPrefix: true });
        if (normalized) emails.add(normalized);
      });
      $('a[href^="tel:"]').each((_, element) => {
        const value = normalizePhone(($(element).attr("href") ?? "").slice(4));
        if (value) phones.add(value);
      });
      $("a[href]").each((_, element) => {
        const href = $(element).attr("href") ?? "";
        if (/linkedin\.com/i.test(href)) linkedinUrls.add(normalizeSocialUrl(href));
        if (/instagram\.com/i.test(href)) instagramUrls.add(normalizeSocialUrl(href));
        if (/wa\.me|api\.whatsapp\.com|whatsapp:/i.test(href)) {
          const value = normalizePhone(href);
          if (value) {
            whatsapps.add(value);
            phones.add(value);
          }
        }
      });

      $("li,h2,h3,.service,.tratamiento").each((_, element) => {
        const value = cleanText($(element).text());
        if (value && value.length <= 100 && servicePattern.test(value)) {
          services.add(value);
        }
      });

      $('[class*="team"], [class*="staff"], [class*="professional"], [class*="doctor"], [class*="about"], [class*="nosotros"], article').each(
        (_, element) => {
          const container = $(element);
          const text = cleanText(container.text()) ?? "";
          const matchedRole = rolePatterns.find(({ pattern }) => pattern.test(text));
          if (!matchedRole) return;
          const heading = cleanText(
            container.find("h1,h2,h3,h4,strong").first().text(),
          );
          const name = extractPersonName(heading ?? text);
          if (!name) return;
          const email = normalizeEmail(
            container
              .find('a[href^="mailto:"]')
              .first()
              .attr("href")
              ?.slice(7)
              .split("?")[0],
            { allowEncodedPrefix: true },
          );
          people.set(normalizeText(name), {
            name,
            role: matchedRole.role,
            email,
            sourceUrl: page.finalUrl!,
          });
        },
      );

      const sourceUrl = page.finalUrl;
      if (/whatsapp/i.test(bodyText) && /turno|reserv|consulta/i.test(bodyText)) {
        addSignal(signals, {
          kind: "whatsapp_booking",
          statement: "El sitio oficial ofrece turnos o consultas por WhatsApp.",
          sourceUrl,
          confidence: "high",
        });
      }
      if ($("form").length > 0 && /turno|reserv|consulta/i.test(bodyText)) {
        addSignal(signals, {
          kind: "appointment_form",
          statement: "El sitio oficial utiliza un formulario para turnos o consultas.",
          sourceUrl,
          confidence: "high",
        });
      }
      if (/\b(cat[aá]logo|marcas representadas|insumos industriales|seguridad industrial|herramientas|EPP)\b/i.test(bodyText)) {
        addSignal(signals, {
          kind: "industrial_distribution",
          statement: "El sitio oficial comunica catálogo o líneas de distribución industrial para empresas.",
          sourceUrl,
          confidence: "high",
        });
      }
      const explicitBranchCount = [...bodyText.matchAll(/\b(\d+)\s+sucursal(?:es)?\b/gi)]
        .map((match) => Number(match[1]))
        .filter((value) => Number.isFinite(value));
      explicitBranchCountTotal = Math.max(
        explicitBranchCountTotal ?? 0,
        ...explicitBranchCount,
      );
      branchMentions = Math.max(branchMentions, ...explicitBranchCount, 0);
      if (explicitBranchCount.length === 0) {
        branchMentions += (bodyText.match(/\bsucursal(?:es)?\b/gi) ?? []).length;
      }
      if (branchMentions > 0) {
        addSignal(signals, {
          kind: "multiple_branches",
          statement: "El sitio oficial menciona atención en más de una sucursal.",
          sourceUrl,
          confidence: "medium",
        });
      }
    }

    const successfulPages = pageSummaries.filter(({ status }) => status === "fetched").length;
    return {
      status:
        usefulPages === 0
          ? "failed"
          : successfulPages === pageSummaries.length
            ? "completed"
            : "partial",
      pages: pageSummaries,
      contacts: {
        emails: [...emails],
        phones: [...phones],
        whatsapps: [...whatsapps],
        linkedinUrls: [...linkedinUrls].filter(Boolean),
        instagramUrls: [...instagramUrls].filter(Boolean),
      },
      people: [...people.values()],
      companyName,
      description,
      location,
      services: [...services],
      branchCount:
        explicitBranchCountTotal && explicitBranchCountTotal > 0
          ? explicitBranchCountTotal
          : branchMentions > 0
            ? branchMentions + 1
            : undefined,
      signals: [...signals.values()],
      errors,
    };
  }
}

function cleanText(value: string | undefined): string | undefined {
  const cleaned = value?.replace(/\s+/g, " ").trim();
  return cleaned || undefined;
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function extractPersonName(value: string): string | null {
  const cleaned = value.replace(/\b(?:Dra|Dr)\.?\s*/i, "").trim();
  const match = cleaned.match(
    /^([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){1,3})\b/,
  );
  return match?.[1] ?? null;
}

function normalizeEmail(
  value: string | undefined,
  options: { allowEncodedPrefix: boolean },
): string | undefined {
  if (!value) return undefined;
  if (!options.allowEncodedPrefix && /%[0-9a-f]{2}/i.test(value)) {
    return undefined;
  }
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return undefined;
  }
  const cleaned = decoded.trim().replace(/^mailto:/i, "").toLowerCase();
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,6}$/.test(cleaned)) {
    return undefined;
  }
  const [local, domain] = cleaned.split("@");
  if (
    !local ||
    !domain ||
    /^\d/.test(local) ||
    /(contacto|email|hola).*(contacto|email|hola)/i.test(local)
  ) {
    return undefined;
  }
  return cleaned;
}

function normalizePhone(value: string): string | null {
  const match = value.match(/(?:\+?54)?[\s\d().-]{9,}/);
  if (!match) return null;
  const digits = match[0].replace(/\D/g, "");
  if (digits.length < 10) return null;
  return digits.startsWith("54") ? digits : `54${digits}`;
}

function normalizeSocialUrl(value: string): string {
  try {
    const url = new URL(value);
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

function addSignal(
  signals: Map<string, WebsiteResearch["signals"][number]>,
  signal: WebsiteResearch["signals"][number],
) {
  if (!signals.has(signal.kind)) signals.set(signal.kind, signal);
}
