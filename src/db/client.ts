import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env } from "@/lib/env";

export const postgresClient = postgres(env.DATABASE_URL);
export const db = drizzle(postgresClient);
