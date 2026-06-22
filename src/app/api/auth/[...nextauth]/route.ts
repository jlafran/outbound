import NextAuth from "next-auth";
import { NextResponse } from "next/server";

import {
  authOptions,
  getAuthConfigurationError,
  type AuthEnvironment,
} from "@/lib/auth";

const nextAuthHandler = NextAuth(authOptions);

function environment(): AuthEnvironment {
  return process.env.NODE_ENV === "production"
    ? "production"
    : process.env.NODE_ENV === "test"
      ? "test"
      : "development";
}

async function handler(
  request: Request,
  context: { params: Promise<{ nextauth: string[] }> },
) {
  const configurationError = getAuthConfigurationError(
    environment(),
    process.env,
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
