import { sanitizeCallbackUrl } from "@/lib/auth";

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
  const isProduction = process.env.NODE_ENV === "production";
  const showGoogle = Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET,
  );
  const showCredentials =
    !isProduction &&
    typeof process.env.DEV_AUTH_PASSWORD === "string" &&
    process.env.DEV_AUTH_PASSWORD.length >= 12;

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
