import { afterEach, describe, expect, it, vi } from "vitest";

import {
  InternalActionContextError,
  resolveInternalActionContext,
  resolveInternalRequestContext,
} from "@/features/app/internal-action-context";

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
        async () => null,
      ),
    ).resolves.toBeNull();
  });

  it("uses only validated JWT identity for request context", async () => {
    vi.stubEnv("OUTREACH_E2E_MODE", "");

    await expect(
      resolveInternalRequestContext(
        new Request("http://localhost"),
        async () => ({
          sub: "provider-sub",
          userId: "user-1",
          workspaceId: "workspace-1",
        }),
      ),
    ).resolves.toEqual({
      workspaceId: "workspace-1",
      actorId: "user-1",
    });
  });
});
