export type EmailVerificationStatus =
  | "valid"
  | "risky"
  | "invalid"
  | "unknown";

export type EmailVerificationResult = {
  status: EmailVerificationStatus;
};

export interface EmailVerifier {
  verify(email: string): Promise<EmailVerificationResult>;
}

type ReacherEmailVerifierOptions = {
  endpoint: string;
  path?: string;
  apiToken?: string;
  authHeaderName?: string;
  authHeaderPrefix?: string;
  requestBodyMode?: "to_email" | "emailList" | "no2bounceSingle";
  fetcher?: typeof fetch;
};

type ReacherResponse = {
  is_reachable?: unknown;
  status?: unknown;
  result?: unknown;
  results?: unknown;
  data?: unknown;
};

export class ReacherEmailVerifier implements EmailVerifier {
  private readonly endpoint: string;
  private readonly path: string;
  private readonly apiToken?: string;
  private readonly authHeaderName: string;
  private readonly authHeaderPrefix: string;
  private readonly requestBodyMode: "to_email" | "emailList" | "no2bounceSingle";
  private readonly fetcher: typeof fetch;

  constructor(options: ReacherEmailVerifierOptions) {
    this.endpoint = options.endpoint.replace(/\/$/, "");
    this.path = options.path ?? "/v0/check_email";
    this.apiToken = options.apiToken;
    this.authHeaderName = options.authHeaderName ?? "Authorization";
    this.authHeaderPrefix = options.authHeaderPrefix ?? "Bearer";
    this.requestBodyMode = options.requestBodyMode ?? "to_email";
    this.fetcher = options.fetcher ?? fetch;
  }

  async verify(email: string): Promise<EmailVerificationResult> {
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (this.apiToken) {
        headers[this.authHeaderName] = this.authHeaderPrefix
          ? `${this.authHeaderPrefix} ${this.apiToken}`
          : this.apiToken;
      }
      if (this.requestBodyMode === "no2bounceSingle") {
        return this.verifyNo2BounceSingle(email, headers);
      }
      const response = await this.fetcher(`${this.endpoint}${this.path}`, {
        method: "POST",
        headers,
        body: JSON.stringify(
          this.requestBodyMode === "emailList"
            ? { emailList: [email] }
            : { to_email: email },
        ),
      });
      if (!response.ok) return { status: "unknown" };

      const body = (await response.json()) as ReacherResponse;
      return { status: mapVerifierStatus(extractStatus(body)) };
    } catch {
      return { status: "unknown" };
    }
  }

  private async verifyNo2BounceSingle(
    email: string,
    headers: Record<string, string>,
  ): Promise<EmailVerificationResult> {
    const submit = await this.fetcher(`${this.endpoint}${this.path}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ email }),
    });
    if (!submit.ok) return { status: "unknown" };
    const submitBody = (await submit.json()) as ReacherResponse;
    const trackingId = extractTrackingId(submitBody);
    if (!trackingId) return { status: "unknown" };

    const result = await this.fetcher(
      `${this.endpoint}${this.path}?trackingId=${encodeURIComponent(
        trackingId,
      )}`,
      {
        method: "GET",
        headers,
      },
    );
    if (!result.ok) return { status: "unknown" };
    const resultBody = (await result.json()) as ReacherResponse;
    return { status: mapVerifierStatus(extractStatus(resultBody)) };
  }
}

function extractStatus(body: ReacherResponse): unknown {
  if (body.is_reachable !== undefined) return body.is_reachable;
  if (body.status !== undefined) return body.status;
  if (body.result && typeof body.result === "object" && !Array.isArray(body.result)) {
    const result = body.result as Record<string, unknown>;
    return result.scoreStatus ?? result.status ?? result.result;
  }
  if (Array.isArray(body.results)) {
    return extractStatusFromListItem(body.results[0]);
  }
  if (Array.isArray(body.data)) {
    return extractStatusFromListItem(body.data[0]);
  }
  if (Array.isArray(body.result)) {
    return extractStatusFromListItem(body.result[0]);
  }
  return body.result;
}

function extractTrackingId(body: ReacherResponse): string | null {
  const direct = (body as Record<string, unknown>).trackingId;
  if (typeof direct === "string" && direct) return direct;
  const data = body.data;
  if (!data || typeof data !== "object") return null;
  const trackingId = (data as Record<string, unknown>).trackingId;
  return typeof trackingId === "string" && trackingId ? trackingId : null;
}

function extractStatusFromListItem(value: unknown): unknown {
  if (!value || typeof value !== "object") return undefined;
  const item = value as Record<string, unknown>;
  return (
    (item.result && typeof item.result === "object"
      ? (item.result as Record<string, unknown>).scoreStatus
      : undefined) ??
    item.status ??
    item.scoreStatus ??
    item.result ??
    item.is_reachable ??
    item.deliverability ??
    item.state
  );
}

function mapVerifierStatus(value: unknown): EmailVerificationStatus {
  const normalized = String(value ?? "").toLowerCase();
  if (
    normalized === "safe" ||
    normalized === "valid" ||
    normalized === "deliverable" ||
    normalized === "ok"
  ) {
    return "valid";
  }
  if (
    normalized === "risky" ||
    normalized === "catch-all" ||
    normalized === "catch all" ||
    normalized === "catch_all" ||
    normalized === "accept_all" ||
    normalized === "unknown_accept_all"
  ) {
    return "risky";
  }
  if (value === "safe") return "valid";
  if (
    normalized === "invalid" ||
    normalized === "undeliverable" ||
    normalized === "bad" ||
    normalized === "failed"
  ) {
    return "invalid";
  }
  return "unknown";
}
