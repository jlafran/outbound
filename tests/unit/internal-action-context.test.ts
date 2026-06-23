import { afterEach, describe, expect, it, vi } from "vitest";

import {
  InternalActionContextError,
  resolveInternalActionContext,
  resolveInternalRequestContext,
} from "@/features/app/internal-action-context";
import type { WorkspaceMembershipResolver } from "@/lib/auth";

function resolverWith(
  memberships: Awaited<
    ReturnType<WorkspaceMembershipResolver["findMembershipsByEmail"]>
  >,
): WorkspaceMembershipResolver {
  return {
    findMembershipsByEmail: vi.fn().mockResolvedValue(memberships),
  };
}

const allowedEmails = "owner@example.com";
const now = 1_750_680_000;

function requestDependencies(
  token: Record<string, unknown> | null,
  membershipResolver: WorkspaceMembershipResolver,
) {
  return {
    getRequestToken: vi.fn().mockResolvedValue(token),
    membershipResolver,
    allowedEmails,
    now: () => now,
  };
}

describe("resolveInternalActionContext", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns only the fixed E2E identity in E2E mode", async () => {
    vi.stubEnv("OUTREACH_E2E_MODE", "1");
    vi.stubEnv("NODE_ENV", "test");

    await expect(resolveInternalActionContext()).resolves.toEqual({
      workspaceId: "workspace-e2e",
      actorId: "user-e2e",
    });
  });

  it("fails closed outside E2E mode", async () => {
    vi.stubEnv("OUTREACH_E2E_MODE", "");

    await expect(
      resolveInternalActionContext(async () => null),
    ).rejects.toBeInstanceOf(InternalActionContextError);
  });

  it("uses only validated server session identity outside E2E mode", async () => {
    vi.stubEnv("OUTREACH_E2E_MODE", "");

    await expect(
      resolveInternalActionContext(async () => ({
        userId: "user-1",
        workspaceId: "workspace-1",
        user: { email: "owner@example.com" },
        expires: new Date(Date.now() + 60_000).toISOString(),
      })),
    ).resolves.toEqual({
      workspaceId: "workspace-1",
      actorId: "user-1",
    });
  });

  it("rejects incomplete server session identity", async () => {
    vi.stubEnv("OUTREACH_E2E_MODE", "");

    await expect(
      resolveInternalActionContext(async () => ({
        userId: "",
        workspaceId: "workspace-1",
        expires: new Date(Date.now() + 60_000).toISOString(),
      })),
    ).rejects.toBeInstanceOf(InternalActionContextError);
  });

  it("forbids E2E memory identity in production", async () => {
    vi.stubEnv("OUTREACH_E2E_MODE", "1");
    vi.stubEnv("NODE_ENV", "production");

    await expect(resolveInternalActionContext()).rejects.toThrow(
      "E2E_MODE_FORBIDDEN_IN_PRODUCTION",
    );
  });

  it("returns the fixed E2E request context only for non-production requests", async () => {
    vi.stubEnv("OUTREACH_E2E_MODE", "1");
    vi.stubEnv("NODE_ENV", "test");

    await expect(
      resolveInternalRequestContext(new Request("http://localhost")),
    ).resolves.toEqual({
      workspaceId: "workspace-e2e",
      actorId: "user-e2e",
    });
  });

  it("fails closed for request context resolution in production", async () => {
    vi.stubEnv("OUTREACH_E2E_MODE", "");
    vi.stubEnv("NODE_ENV", "production");

    await expect(
      resolveInternalRequestContext(
        new Request("http://localhost"),
        requestDependencies(null, resolverWith([])),
      ),
    ).resolves.toBeNull();
  });

  it("accepts a fresh validated JWT without querying membership", async () => {
    vi.stubEnv("OUTREACH_E2E_MODE", "");
    const resolver = resolverWith([]);

    await expect(
      resolveInternalRequestContext(
        new Request("http://localhost"),
        requestDependencies(
          {
          sub: "provider-sub",
          userId: "user-1",
          workspaceId: "workspace-1",
            email: "owner@example.com",
            authorizationCheckedAt: now - 299,
          },
          resolver,
        ),
      ),
    ).resolves.toEqual({
      workspaceId: "workspace-1",
      actorId: "user-1",
    });
    expect(resolver.findMembershipsByEmail).not.toHaveBeenCalled();
  });

  it("denies a due JWT when its email was removed from the allowlist", async () => {
    vi.stubEnv("OUTREACH_E2E_MODE", "");
    const resolver = resolverWith([
      { userId: "user-1", workspaceId: "workspace-1" },
    ]);

    await expect(
      resolveInternalRequestContext(
        new Request("http://localhost"),
        {
          ...requestDependencies(
            {
              userId: "user-1",
              workspaceId: "workspace-1",
              email: "owner@example.com",
              authorizationCheckedAt: now - 300,
            },
            resolver,
          ),
          allowedEmails: "",
        },
      ),
    ).resolves.toBeNull();
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
  ])("denies a due JWT after revalidation finds %s", async (_, memberships) => {
    vi.stubEnv("OUTREACH_E2E_MODE", "");

    await expect(
      resolveInternalRequestContext(
        new Request("http://localhost"),
        requestDependencies(
          {
            userId: "user-1",
            workspaceId: "workspace-1",
            email: "owner@example.com",
            authorizationCheckedAt: now - 300,
          },
          resolverWith(memberships),
        ),
      ),
    ).resolves.toBeNull();
  });

  it.each([undefined, "invalid", Number.NaN, Number.POSITIVE_INFINITY])(
    "revalidates a JWT with malformed authorization timestamp %s",
    async (authorizationCheckedAt) => {
      vi.stubEnv("OUTREACH_E2E_MODE", "");
      const resolver = resolverWith([
        { userId: "user-1", workspaceId: "workspace-1" },
      ]);

      await expect(
        resolveInternalRequestContext(
          new Request("http://localhost"),
          requestDependencies(
            {
              userId: "user-1",
              workspaceId: "workspace-1",
              email: " OWNER@example.com ",
              authorizationCheckedAt,
            },
            resolver,
          ),
        ),
      ).resolves.toEqual({
        workspaceId: "workspace-1",
        actorId: "user-1",
      });
      expect(resolver.findMembershipsByEmail).toHaveBeenCalledWith(
        "owner@example.com",
      );
    },
  );
});
