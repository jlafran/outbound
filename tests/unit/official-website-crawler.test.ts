import { describe, expect, it, vi } from "vitest";

import { OfficialWebsiteCrawler } from "@/features/prospecting/official-website-crawler";

const publicDns = async () => ["93.184.216.34"];

function html(body: string, status = 200, headers?: Record<string, string>) {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", ...headers },
  });
}

describe("OfficialWebsiteCrawler", () => {
  it("blocks private network destinations before fetching", async () => {
    const fetcher = vi.fn();
    const crawler = new OfficialWebsiteCrawler({
      fetcher,
      resolveHost: async () => ["127.0.0.1"],
    });

    const result = await crawler.crawl({
      domain: "internal.example",
      candidateUrl: "https://internal.example/contacto",
    });

    expect(fetcher).not.toHaveBeenCalled();
    expect(result.pages).toEqual([
      expect.objectContaining({ status: "blocked" }),
    ]);
  });

  it("blocks a redirect that leaves the official hostname", async () => {
    const fetcher = vi.fn(async (url: string | URL) => {
      const value = String(url);
      if (value.endsWith("/robots.txt")) return new Response("", { status: 404 });
      return new Response("", {
        status: 302,
        headers: { Location: "https://evil.example/collect" },
      });
    });
    const crawler = new OfficialWebsiteCrawler({ fetcher, resolveHost: publicDns });

    const result = await crawler.crawl({
      domain: "clinica.com.ar",
      candidateUrl: "https://clinica.com.ar/contacto",
    });

    expect(result.pages[0].status).toBe("blocked");
    expect(fetcher).not.toHaveBeenCalledWith(
      "https://evil.example/collect",
      expect.anything(),
    );
  });

  it("respects robots rules for prioritized internal pages", async () => {
    const fetcher = vi.fn(async (url: string | URL) => {
      const value = String(url);
      if (value.endsWith("/robots.txt")) {
        return new Response("User-agent: *\nDisallow: /equipo", { status: 200 });
      }
      if (value.endsWith("/contacto")) {
        return html('<a href="/equipo">Equipo</a><a href="/servicios">Servicios</a>');
      }
      return html(`<h1>${value}</h1>`);
    });
    const crawler = new OfficialWebsiteCrawler({ fetcher, resolveHost: publicDns });

    const result = await crawler.crawl({
      domain: "clinica.com.ar",
      candidateUrl: "https://clinica.com.ar/contacto",
    });

    expect(result.pages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          requestedUrl: "https://clinica.com.ar/equipo",
          status: "robots_disallowed",
        }),
        expect.objectContaining({
          requestedUrl: "https://clinica.com.ar/servicios",
          status: "fetched",
        }),
      ]),
    );
  });

  it("visits at most five content pages and prioritizes useful links", async () => {
    const fetcher = vi.fn(async (url: string | URL) => {
      const value = String(url);
      if (value.endsWith("/robots.txt")) return new Response("", { status: 404 });
      if (value.endsWith("/contacto")) {
        return html(`
          <title>Contacto</title>
          <a href="/blog/nota">Blog</a>
          <a href="/equipo">Nuestro equipo</a>
          <a href="/servicios">Tratamientos</a>
          <a href="/nosotros">Quiénes somos</a>
          <a href="/turnos">Turnos</a>
          <a href="https://other.example/equipo">Otro sitio</a>
        `);
      }
      return html(`<title>${new URL(value).pathname}</title><main>Contenido</main>`);
    });
    const crawler = new OfficialWebsiteCrawler({ fetcher, resolveHost: publicDns });

    const result = await crawler.crawl({
      domain: "clinica.com.ar",
      candidateUrl: "https://clinica.com.ar/contacto",
    });
    const fetched = result.pages.filter(({ status }) => status === "fetched");

    expect(fetched).toHaveLength(5);
    expect(fetched.map(({ requestedUrl }) => requestedUrl)).toEqual([
      "https://clinica.com.ar/contacto",
      "https://clinica.com.ar/",
      "https://clinica.com.ar/equipo",
      "https://clinica.com.ar/turnos",
      "https://clinica.com.ar/nosotros",
    ]);
    expect(fetched.map(({ requestedUrl }) => requestedUrl)).not.toContain(
      "https://clinica.com.ar/blog/nota",
    );
  });

  it("rejects non-html and oversized responses", async () => {
    const fetcher = vi.fn(async (url: string | URL) => {
      const value = String(url);
      if (value.endsWith("/robots.txt")) return new Response("", { status: 404 });
      if (value.endsWith("/archivo")) {
        return new Response("pdf", {
          headers: { "Content-Type": "application/pdf" },
        });
      }
      return html("x", 200, { "Content-Length": "2000000" });
    });
    const crawler = new OfficialWebsiteCrawler({
      fetcher,
      resolveHost: publicDns,
      maxBytes: 1000,
    });

    await expect(
      crawler.crawl({
        domain: "clinica.com.ar",
        candidateUrl: "https://clinica.com.ar/archivo",
      }),
    ).resolves.toMatchObject({
      pages: [
        { status: "non_html" },
        { status: "too_large" },
      ],
    });
  });
});
