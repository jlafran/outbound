import { z } from "zod";

import { parseAuthEnv } from "@/lib/auth-env";

export function parseEnv(input: Record<string, string | undefined>) {
  return {
    ...parseAuthEnv(input),
    DATABASE_URL: z.string().url().parse(input.DATABASE_URL),
  };
}

export const env = parseEnv(process.env);
