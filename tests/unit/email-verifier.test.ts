import { describe, expect, it, vi } from "vitest";

import { ReacherEmailVerifier } from "@/features/prospecting/email-verifier";

describe("ReacherEmailVerifier", () => {
  it("maps Reacher safe/risky/invalid responses to prospecting verification statuses", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          input: "mariana.lopez@clinicadental.com.ar",
          is_reachable: "safe",
          misc: { is_role_account: false },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const verifier = new ReacherEmailVerifier({
      endpoint: "http://localhost:8080",
      fetcher,
    });

    await expect(
      verifier.verify("mariana.lopez@clinicadental.com.ar"),
    ).resolves.toEqual({
      status: "valid",
    });
    expect(fetcher).toHaveBeenCalledWith(
      "http://localhost:8080/v0/check_email",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          to_email: "mariana.lopez@clinicadental.com.ar",
        }),
      }),
    );
  });

  it("can send a hosted API token with a custom path and auth header", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ is_reachable: "risky" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const verifier = new ReacherEmailVerifier({
      endpoint: "https://api.example.com",
      path: "/check_email",
      apiToken: "secret-token",
      authHeaderName: "X-API-Key",
      authHeaderPrefix: "",
      fetcher,
    });

    await expect(verifier.verify("mlopez@example.com")).resolves.toEqual({
      status: "risky",
    });
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.example.com/check_email",
      expect.objectContaining({
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": "secret-token",
        },
      }),
    );
  });

  it("returns unknown instead of throwing when the verifier is unavailable", async () => {
    const verifier = new ReacherEmailVerifier({
      endpoint: "http://localhost:8080",
      fetcher: vi.fn().mockRejectedValue(new Error("offline")),
    });

    await expect(verifier.verify("x@example.com")).resolves.toEqual({
      status: "unknown",
    });
  });
});
