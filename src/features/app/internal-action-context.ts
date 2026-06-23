import type { NextRequest } from "next/server";
import type { Session } from "next-auth";
import type { JWT } from "next-auth/jwt";

import {
  getServerAuthSession,
  validateTokenAuthorization,
  type WorkspaceMembershipResolver,
} from "@/lib/auth";

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

export function validateInternalIdentity(
  identity:
    | {
        userId?: unknown;
        workspaceId?: unknown;
      }
    | null
    | undefined,
): InternalActionContext | null {
  return identity &&
    typeof identity.userId === "string" &&
    identity.userId.length > 0 &&
    typeof identity.workspaceId === "string" &&
    identity.workspaceId.length > 0
    ? {
        workspaceId: identity.workspaceId,
        actorId: identity.userId,
      }
    : null;
}

export async function resolveInternalActionContext(
  getSession: () => Promise<Session | null> = getServerAuthSession,
): Promise<InternalActionContext> {
  if (process.env.OUTREACH_E2E_MODE === "1") {
    if (process.env.NODE_ENV === "production") {
      throw new Error("E2E_MODE_FORBIDDEN_IN_PRODUCTION");
    }

    return {
      workspaceId: "workspace-e2e",
      actorId: "user-e2e",
    };
  }

  let session: Session | null;
  try {
    session = await getSession();
  } catch {
    throw new InternalActionContextError();
  }
  const context = validateInternalIdentity(session);
  if (context) return context;
  throw new InternalActionContextError();
}

type RequestContextDependencies = {
  getRequestToken: (request: Request) => Promise<JWT | null>;
  membershipResolver: WorkspaceMembershipResolver;
  allowedEmails: string | string[] | undefined;
  now: () => number;
};

async function defaultRequestContextDependencies(): Promise<RequestContextDependencies> {
  const [{ env }, { lazyDrizzleMembershipResolver }, { getToken }] =
    await Promise.all([
      import("@/lib/env"),
      import("@/lib/auth"),
      import("next-auth/jwt"),
    ]);
  return {
    async getRequestToken(request) {
      return getToken({
        req: request as NextRequest,
        secret: env.AUTH_SECRET,
      });
    },
    membershipResolver: lazyDrizzleMembershipResolver,
    allowedEmails: env.ALLOWED_EMAILS,
    now: () => Math.floor(Date.now() / 1000),
  };
}

async function resolveTokenRequestContext(
  request: Request,
  dependencies?: RequestContextDependencies,
): Promise<InternalActionContext | null> {
  const resolvedDependencies =
    dependencies ?? (await defaultRequestContextDependencies());
  const token = await resolvedDependencies.getRequestToken(request);
  const authorization = await validateTokenAuthorization(
    token,
    resolvedDependencies.allowedEmails,
    resolvedDependencies.membershipResolver,
    resolvedDependencies.now(),
  );
  return authorization
    ? {
        workspaceId: authorization.member.workspaceId,
        actorId: authorization.member.userId,
      }
    : null;
}

export async function resolveInternalRequestContext(
  request: Request,
  dependencies?: RequestContextDependencies,
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

  return resolveTokenRequestContext(request, dependencies);
}
