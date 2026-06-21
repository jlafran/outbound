import { afterEach, describe, expect, it, vi } from "vitest";

import {
  InternalActionContextError,
  resolveInternalActionContext,
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

    await expect(resolveInternalActionContext()).rejects.toBeInstanceOf(
      InternalActionContextError,
    );
  });

  it("forbids E2E memory identity in production", async () => {
    vi.stubEnv("OUTREACH_E2E_MODE", "1");
    vi.stubEnv("NODE_ENV", "production");

    await expect(resolveInternalActionContext()).rejects.toThrow(
      "E2E_MODE_FORBIDDEN_IN_PRODUCTION",
    );
  });
});
