import { describe, expect, it, vi } from "vitest";

import {
  BraveSearchClient,
  BraveSearchError,
} from "@/features/research/brave-search-client";

function createResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

describe("BraveSearchClient", () => {
  it("sends the subscription token and search parameters", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      createResponse({
        web: { results: [] },
      }),
    );
    const client = new BraveSearchClient({
      apiKey: "secret-brave-key",
      fetcher,
    });

    await client.searchWeb({
      query: "empresas logística Argentina",
      count: 7,
      country: "AR",
      searchLang: "es",
    });

    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(
      "https://api.search.brave.com/res/v1/web/search?",
    );
    expect(url).toContain("q=empresas+log%C3%ADstica+Argentina");
    expect(url).toContain("count=7");
    expect(url).toContain("country=AR");
    expect(url).toContain("search_lang=es");
    expect(init.headers).toMatchObject({
      Accept: "application/json",
      "Accept-Encoding": "gzip",
      "X-Subscription-Token": "secret-brave-key",
    });
  });

  it("normalizes and deduplicates public web results by domain", async () => {
    const client = new BraveSearchClient({
      apiKey: "key",
      fetcher: vi.fn().mockResolvedValue(
        createResponse({
          web: {
            results: [
              {
                title: "ACME Logística",
                url: "https://www.acme.com.ar/servicios?utm=1",
                description: "Operador logístico argentino.",
              },
              {
                title: "ACME Contacto",
                url: "https://acme.com.ar/contacto",
                description: "Contacto comercial.",
              },
              {
                title: "LinkedIn",
                url: "https://www.linkedin.com/company/acme",
                description: "Red social.",
              },
              {
                title: "Sin URL",
                description: "Debe ignorarse.",
              },
            ],
          },
        }),
      ),
    });

    await expect(
      client.searchWeb({ query: "acme", count: 10 }),
    ).resolves.toEqual([
      {
        title: "ACME Logística",
        url: "https://www.acme.com.ar/servicios?utm=1",
        description: "Operador logístico argentino.",
        domain: "acme.com.ar",
      },
    ]);
  });

  it("can keep known platforms when a people-search flow needs public profiles", async () => {
    const client = new BraveSearchClient({
      apiKey: "key",
      fetcher: vi.fn().mockResolvedValue(
        createResponse({
          web: {
            results: [
              {
                title: "Dra. María López - Directora",
                url: "https://www.linkedin.com/in/maria-lopez-odontologia",
                description: "Directora odontológica en Clínica Palermo.",
              },
            ],
          },
        }),
      ),
    });

    await expect(
      client.searchWeb({
        query: "site:linkedin.com/in clínica directora",
        count: 10,
        includeKnownPlatforms: true,
      }),
    ).resolves.toEqual([
      {
        title: "Dra. María López - Directora",
        url: "https://www.linkedin.com/in/maria-lopez-odontologia",
        description: "Directora odontológica en Clínica Palermo.",
        domain: "linkedin.com",
      },
    ]);
  });

  it("throws a non-secret error for non-success responses", async () => {
    const client = new BraveSearchClient({
      apiKey: "very-secret-token",
      fetcher: vi.fn().mockResolvedValue(
        createResponse(
          { message: "quota exceeded for very-secret-token" },
          { status: 429, statusText: "Too Many Requests" },
        ),
      ),
    });

    await expect(
      client.searchWeb({ query: "x", count: 1 }),
    ).rejects.toMatchObject({
      name: "BraveSearchError",
      code: "BRAVE_SEARCH_REQUEST_FAILED",
      status: 429,
    } satisfies Partial<BraveSearchError>);
    await expect(
      client.searchWeb({ query: "x", count: 1 }),
    ).rejects.not.toThrow("very-secret-token");
  });
});
