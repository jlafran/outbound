export type EmailVerificationStatus =
  | "valid"
  | "risky"
  | "invalid"
  | "pending"
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
  no2BouncePollAttempts?: number;
  no2BouncePollDelayMs?: number;
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
  private readonly no2BouncePollAttempts: number;
  private readonly no2BouncePollDelayMs: number;
  private readonly fetcher: typeof fetch;

  constructor(options: ReacherEmailVerifierOptions) {
    this.endpoint = options.endpoint.replace(/\/$/, "");
    this.path = options.path ?? "/v0/check_email";
    this.apiToken = options.apiToken;
    this.authHeaderName = options.authHeaderName ?? "Authorization";
    this.authHeaderPrefix = options.authHeaderPrefix ?? "Bearer";
    this.requestBodyMode = options.requestBodyMode ?? "to_email";
    this.no2BouncePollAttempts = options.no2BouncePollAttempts ?? 3;
    this.no2BouncePollDelayMs = options.no2BouncePollDelayMs ?? 750;
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
      console.info("email_verifier_submit", {
        mode: this.requestBodyMode,
        emailHash: hashEmailForLog(email),
      });
      const response = await this.fetcher(`${this.endpoint}${this.path}`, {
        method: "POST",
        headers,
        body: JSON.stringify(
          this.requestBodyMode === "emailList"
            ? { emailList: [email] }
            : { to_email: email },
        ),
      });
      if (!response.ok) {
        console.info("email_verifier_submit_failed", {
          mode: this.requestBodyMode,
          status: response.status,
          emailHash: hashEmailForLog(email),
        });
        return { status: "unknown" };
      }

      const body = (await response.json()) as ReacherResponse;
      const status = mapVerifierStatus(extractStatus(body));
      console.info("email_verifier_result", {
        mode: this.requestBodyMode,
        status,
        emailHash: hashEmailForLog(email),
      });
      return { status };
    } catch (error) {
      console.error("email_verifier_error", {
        mode: this.requestBodyMode,
        emailHash: hashEmailForLog(email),
        error: error instanceof Error ? error.message : "unknown",
      });
      return { status: "unknown" };
    }
  }

  private async verifyNo2BounceSingle(
    email: string,
    headers: Record<string, string>,
  ): Promise<EmailVerificationResult> {
    console.info("email_verifier_submit", {
      mode: "no2bounceSingle",
      emailHash: hashEmailForLog(email),
    });
    const submit = await this.fetcher(`${this.endpoint}${this.path}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ email }),
    });
    if (!submit.ok) {
      console.info("email_verifier_submit_failed", {
        mode: "no2bounceSingle",
        status: submit.status,
        emailHash: hashEmailForLog(email),
      });
      return { status: "unknown" };
    }
    const submitBody = (await submit.json()) as ReacherResponse;
    const trackingId = extractTrackingId(submitBody);
    if (!trackingId) {
      console.info("email_verifier_tracking_missing", {
        mode: "no2bounceSingle",
        emailHash: hashEmailForLog(email),
      });
      return { status: "unknown" };
    }

    let sawProcessing = false;
    for (let attempt = 1; attempt <= this.no2BouncePollAttempts; attempt += 1) {
      if (attempt > 1 && this.no2BouncePollDelayMs > 0) {
        await delay(this.no2BouncePollDelayMs);
      }
      const result = await this.fetcher(
        `${this.endpoint}${this.path}?trackingId=${encodeURIComponent(
          trackingId,
        )}`,
        {
          method: "GET",
          headers,
        },
      );
      if (!result.ok) {
        console.info("email_verifier_result_failed", {
          mode: "no2bounceSingle",
          attempt,
          status: result.status,
          emailHash: hashEmailForLog(email),
        });
        continue;
      }
      const resultBody = (await result.json()) as ReacherResponse;
      const status = mapVerifierStatus(extractStatus(resultBody));
      const overallStatus = extractOverallStatus(resultBody);
      console.info("email_verifier_result", {
        mode: "no2bounceSingle",
        attempt,
        status,
        overallStatus,
        emailHash: hashEmailForLog(email),
      });
      if (overallStatus === "Processing" || overallStatus === "Queued") {
        sawProcessing = true;
      }
      if (status !== "unknown" || overallStatus === "Completed") {
        return { status };
      }
    }

    return { status: sawProcessing ? "pending" : "unknown" };
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function extractOverallStatus(body: ReacherResponse): string | undefined {
  const value = (body as Record<string, unknown>).overallStatus;
  return typeof value === "string" ? value : undefined;
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

function hashEmailForLog(email: string): string {
  let hash = 0;
  for (let index = 0; index < email.length; index += 1) {
    hash = (hash * 31 + email.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16);
}
