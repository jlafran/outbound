import { afterEach, describe, expect, it, vi } from "vitest";

import {
  authenticateWorkspaceMember,
  createAuthOptions,
  getAuthConfigurationError,
  normalizeEmail,
  resolveE2EIdentity,
  sanitizeCallbackUrl,
  type WorkspaceMembershipResolver,
} from "@/lib/auth";

function resolverWith(
  memberships: Awaited<
    ReturnType<WorkspaceMembershipResolver["findMembershipsByEmail"]>
  >,
): WorkspaceMembershipResolver {
  return {
    findMembershipsByEmail: vi.fn().mockResolvedValue(memberships),
  };
}

const baseEnv = {
  AUTH_SECRET: "a".repeat(32),
  ALLOWED_EMAILS: " owner@example.com ",
  APP_URL: "http://localhost:3000",
  NEXTAUTH_URL: "http://localhost:3000",
  GOOGLE_CLIENT_ID: "google-client",
  GOOGLE_CLIENT_SECRET: "google-secret",
  DEV_AUTH_PASSWORD: "development-password",
};

async function runJwtCallback(
  options: ReturnType<typeof createAuthOptions>,
  token: Record<string, unknown>,
) {
  const jwt = options.callbacks?.jwt;
  if (!jwt) throw new Error("Expected JWT callback");
  return jwt({
    token,
    user: undefined,
    account: null,
    profile: undefined,
    trigger: undefined,
    isNewUser: false,
    session: undefined,
  } as never);
}

