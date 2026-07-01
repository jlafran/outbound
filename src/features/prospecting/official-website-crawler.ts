import { isIP } from "node:net";
import { lookup } from "node:dns/promises";

import * as cheerio from "cheerio";

import type { z } from "zod";
import type { crawlPageStatusSchema } from "./prospecting-types";

type CrawlPageStatus = z.infer<typeof crawlPageStatusSchema>;

export type CrawledWebsitePage = {
  requestedUrl: string;
  finalUrl?: string;
  status: CrawlPageStatus;
  title?: string;
  html?: string;
};

export type CrawledWebsite = {
  pages: CrawledWebsitePage[];
};

type OfficialWebsiteCrawlerOptions = {
  fetcher?: (input: string, init?: RequestInit) => Promise<Response>;
  resolveHost?: (hostname: string) => Promise<string[]>;
  timeoutMs?: number;
  maxBytes?: number;
  maxPages?: number;
};

type RobotsRule = { allow: boolean; path: string };

const linkPriorityPatterns: Array<[RegExp, number]> = [
  [/\b(equipo|staff|profesionales|doctores?)\b/i, 100],
  [/\b(turnos?|contacto|contact)\b/i, 95],
  [/\b(nosotros|quienes-somos|qui[eé]nes somos)\b/i, 90],
  [/\b(servicios|tratamientos|especialidades)\b/i, 80],
];

export class OfficialWebsiteCrawler {
  private readonly fetcher: (input: string, init?: RequestInit) => Promise<Response>;
  private readonly resolveHost: (hostname: string) => Promise<string[]>;
  private readonly timeoutMs: number;
  private readonly maxBytes: number;
  private readonly maxPages: number;

  constructor(options: OfficialWebsiteCrawlerOptions = {}) {
    this.fetcher = options.fetcher ?? fetch;
    this.resolveHost =
      options.resolveHost ??
      (async (hostname) =>
        (await lookup(hostname, { all: true })).map(({ address }) => address));
    this.timeoutMs = options.timeoutMs ?? 5_000;
    this.maxBytes = options.maxBytes ?? 1_000_000;
    this.maxPages = options.maxPages ?? 5;
  }

  async crawl(input: {
    domain: string;
    candidateUrl: string;
  }): Promise<CrawledWebsite> {
    const candidate = canonicalUrl(input.candidateUrl);
    if (!candidate || !(await this.isSafeUrl(candidate, input.domain))) {
      return {
        pages: [{ requestedUrl: input.candidateUrl, status: "blocked" }],
      };
    }

    const origin = candidate.origin;
    const robotsRules = await this.readRobotsRules(
      new URL("/robots.txt", origin),
      input.domain,
    );
    const requested: URL[] = [];
    const seen = new Set<string>();
    const add = (url: URL) => {
      const key = url.toString();
      if (!seen.has(key)) {
        seen.add(key);
        requested.push(url);
      }
    };
    add(candidate);
    add(new URL("/", origin));

    const pages: CrawledWebsitePage[] = [];
    const discoveredLinks: Array<{ url: URL; priority: number }> = [];

    for (let index = 0; index < requested.length; index += 1) {
      const url = requested[index];
      if (pages.filter(({ status }) => status === "fetched").length >= this.maxPages) {
        break;
      }
      if (!robotsAllows(url.pathname, robotsRules)) {
        pages.push({ requestedUrl: url.toString(), status: "robots_disallowed" });
        continue;
      }

      const page = await this.fetchPage(url, input.domain);
      pages.push(page);
      if (page.status !== "fetched" || !page.html || !page.finalUrl) continue;

      for (const link of extractPrioritizedLinks(page.html, page.finalUrl)) {
        if (
          normalizeHostname(link.url.hostname) ===
            normalizeHostname(input.domain) &&
          !seen.has(link.url.toString())
        ) {
          discoveredLinks.push(link);
        }
      }

      if (index === Math.min(1, requested.length - 1)) {
        discoveredLinks
          .sort(
            (left, right) =>
              right.priority - left.priority ||
              left.url.toString().localeCompare(right.url.toString()),
          )
          .forEach(({ url: linkUrl }) => add(linkUrl));
      }
    }

    return { pages };
  }

