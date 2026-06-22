import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  AUTH_SECRET: z.string().min(32).optional(),
  APP_URL: z.string().url().default("http://localhost:3000"),
  ALLOWED_EMAILS: z.string().transform((value) =>
    value
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  ),
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  DEV_AUTH_PASSWORD: z.string().min(12).optional(),
});

export function parseEnv(input: Record<string, string | undefined>) {
  return envSchema.parse(input);
}

export const env = parseEnv(process.env);
