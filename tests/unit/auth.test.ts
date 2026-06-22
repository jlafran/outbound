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
  GOOGLE_CLIENT_ID: "google-client",
  GOOGLE_CLIENT_SECRET: "google-secret",
  DEV_AUTH_PASSWORD: "development-password",
};

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
      }),
    ).toBe("GOOGLE_AUTH_NOT_CONFIGURED");
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
    const options = createAuthOptions({
      environment: "development",
      env: baseEnv,
      membershipResolver: resolverWith([
        { userId: "user-1", workspaceId: "workspace-1" },
      ]),
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