  private async readRobotsRules(url: URL, domain: string): Promise<RobotsRule[]> {
    if (!(await this.isSafeUrl(url, domain))) return [];
    try {
      const response = await this.fetcher(url.toString(), {
        redirect: "manual",
        headers: { "User-Agent": "OutreachResearchBot/1.0" },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!response.ok) return [];
      const text = await response.text();
      return parseRobots(text);
    } catch {
      return [];
    }
  }

  private async fetchPage(
    requestedUrl: URL,
    domain: string,
  ): Promise<CrawledWebsitePage> {
    let current = requestedUrl;
    try {
      for (let redirectCount = 0; redirectCount <= 3; redirectCount += 1) {
        if (!(await this.isSafeUrl(current, domain))) {
          return { requestedUrl: requestedUrl.toString(), status: "blocked" };
        }
        const response = await this.fetcher(current.toString(), {
          redirect: "manual",
          headers: {
            Accept: "text/html,application/xhtml+xml",
            "User-Agent": "OutreachResearchBot/1.0",
          },
          signal: AbortSignal.timeout(this.timeoutMs),
        });
        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get("location");
          if (!location || redirectCount === 3) {
            return { requestedUrl: requestedUrl.toString(), status: "blocked" };
          }
          const redirected = canonicalUrl(new URL(location, current).toString());
          if (!redirected) {
            return { requestedUrl: requestedUrl.toString(), status: "blocked" };
          }
          current = redirected;
          continue;
        }

        const contentType = response.headers.get("content-type") ?? "";
        if (!contentType.toLowerCase().includes("text/html")) {
          return {
            requestedUrl: requestedUrl.toString(),
            finalUrl: current.toString(),
            status: "non_html",
          };
        }
        const contentLength = Number(response.headers.get("content-length") ?? 0);
        if (contentLength > this.maxBytes) {
          return {
            requestedUrl: requestedUrl.toString(),
            finalUrl: current.toString(),
            status: "too_large",
          };
        }
        const buffer = await response.arrayBuffer();
        if (buffer.byteLength > this.maxBytes) {
          return {
            requestedUrl: requestedUrl.toString(),
            finalUrl: current.toString(),
            status: "too_large",
          };
        }
        const html = new TextDecoder().decode(buffer);
        const $ = cheerio.load(html);
        return {
          requestedUrl: requestedUrl.toString(),
          finalUrl: current.toString(),
          status: "fetched",
          title: $("title").first().text().replace(/\s+/g, " ").trim() || undefined,
          html,
        };
      }
    } catch (error) {
      return {
        requestedUrl: requestedUrl.toString(),
        status:
          error instanceof Error &&
          (error.name === "AbortError" || error.name === "TimeoutError")
            ? "timeout"
            : "blocked",
      };
    }
    return { requestedUrl: requestedUrl.toString(), status: "blocked" };
  }

  private async isSafeUrl(url: URL, domain: string): Promise<boolean> {
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      normalizeHostname(url.hostname) !== normalizeHostname(domain) ||
      url.hostname === "localhost"
    ) {
      return false;
    }
    try {
      const addresses = isIP(url.hostname)
        ? [url.hostname]
        : await this.resolveHost(url.hostname);
      return addresses.length > 0 && addresses.every(isPublicAddress);
    } catch {
      return false;
    }
  }
}

function canonicalUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    url.hash = "";
    if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/$/, "");
    return url;
  } catch {
    return null;
  }
}

function normalizeHostname(value: string): string {
  return value.toLowerCase().replace(/^www\./, "");
}

function isPublicAddress(address: string): boolean {
  if (address.includes(":")) {
    const normalized = address.toLowerCase();
    return !(
      normalized === "::" ||
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe8") ||
      normalized.startsWith("fe9") ||
      normalized.startsWith("fea") ||
      normalized.startsWith("feb") ||
      normalized.startsWith("::ffff:127.") ||
      normalized.startsWith("::ffff:10.") ||
      normalized.startsWith("::ffff:192.168.")
    );
  }
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return false;
  const [a, b] = parts;
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

function extractPrioritizedLinks(
  html: string,
  baseUrl: string,
): Array<{ url: URL; priority: number }> {
  const $ = cheerio.load(html);
  const links = new Map<string, { url: URL; priority: number }>();
  $("a[href]").each((_, element) => {
    const href = $(element).attr("href");
    if (!href || /^(mailto:|tel:|javascript:)/i.test(href)) return;
    try {
      const url = new URL(href, baseUrl);
      if (url.search || url.hash || /\.(pdf|docx?|xlsx?|zip|xml|rss)$/i.test(url.pathname)) {
        return;
      }
      const text = `${$(element).text()} ${url.pathname}`;
      const priority = linkPriorityPatterns.find(([pattern]) => pattern.test(text))?.[1];
      if (!priority) return;
      const canonical = canonicalUrl(url.toString());
      if (!canonical) return;
      const key = canonical.toString();
      const existing = links.get(key);
      if (!existing || priority > existing.priority) {
        links.set(key, { url: canonical, priority });
      }
    } catch {
      return;
    }
  });
  return [...links.values()];
}

function parseRobots(text: string): RobotsRule[] {
  const rules: RobotsRule[] = [];
  let applies = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (key === "user-agent") {
      applies = value === "*" || value.toLowerCase() === "outreachresearchbot";
    } else if (applies && (key === "allow" || key === "disallow") && value) {
      rules.push({ allow: key === "allow", path: value });
    }
  }
  return rules;
}

function robotsAllows(pathname: string, rules: RobotsRule[]): boolean {
  const matching = rules
    .filter(({ path }) => pathname.startsWith(path.replace(/\*$/, "")))
    .sort(
      (left, right) =>
        right.path.length - left.path.length || Number(right.allow) - Number(left.allow),
    );
  return matching[0]?.allow ?? true;
}
