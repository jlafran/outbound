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
  fetcher?: typeof fetch;
};

type ReacherResponse = {
  is_reachable?: unknown;
};

export class ReacherEmailVerifier implements EmailVerifier {
  private readonly endpoint: string;
  private readonly fetcher: typeof fetch;

  constructor(options: ReacherEmailVerifierOptions) {
    this.endpoint = options.endpoint.replace(/\/$/, "");
    this.fetcher = options.fetcher ?? fetch;
  }

  async verify(email: string): Promise<EmailVerificationResult> {
    try {
      const response = await this.fetcher(`${this.endpoint}/v0/check_email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
