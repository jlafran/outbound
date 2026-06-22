import type { NextRequest } from "next/server";

export type InternalActionContext = {
  workspaceId: string;
  actorId: string;
};

export class InternalActionContextError extends Error {
  readonly code = "AUTH_REQUIRED";

  constructor() {
    super("AUTH_REQUIRED");
    this.name = "InternalActionContextError";
  }
}

export async function resolveInternalActionContext(): Promise<InternalActionContext> {
  if (process.env.OUTREACH_E2E_MODE === "1") {
    if (process.env.NODE_ENV === "production") {
      throw new Error("E2E_MODE_FORBIDDEN_IN_PRODUCTION");
    }

    return {
      workspaceId: "workspace-e2e",
      actorId: "user-e2e",
    };
  }

  throw new InternalActionContextError();
}

async function resolveTokenRequestContext(
  request: Request,
): Promise<InternalActionContext | null> {
  const [{ env }, { getToken }] = await Promise.all([
    import("@/lib/env"),
    import("next-auth/jwt"),
  ]);
  const token = await getToken({
    req: request as NextRequest,
    secret: env.AUTH_SECRET,
  });

  return token &&
    typeof token.sub === "string" &&
    token.sub.length > 0 &&
    typeof token.workspaceId === "string" &&
    token.workspaceId.length > 0
    ? {
        workspaceId: token.workspaceId,
        actorId: token.sub,
      }
    : null;
}

export async function resolveInternalRequestContext(
  request: Request,
): Promise<InternalActionContext | null> {
  if (process.env.OUTREACH_E2E_MODE === "1") {
    if (process.env.NODE_ENV === "production") {
      return null;
    }

    return {
      workspaceId: "workspace-e2e",
      actorId: "user-e2e",
    };
  }

  return resolveTokenRequestContext(request);
}
