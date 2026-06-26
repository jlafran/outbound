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

  it("supports No2Bounce-style emailList requests and list responses", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            {
              email: "mlopez@example.com",
              status: "valid",
            },
          ],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
    const verifier = new ReacherEmailVerifier({
      endpoint: "https://api.no2bounce.example",
      path: "/verify",
      apiToken: "secret-token",
      authHeaderName: "apitoken",
      authHeaderPrefix: "",
      requestBodyMode: "emailList",
      fetcher,
    });

    await expect(verifier.verify("mlopez@example.com")).resolves.toEqual({
      status: "valid",
    });
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.no2bounce.example/verify",
      expect.objectContaining({
        body: JSON.stringify({
          emailList: ["mlopez@example.com"],
        }),
        headers: {
          "Content-Type": "application/json",
          apitoken: "secret-token",
        },
      }),
    );
  });

  it("supports No2Bounce single-email tracking flow", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            message: "Success",
            statusCode: 200,
            data: { trackingId: "track-123" },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            trackingId: "track-123",
            email: "mlopez@example.com",
            result: {
              score: "60",
              scoreStatus: "Catch-All",
            },
            overallStatus: "Completed",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );
    const verifier = new ReacherEmailVerifier({
      endpoint: "https://connect.no2bounce.com",
      path: "/v2/n2b_validate_email",
      apiToken: "secret-token",
      authHeaderName: "apitoken",
      authHeaderPrefix: "",
      requestBodyMode: "no2bounceSingle",
      fetcher,
    });

    await expect(verifier.verify("mlopez@example.com")).resolves.toEqual({
      status: "risky",
    });
    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      "https://connect.no2bounce.com/v2/n2b_validate_email",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ email: "mlopez@example.com" }),
      }),
    );
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      "https://connect.no2bounce.com/v2/n2b_validate_email?trackingId=track-123",
      expect.objectContaining({
        method: "GET",
      }),
    );
  });

  it("polls No2Bounce until the tracking result is completed", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: { trackingId: "track-456" },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            trackingId: "track-456",
            overallStatus: "Processing",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            trackingId: "track-456",
            result: { scoreStatus: "Deliverable" },
            overallStatus: "Completed",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );
    const verifier = new ReacherEmailVerifier({
      endpoint: "https://connect.no2bounce.com",
      path: "/v2/n2b_validate_email",
      apiToken: "secret-token",
      authHeaderName: "apitoken",
      authHeaderPrefix: "",
      requestBodyMode: "no2bounceSingle",
      no2BouncePollDelayMs: 0,
      fetcher,
    });

    await expect(verifier.verify("valid@example.com")).resolves.toEqual({
      status: "valid",
    });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("returns pending when No2Bounce is still processing after polling", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: { trackingId: "track-pending" },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      )
      .mockImplementation(async () =>
        new Response(
          JSON.stringify({
            trackingId: "track-pending",
            overallStatus: "Processing",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );
    const verifier = new ReacherEmailVerifier({
      endpoint: "https://connect.no2bounce.com",
      path: "/v2/n2b_validate_email",
      apiToken: "secret-token",
      authHeaderName: "apitoken",
      authHeaderPrefix: "",
      requestBodyMode: "no2bounceSingle",
      no2BouncePollAttempts: 2,
      no2BouncePollDelayMs: 0,
      fetcher,
    });

    await expect(verifier.verify("pending@example.com")).resolves.toEqual({
      status: "pending",
    });
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
