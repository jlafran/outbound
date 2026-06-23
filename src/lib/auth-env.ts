import { z } from "zod";

const authEnvSchema = z
  .object({
    AUTH_SECRET: z.string().min(32).optional(),
    APP_URL: z.string().url().optional(),
    NEXTAUTH_URL: z.string().url().optional(),
    ALLOWED_EMAILS: z
      .string()
      .default("")
      .transform((value) =>
        value
          .split(",")
          .map((email) => email.trim().toLowerCase())
          .filter(Boolean),
      ),
    GOOGLE_CLIENT_ID: z.string().min(1).optional(),
    GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
    DEV_AUTH_PASSWORD: z.string().min(12).optional(),
  })
  .transform((value) => ({
    ...value,
    APP_URL:
      value.APP_URL ??
      value.NEXTAUTH_URL ??
      "http://localhost:3000",
  }));

export function parseAuthEnv(
  input: Record<string, string | undefined>,
) {
  return authEnvSchema.parse(input);
}

export const authEnv = parseAuthEnv(process.env);
