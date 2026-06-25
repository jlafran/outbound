export type BraveSearchResult = {
  title: string;
  url: string;
  description: string;
  domain: string;
};

export type BraveSearchInput = {
  query: string;
  count: number;
  country?: string;
  searchLang?: string;
  includeKnownPlatforms?: boolean;
};

export class BraveSearchError extends Error {
  constructor(
    readonly code: "BRAVE_SEARCH_REQUEST_FAILED",
    readonly status: number,
  ) {
    super(code);
    this.name = "BraveSearchError";
  }
}

type BraveSearchClientOptions = {
  apiKey: string;
  fetcher?: typeof fetch;
};

type BraveApiResult = {
  title?: unknown;
  url?: unknown;
  description?: unknown;
};

type BraveApiResponse = {
  web?: {
    results?: BraveApiResult[];
  };
};

const ignoredDomains = new Set([
  "linkedin.com",
  "facebook.com",
  "instagram.com",
  "x.com",
  "twitter.com",
  "youtube.com",
]);

function normalizeDomain(
  value: string,
  options: { includeKnownPlatforms?: boolean } = {},
): string | null {
  try {
    const hostname = new URL(value).hostname
      .toLowerCase()
      .replace(/^www\./, "");
    if (!hostname.includes(".")) return null;
    if (
      !options.includeKnownPlatforms &&
      [...ignoredDomains].some(
        (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
      )
    ) {
      return null;
    }
    return hostname;
  } catch {
    return null;
  }
}

export class BraveSearchClient {
  private readonly fetcher: typeof fetch;

  constructor(private readonly options: BraveSearchClientOptions) {
    this.fetcher = options.fetcher ?? fetch;
  }

  async searchWeb(input: BraveSearchInput): Promise<BraveSearchResult[]> {
    const params = new URLSearchParams({
      q: input.query,
      count: String(input.count),
    });
    if (input.country) params.set("country", input.country);
    if (input.searchLang) params.set("search_lang", input.searchLang);

    const response = await this.fetcher(
      `https://api.search.brave.com/res/v1/web/search?${params.toString()}`,
      {
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip",
          "X-Subscription-Token": this.options.apiKey,
        },
      },
    );

    if (!response.ok) {
      throw new BraveSearchError(
        "BRAVE_SEARCH_REQUEST_FAILED",
        response.status,
      );
    }

    const body = (await response.json()) as BraveApiResponse;
    const seen = new Set<string>();
    const normalized: BraveSearchResult[] = [];

    for (const result of body.web?.results ?? []) {
      if (
        typeof result.title !== "string" ||
        typeof result.url !== "string"
      ) {
        continue;
      }
      const domain = normalizeDomain(result.url, {
        includeKnownPlatforms: input.includeKnownPlatforms,
      });
      if (!domain || seen.has(domain)) continue;
      seen.add(domain);
      normalized.push({
        title: result.title,
        url: result.url,
        description:
          typeof result.description === "string" ? result.description : "",
        domain,
      });
    }

    return normalized;
  }
}