describe("internal authentication", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("normalizes allowed emails before resolving membership", async () => {
    const resolver = resolverWith([
      { userId: "user-1", workspaceId: "workspace-1" },
    ]);

    await expect(
      authenticateWorkspaceMember(
        " OWNER@Example.com ",
        baseEnv.ALLOWED_EMAILS,
        resolver,
      ),
    ).resolves.toEqual({
      email: "owner@example.com",
      userId: "user-1",
      workspaceId: "workspace-1",
    });
    expect(resolver.findMembershipsByEmail).toHaveBeenCalledWith(
      "owner@example.com",
    );
    expect(normalizeEmail(" OWNER@Example.com ")).toBe(
      "owner@example.com",
    );
  });

  it("denies every email when ALLOWED_EMAILS is empty", async () => {
    const resolver = resolverWith([
      { userId: "user-1", workspaceId: "workspace-1" },
    ]);

    await expect(
      authenticateWorkspaceMember("owner@example.com", "", resolver),
    ).resolves.toBeNull();
    expect(resolver.findMembershipsByEmail).not.toHaveBeenCalled();
  });

  it("denies a user with no workspace membership", async () => {
    await expect(
      authenticateWorkspaceMember(
        "owner@example.com",
        baseEnv.ALLOWED_EMAILS,
        resolverWith([]),
      ),
    ).resolves.toBeNull();
  });

  it("authenticates a user with exactly one workspace membership", async () => {
    await expect(
      authenticateWorkspaceMember(
        "owner@example.com",
        baseEnv.ALLOWED_EMAILS,
        resolverWith([
          { userId: "user-1", workspaceId: "workspace-1" },
        ]),
      ),
    ).resolves.toMatchObject({
      userId: "user-1",
      workspaceId: "workspace-1",
    });
  });

  it("rejects multiple memberships without choosing one", async () => {
    await expect(
      authenticateWorkspaceMember(
        "owner@example.com",
        baseEnv.ALLOWED_EMAILS,
        resolverWith([
          { userId: "user-1", workspaceId: "workspace-1" },
          { userId: "user-1", workspaceId: "workspace-2" },
        ]),
      ),
    ).rejects.toThrow("MULTIPLE_WORKSPACES_UNSUPPORTED");
  });

  it("uses Google only in production and reports missing Google config lazily", () => {
    const resolver = resolverWith([]);
    const configured = createAuthOptions({
      environment: "production",
      env: baseEnv,
      membershipResolver: resolver,
    });
    const missing = createAuthOptions({
      environment: "production",
      env: {
        AUTH_SECRET: baseEnv.AUTH_SECRET,
        ALLOWED_EMAILS: baseEnv.ALLOWED_EMAILS,
        APP_URL: "https://outreach.example.com",
        NEXTAUTH_URL: "https://outreach.example.com",
        DEV_AUTH_PASSWORD: baseEnv.DEV_AUTH_PASSWORD,
      },
      membershipResolver: resolver,
    });

    expect(configured.providers.map((provider) => provider.id)).toEqual([
      "google",
    ]);
    expect(missing.providers).toEqual([]);
    expect(
      getAuthConfigurationError("production", {
        AUTH_SECRET: baseEnv.AUTH_SECRET,
        ALLOWED_EMAILS: baseEnv.ALLOWED_EMAILS,
        APP_URL: "https://outreach.example.com",
        NEXTAUTH_URL: "https://outreach.example.com",
      }),
    ).toBe("GOOGLE_AUTH_NOT_CONFIGURED");
  });

  it("rejects production auth when NEXTAUTH_URL is missing", () => {
    expect(
      getAuthConfigurationError("production", {
        ...baseEnv,
        NEXTAUTH_URL: undefined,
      }),
    ).toBe("NEXTAUTH_URL_NOT_CONFIGURED");
  });

  it("rejects an HTTP NEXTAUTH_URL in production", () => {
    expect(
      getAuthConfigurationError("production", {
        ...baseEnv,
        APP_URL: "https://outreach.example.com",
        NEXTAUTH_URL: "http://outreach.example.com",
      }),
    ).toBe("NEXTAUTH_URL_MUST_USE_HTTPS");
  });

  it("rejects a production NEXTAUTH_URL on a different application origin", () => {
    expect(
      getAuthConfigurationError("production", {
        ...baseEnv,
        APP_URL: "https://outreach.example.com",
        NEXTAUTH_URL: "https://auth.example.com",
      }),
    ).toBe("AUTH_ORIGIN_MISMATCH");
  });

  it("accepts aligned HTTPS production origins and enables secure cookies", () => {
    const env = {
      ...baseEnv,
      APP_URL: "https://outreach.example.com",
      NEXTAUTH_URL: "https://outreach.example.com/",
    };
    const options = createAuthOptions({
      environment: "production",
      env,
      membershipResolver: resolverWith([]),
    });

    expect(getAuthConfigurationError("production", env)).toBeNull();
    expect(options.useSecureCookies).toBe(true);
  });

  it("accepts localhost HTTP origins in development without secure cookies", () => {
    const options = createAuthOptions({
      environment: "development",
      env: baseEnv,
      membershipResolver: resolverWith([]),
    });

    expect(getAuthConfigurationError("development", baseEnv)).toBeNull();
    expect(options.useSecureCookies).toBe(false);
  });

  it("never enables credentials in production", () => {
    const options = createAuthOptions({
      environment: "production",
      env: baseEnv,
      membershipResolver: resolverWith([]),
    });

    expect(options.providers.map((provider) => provider.id)).not.toContain(
      "credentials",
    );
  });

  it("requires the shared development password and an allowed member", async () => {
    const resolver = resolverWith([
      { userId: "user-1", workspaceId: "workspace-1" },
    ]);
    const options = createAuthOptions({
      environment: "development",
      env: baseEnv,
      membershipResolver: resolver,
    });
    const credentials = options.providers.find(
      (provider) => provider.id === "credentials",
    );
    const authorize = (
      credentials as unknown as {
        options: {
          authorize: (
            credentials: Record<string, string>,
            request: unknown,
          ) => Promise<unknown>;
        };
      }
    ).options.authorize;

    await expect(
      Promise.resolve(
        authorize(
        {
          email: "owner@example.com",
          password: "wrong-password",
        },
        {},
        ),
      ),
    ).resolves.toBeNull();
    expect(resolver.findMembershipsByEmail).toHaveBeenCalledWith(
      "owner@example.com",
    );
    await expect(
      Promise.resolve(
        authorize(
        {
          email: "owner@example.com",
          password: baseEnv.DEV_AUTH_PASSWORD,
        },
        {},
        ),
      ),
    ).resolves.toMatchObject({
      id: "user-1",
      email: "owner@example.com",
      userId: "user-1",
      workspaceId: "workspace-1",
    });
  });

  it("does not enable development credentials with a short secret", () => {
    const options = createAuthOptions({
      environment: "development",
      env: { ...baseEnv, DEV_AUTH_PASSWORD: "too-short" },
      membershipResolver: resolverWith([]),
    });

    expect(options.providers.map((provider) => provider.id)).not.toContain(
      "credentials",
    );
  });

  it("propagates only server-resolved identity through JWT and session", async () => {
    const options = createAuthOptions({
      environment: "development",
      env: baseEnv,
      membershipResolver: resolverWith([
        { userId: "user-1", workspaceId: "workspace-1" },
      ]),
    });
    const jwt = options.callbacks?.jwt;
    const session = options.callbacks?.session;
    if (!jwt || !session) throw new Error("Expected auth callbacks");

    const token = await jwt({
      token: {},
      user: {
        id: "provider-user",
        email: " OWNER@example.com ",
        workspaceId: "malicious-user-workspace",
      } as never,
      account: { workspaceId: "malicious-account-workspace" } as never,
      profile: { workspaceId: "malicious-profile-workspace" } as never,
      trigger: "signIn",
      isNewUser: false,
      session: undefined,
    });

    expect(token).toMatchObject({
      sub: "user-1",
      userId: "user-1",
      workspaceId: "workspace-1",
      email: "owner@example.com",
      authorizationCheckedAt: expect.any(Number),
    });

    const result = await session({
      session: {
        user: {
          email: "owner@example.com",
          userId: "malicious-session-user",
          workspaceId: "malicious-session-workspace",
        },
        expires: new Date(Date.now() + 60_000).toISOString(),
      },
      token,
      user: {} as never,
      newSession: undefined,
      trigger: "update",
    });

    expect(result).toMatchObject({
      userId: "user-1",
      workspaceId: "workspace-1",
      user: {
        userId: "user-1",
        workspaceId: "workspace-1",
      },
    });
  });

  it("strips stale workspace identity from a session after JWT revocation", async () => {
    const options = createAuthOptions({
      environment: "development",
      env: baseEnv,
      membershipResolver: resolverWith([]),
    });
    const session = options.callbacks?.session;
    if (!session) throw new Error("Expected session callback");

    const result = await session({
      session: {
        userId: "stale-user",
        workspaceId: "stale-workspace",
        user: {
          email: "owner@example.com",
          userId: "stale-user",
          workspaceId: "stale-workspace",
        },
        expires: new Date(Date.now() + 60_000).toISOString(),
      },
      token: { email: "owner@example.com" },
      user: {} as never,
      newSession: undefined,
      trigger: "update",
    });

    expect(result).not.toHaveProperty("userId");
    expect(result).not.toHaveProperty("workspaceId");
    expect(result.user).not.toHaveProperty("userId");
    expect(result.user).not.toHaveProperty("workspaceId");
  });

  it("revokes an existing JWT when its email is removed from the allowlist", async () => {
    const resolver = resolverWith([
      { userId: "user-1", workspaceId: "workspace-1" },
    ]);
    const options = createAuthOptions({
      environment: "development",
      env: { ...baseEnv, ALLOWED_EMAILS: "" },
      membershipResolver: resolver,
    });

    const token = await runJwtCallback(options, {
      sub: "user-1",
      userId: "user-1",
      workspaceId: "workspace-1",
      email: " OWNER@example.com ",
    });

    expect(token).not.toHaveProperty("sub");
    expect(token).not.toHaveProperty("userId");
    expect(token).not.toHaveProperty("workspaceId");
    expect(resolver.findMembershipsByEmail).not.toHaveBeenCalled();
  });

  it.each([
    ["zero memberships", []],
    [
      "multiple memberships",
      [
        { userId: "user-1", workspaceId: "workspace-1" },
        { userId: "user-1", workspaceId: "workspace-2" },
      ],
    ],
    [
      "a changed user",
      [{ userId: "user-2", workspaceId: "workspace-1" }],
    ],
    [
      "a changed workspace",
      [{ userId: "user-1", workspaceId: "workspace-2" }],
    ],
  ])("revokes an existing JWT after revalidation finds %s", async (_, memberships) => {
    const options = createAuthOptions({
      environment: "development",
      env: baseEnv,
      membershipResolver: resolverWith(memberships),
    });

    const token = await runJwtCallback(options, {
      sub: "user-1",
      userId: "user-1",
      workspaceId: "workspace-1",
      email: "owner@example.com",
    });

    expect(token).not.toHaveProperty("sub");
    expect(token).not.toHaveProperty("userId");
    expect(token).not.toHaveProperty("workspaceId");
  });

  it("does not revalidate an existing JWT before the authorization interval", async () => {
    vi.setSystemTime(new Date("2026-06-23T12:00:00Z"));
    const resolver = resolverWith([]);
    const options = createAuthOptions({
      environment: "development",
      env: baseEnv,
      membershipResolver: resolver,
    });

    const token = await runJwtCallback(options, {
      sub: "user-1",
      userId: "user-1",
      workspaceId: "workspace-1",
      email: "owner@example.com",
      authorizationCheckedAt: Math.floor(Date.now() / 1000) - 299,
    });

    expect(token).toMatchObject({
      userId: "user-1",
      workspaceId: "workspace-1",
    });
    expect(resolver.findMembershipsByEmail).not.toHaveBeenCalled();
  });

  it("revalidates an existing JWT after the authorization interval", async () => {
    vi.setSystemTime(new Date("2026-06-23T12:00:00Z"));
    const resolver = resolverWith([
      { userId: "user-1", workspaceId: "workspace-1" },
    ]);
    const options = createAuthOptions({
      environment: "development",
      env: baseEnv,
      membershipResolver: resolver,
    });

    const token = await runJwtCallback(options, {
      sub: "user-1",
      userId: "user-1",
      workspaceId: "workspace-1",
      email: " OWNER@example.com ",
      authorizationCheckedAt: Math.floor(Date.now() / 1000) - 300,
    });

    expect(resolver.findMembershipsByEmail).toHaveBeenCalledWith(
      "owner@example.com",
    );
    expect(token).toMatchObject({
      userId: "user-1",
      workspaceId: "workspace-1",
      email: "owner@example.com",
      authorizationCheckedAt: Math.floor(Date.now() / 1000),
    });
  });

  it.each([undefined, "not-a-timestamp", Number.NaN, Number.POSITIVE_INFINITY])(
    "fail-safe revalidates a JWT with malformed authorization timestamp %s",
    async (authorizationCheckedAt) => {
      const resolver = resolverWith([
        { userId: "user-1", workspaceId: "workspace-1" },
      ]);
      const options = createAuthOptions({
        environment: "development",
        env: baseEnv,
        membershipResolver: resolver,
      });

      await runJwtCallback(options, {
        sub: "user-1",
        userId: "user-1",
        workspaceId: "workspace-1",
        email: "owner@example.com",
        authorizationCheckedAt,
      });

      expect(resolver.findMembershipsByEmail).toHaveBeenCalledOnce();
    },
  );

  it("limits JWT sessions to eight hours", () => {
    const options = createAuthOptions({
      environment: "development",
      env: baseEnv,
      membershipResolver: resolverWith([]),
    });

    expect(options.session?.maxAge).toBe(8 * 60 * 60);
    expect(options.jwt?.maxAge).toBe(8 * 60 * 60);
  });

  it("sanitizes callback URLs to same-origin relative paths", () => {
    expect(sanitizeCallbackUrl("/campaigns/one?tab=two")).toBe(
      "/campaigns/one?tab=two",
    );
    expect(sanitizeCallbackUrl("https://evil.example/phish")).toBe("/");
    expect(sanitizeCallbackUrl("//evil.example/phish")).toBe("/");
    expect(sanitizeCallbackUrl("/\\evil.example/phish")).toBe("/");
    expect(sanitizeCallbackUrl("/%5Cevil.example/phish")).toBe("/");
    expect(sanitizeCallbackUrl("campaigns/one")).toBe("/");
  });

  it("forbids the fixed E2E identity in production", () => {
    expect(() => resolveE2EIdentity("production", "1")).toThrow(
      "E2E_MODE_FORBIDDEN_IN_PRODUCTION",
    );
    expect(resolveE2EIdentity("test", "1")).toEqual({
      userId: "user-e2e",
      workspaceId: "workspace-e2e",
    });
    expect(resolveE2EIdentity("test", "")).toBeNull();
  });
});
