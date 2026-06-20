import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  AUTH_SECRET: z.string().min(32),
  APP_URL: z.string().url().default("http://localhost:3000"),
  ALLOWED_EMAILS: z.string().transform((value) =>
    value
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  ),
});

export function parseEnv(input: Record<string, string | undefined>) {
  return envSchema.parse(input);
}

export const env = parseEnv(process.env);
