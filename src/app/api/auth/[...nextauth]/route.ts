import NextAuth from "next-auth";
import { NextResponse } from "next/server";

import {
  authOptions,
  getAuthConfigurationError,
  resolveAuthEnvironment,
} from "@/lib/auth";
import { authEnv } from "@/lib/auth-env";

const nextAuthHandler = NextAuth(authOptions);

async function handler(
  request: Request,
  context: { params: Promise<{ nextauth: string[] }> },
) {
  const configurationError = getAuthConfigurationError(
    resolveAuthEnvironment(process.env.NODE_ENV),
    authEnv,
  );
  if (configurationError) {
    return NextResponse.json(
      { error: "AUTH_CONFIGURATION_ERROR" },
      { status: 500 },
    );
  }
  return nextAuthHandler(request, context);
}

export { handler as GET, handler as POST };
