import type { DefaultSession, DefaultUser } from "next-auth";
import type { DefaultJWT } from "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    userId?: string;
    workspaceId?: string;
    user?: DefaultSession["user"] & {
      userId?: string;
      workspaceId?: string;
    };
  }

  interface User extends DefaultUser {
    userId?: string;
    workspaceId?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    userId?: string;
    workspaceId?: string;
    authorizationCheckedAt?: number;
  }
}
