"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";

type SignInFormProps = {
  callbackUrl: string;
  showGoogle: boolean;
  showCredentials: boolean;
  hasError: boolean;
};

export function SignInForm({
  callbackUrl,
  showGoogle,
  showCredentials,
  hasError,
}: SignInFormProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(hasError);

  async function signInWithGoogle() {
    setPending(true);
    setError(false);
    await signIn("google", { callbackUrl });
  }

  async function signInWithCredentials(formData: FormData) {
    setPending(true);
    setError(false);
    const result = await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      callbackUrl,
      redirect: false,
    });
    if (!result?.ok) {
      setError(true);
      setPending(false);
      return;
    }
    window.location.assign(result.url ?? callbackUrl);
  }

  return (
    <section aria-labelledby="signin-title">
      <h1 id="signin-title">Ingresar a Outreach</h1>
      <p>Usá tu cuenta interna autorizada.</p>
      {error ? (
        <p role="alert">No pudimos iniciar sesión. Verificá tus datos.</p>
      ) : null}
      {showGoogle ? (
        <button
          type="button"
          disabled={pending}
          onClick={signInWithGoogle}
        >
          Continuar con Google
        </button>
      ) : null}
      {showCredentials ? (
        <form action={signInWithCredentials}>
          <label>
            Email
            <input
              autoComplete="email"
              name="email"
              required
              type="email"
            />
          </label>
          <label>
            Contraseña de desarrollo
            <input
              autoComplete="current-password"
              minLength={12}
              name="password"
              required
              type="password"
            />
          </label>
          <button disabled={pending} type="submit">
            Ingresar
          </button>
        </form>
      ) : null}
      {!showGoogle && !showCredentials ? (
        <p role="alert">
          La autenticación interna no está configurada.
        </p>
      ) : null}
    </section>
  );
}
