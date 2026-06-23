import {
  getAuthProviderVisibility,
  resolveAuthEnvironment,
  sanitizeCallbackUrl,
} from "@/lib/auth";
import { authEnv } from "@/lib/auth-env";

import { SignInForm } from "./signin-form";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{
    callbackUrl?: string | string[];
    error?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const callbackUrl = sanitizeCallbackUrl(
    typeof params.callbackUrl === "string"
      ? params.callbackUrl
      : undefined,
  );
  const { showCredentials, showGoogle } = getAuthProviderVisibility(
    resolveAuthEnvironment(process.env.NODE_ENV),
    authEnv,
  );

  return (
    <main>
      <SignInForm
        callbackUrl={callbackUrl}
        hasError={typeof params.error === "string"}
        showCredentials={showCredentials}
        showGoogle={showGoogle}
      />
    </main>
  );
}
