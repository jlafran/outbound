import { createHash, timingSafeEqual } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";
import type { AuthOptions, Session } from "next-auth";
import { getServerSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";

import type { db as applicationDb } from "@/db/client";
import { users, workspaceMembers } from "@/db/schema";
import { authEnv } from "@/lib/auth-env";

export type AuthEnvironment = "development" | "production" | "test";

export type WorkspaceMembership = {
  userId: string;
  workspaceId: string;
};

export interface WorkspaceMembershipResolver {
  findMembershipsByEmail(
    normalizedEmail: string,
  ): Promise<WorkspaceMembership[]>;
}

export type AuthenticatedWorkspaceMember = WorkspaceMembership & {
  email: string;
};

export type AuthEnvironmentVariables = {
  AUTH_SECRET?: string;
  ALLOWED_EMAILS?: string | string[];
  APP_URL?: string;
  NEXTAUTH_URL?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  DEV_AUTH_PASSWORD?: string;
};

type CreateAuthOptionsInput = {
  environment: AuthEnvironment;
  env: AuthEnvironmentVariables;
  membershipResolver: WorkspaceMembershipResolver;
};

export const AUTHORIZATION_REVALIDATION_SECONDS = 5 * 60;
const AUTH_SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function stripTokenAuthorization<T extends Record<string, unknown>>(
  token: T,
): T {
  delete token.userId;
  delete token.workspaceId;
  delete token.sub;
  delete token.authorizationCheckedAt;
  return token;
}

function authorizationRevalidationRequired(
  checkedAt: unknown,
  now: number,
): boolean {
  return (
    typeof checkedAt !== "number" ||
    !Number.isSafeInteger(checkedAt) ||
    checkedAt < 0 ||
    checkedAt > now ||
    now - checkedAt >= AUTHORIZATION_REVALIDATION_SECONDS
  );
}

type TokenAuthorizationClaims = {
  email?: unknown;
  userId?: unknown;
  workspaceId?: unknown;
  authorizationCheckedAt?: unknown;
};

export type TokenAuthorizationValidation = {
  member: AuthenticatedWorkspaceMember;
  revalidated: boolean;
};

export async function validateTokenAuthorization(
  token: TokenAuthorizationClaims | null | undefined,
  allowedEmails: string | string[] | undefined,
  resolver: WorkspaceMembershipResolver,
  now: number = Math.floor(Date.now() / 1000),
): Promise<TokenAuthorizationValidation | null> {
  if (
    !token ||
    typeof token.email !== "string" ||
    typeof token.userId !== "string" ||
    token.userId.length === 0 ||
    typeof token.workspaceId !== "string" ||
    token.workspaceId.length === 0
  ) {
    return null;
  }

  const email = normalizeEmail(token.email);
  if (email.length === 0) return null;

  if (
    !authorizationRevalidationRequired(
      token.authorizationCheckedAt,
      now,
    )
  ) {
    return {
      member: {
        email,
        userId: token.userId,
        workspaceId: token.workspaceId,
      },
      revalidated: false,
    };
  }

  try {
    const member = await authenticateWorkspaceMember(
      email,
      allowedEmails,
      resolver,
    );
    if (
      !member ||
      member.userId !== token.userId ||
      member.workspaceId !== token.workspaceId
    ) {
      return null;
    }
    return { member, revalidated: true };
  } catch {
    return null;
  }
}

function timingSafePasswordMatches(
  candidate: string,
  expected: string,
): boolean {
  const candidateDigest = createHash("sha256").update(candidate).digest();
  const expectedDigest = createHash("sha256").update(expected).digest();
  return timingSafeEqual(candidateDigest, expectedDigest);
}

function allowedEmailSet(value: string | string[] | undefined): Set<string> {
  return new Set(
    (Array.isArray(value) ? value : (value ?? "").split(","))
      .map(normalizeEmail)
      .filter(Boolean),
  );
}

export async function authenticateWorkspaceMember(
  email: string,
  allowedEmails: string | string[] | undefined,
  resolver: WorkspaceMembershipResolver,
): Promise<AuthenticatedWorkspaceMember | null> {
  const normalizedEmail = normalizeEmail(email);
  if (
    normalizedEmail.length === 0 ||
    !allowedEmailSet(allowedEmails).has(normalizedEmail)
  ) {
    return null;
  }

  const memberships =
    await resolver.findMembershipsByEmail(normalizedEmail);
  if (memberships.length === 0) {
    return null;
  }
  if (memberships.length !== 1) {
    throw new Error("MULTIPLE_WORKSPACES_UNSUPPORTED");
  }

  return {
    email: normalizedEmail,
    ...memberships[0],
  };
}

export function createDrizzleWorkspaceMembershipResolver(
  database: Pick<typeof applicationDb, "select">,
): WorkspaceMembershipResolver {
  return {
    async findMembershipsByEmail(normalizedEmail) {
      return database
        .select({
          userId: users.id,
          workspaceId: workspaceMembers.workspaceId,
        })
        .from(users)
        .innerJoin(
          workspaceMembers,
          eq(workspaceMembers.userId, users.id),
        )
        .where(
          and(
            eq(
              sql<string>`lower(btrim(${users.email}))`,
              normalizedEmail,
            ),
          ),
        );
    },
  };
}

export const lazyDrizzleMembershipResolver: WorkspaceMembershipResolver = {
  async findMembershipsByEmail(normalizedEmail) {
    const { db } = await import("@/db/client");
    return createDrizzleWorkspaceMembershipResolver(
      db,
    ).findMembershipsByEmail(normalizedEmail);
  },
};

export function getAuthConfigurationError(
  environment: AuthEnvironment,
  env: AuthEnvironmentVariables,
): string | null {
  if (!env.AUTH_SECRET || env.AUTH_SECRET.length < 32) {
    return "AUTH_SECRET_NOT_CONFIGURED";
  }
  if (environment === "production") {
    if (!env.NEXTAUTH_URL) {
      return "NEXTAUTH_URL_NOT_CONFIGURED";
    }
    let nextAuthUrl: URL;
    try {
      nextAuthUrl = new URL(env.NEXTAUTH_URL);
    } catch {
      return "NEXTAUTH_URL_INVALID";
    }
    if (nextAuthUrl.protocol !== "https:") {
      return "NEXTAUTH_URL_MUST_USE_HTTPS";
    }
    if (env.APP_URL) {
      let appUrl: URL;
      try {
        appUrl = new URL(env.APP_URL);
      } catch {
        return "APP_URL_INVALID";
      }
      if (appUrl.origin !== nextAuthUrl.origin) {
        return "AUTH_ORIGIN_MISMATCH";
      }
    }
  }
  if (
    environment === "production" &&
    (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET)
  ) {
    return "GOOGLE_AUTH_NOT_CONFIGURED";
  }
  return null;
}

export function resolveAuthEnvironment(
  nodeEnvironment: string | undefined,
): AuthEnvironment {
  return nodeEnvironment === "production"
    ? "production"
    : nodeEnvironment === "test"
      ? "test"
      : "development";
}

export function getAuthProviderVisibility(
  environment: AuthEnvironment,
  env: AuthEnvironmentVariables,
): { showGoogle: boolean; showCredentials: boolean } {
  return {
    showGoogle:
      environment === "production" &&
      Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
    showCredentials:
      environment !== "production" &&
      typeof env.DEV_AUTH_PASSWORD === "string" &&
      env.DEV_AUTH_PASSWORD.length >= 12,
  };
}

export function createAuthOptions({
  environment,
  env,
  membershipResolver,
}: CreateAuthOptionsInput): AuthOptions {
  const providers: AuthOptions["providers"] = [];
  const visibility = getAuthProviderVisibility(environment, env);
  if (visibility.showGoogle) {
    providers.push(
      GoogleProvider({
        clientId: env.GOOGLE_CLIENT_ID!,
        clientSecret: env.GOOGLE_CLIENT_SECRET!,
      }),
    );
  }

  if (visibility.showCredentials) {
    providers.push(
      CredentialsProvider({
        name: "Development credentials",
        credentials: {
          email: { label: "Email", type: "email" },
          password: { label: "Password", type: "password" },
        },
        async authorize(credentials) {
          const passwordMatches = timingSafePasswordMatches(
            credentials?.password ?? "",
            env.DEV_AUTH_PASSWORD!,
          );
          let member: AuthenticatedWorkspaceMember | null = null;
          try {
            member = await authenticateWorkspaceMember(
              credentials?.email ?? "",
              env.ALLOWED_EMAILS,
              membershipResolver,
            );
          } catch {
            return null;
          }
          return passwordMatches && member
            ? {
                id: member.userId,
                email: member.email,
                userId: member.userId,
                workspaceId: member.workspaceId,
              }
            : null;
        },
      }),
    );
  }

  return {
    secret: env.AUTH_SECRET,
    useSecureCookies: environment === "production",
    session: {
      strategy: "jwt",
      maxAge: AUTH_SESSION_MAX_AGE_SECONDS,
    },
    jwt: { maxAge: AUTH_SESSION_MAX_AGE_SECONDS },
    providers,
    pages: { signIn: "/auth/signin" },
    callbacks: {
      async signIn({ user }) {
        if (!user.email) return false;
        try {
          return Boolean(
            await authenticateWorkspaceMember(
              user.email,
              env.ALLOWED_EMAILS,
              membershipResolver,
            ),
          );
        } catch {
          return false;
        }
      },
      async jwt({ token, user }) {
        if (!user) {
          const now = Math.floor(Date.now() / 1000);
          const authorization = await validateTokenAuthorization(
            token,
            env.ALLOWED_EMAILS,
            membershipResolver,
            now,
          );
          if (!authorization) {
            return stripTokenAuthorization(token);
          }
          token.email = authorization.member.email;
          if (authorization.revalidated) {
            token.authorizationCheckedAt = now;
          }
          return token;
        }
        if (!user.email) {
          return stripTokenAuthorization(token);
        }
        try {
          const member = await authenticateWorkspaceMember(
            user.email,
            env.ALLOWED_EMAILS,
            membershipResolver,
          );
          if (!member) {
            return stripTokenAuthorization(token);
          }
          token.sub = member.userId;
          token.userId = member.userId;
          token.workspaceId = member.workspaceId;
          token.email = member.email;
          token.authorizationCheckedAt = Math.floor(Date.now() / 1000);
          return token;
        } catch {
          return stripTokenAuthorization(token);
        }
      },
      async session({ session, token }) {
        if (
          typeof token.userId !== "string" ||
          token.userId.length === 0 ||
          typeof token.workspaceId !== "string" ||
          token.workspaceId.length === 0
        ) {
          delete session.userId;
          delete session.workspaceId;
          if (session.user) {
            delete session.user.userId;
            delete session.user.workspaceId;
          }
          return session;
        }
        session.userId = token.userId;
        session.workspaceId = token.workspaceId;
        if (session.user) {
          session.user.userId = token.userId;
          session.user.workspaceId = token.workspaceId;
        }
        return session;
      },
    },
  };
}

export const authOptions = createAuthOptions({
  environment: resolveAuthEnvironment(process.env.NODE_ENV),
  env: authEnv,
  membershipResolver: lazyDrizzleMembershipResolver,
});

export function resolveE2EIdentity(
  environment: AuthEnvironment,
  mode: string | undefined,
): WorkspaceMembership | null {
  if (mode !== "1") return null;
  if (environment === "production") {
    throw new Error("E2E_MODE_FORBIDDEN_IN_PRODUCTION");
  }
  return {
    userId: "user-e2e",
    workspaceId: "workspace-e2e",
  };
}

export async function getServerAuthSession(): Promise<Session | null> {
  const e2eIdentity = resolveE2EIdentity(
    resolveAuthEnvironment(process.env.NODE_ENV),
    process.env.OUTREACH_E2E_MODE,
  );
  if (e2eIdentity) {
    return {
      ...e2eIdentity,
      user: {
        userId: e2eIdentity.userId,
        workspaceId: e2eIdentity.workspaceId,
      },
      expires: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    };
  }
  return getServerSession(authOptions);
}

export function sanitizeCallbackUrl(
  callbackUrl: string | null | undefined,
): string {
  if (
    !callbackUrl ||
    !callbackUrl.startsWith("/") ||
    callbackUrl.startsWith("//") ||
    callbackUrl.includes("\\") ||
    /%5c/i.test(callbackUrl)
  ) {
    return "/";
  }
  return callbackUrl;
}
