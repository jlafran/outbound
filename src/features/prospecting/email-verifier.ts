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
  fetcher?: typeof fetch;
};

type ReacherResponse = {
  is_reachable?: unknown;
};

export class ReacherEmailVerifier implements EmailVerifier {
  private readonly endpoint: string;
  private readonly path: string;
  private readonly apiToken?: string;
  private readonly authHeaderName: string;
  private readonly authHeaderPrefix: string;
  private readonly fetcher: typeof fetch;

  constructor(options: ReacherEmailVerifierOptions) {
    this.endpoint = options.endpoint.replace(/\/$/, "");
    this.path = options.path ?? "/v0/check_email";
    this.apiToken = options.apiToken;
    this.authHeaderName = options.authHeaderName ?? "Authorization";
    this.authHeaderPrefix = options.authHeaderPrefix ?? "Bearer";
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
      const response = await this.fetcher(`${this.endpoint}${this.path}`, {
        method: "POST",
        headers,
        body: JSON.stringify({ to_email: email }),
      });
      if (!response.ok) return { status: "unknown" };

      const body = (await response.json()) as ReacherResponse;
      return { status: mapReacherStatus(body.is_reachable) };
    } catch {
      return { status: "unknown" };
    }
  }
}

function mapReacherStatus(value: unknown): EmailVerificationStatus {
  if (value === "safe") return "valid";
  if (value === "risky") return "risky";
  if (value === "invalid") return "invalid";
  return "unknown";
}
