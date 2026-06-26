import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const drizzleDirectory = join(process.cwd(), "drizzle");
const migrationNames = readdirSync(drizzleDirectory)
  .filter((name) => /^\d{4}_.+\.sql$/.test(name))
  .sort();

async function applyMigrations(database: PGlite) {
  for (const migrationName of migrationNames) {
    await database.exec(
      readFileSync(join(drizzleDirectory, migrationName), "utf8").replaceAll(
        "--> statement-breakpoint",
        "",
      ),
    );
  }
}

describe("prospecting persistence migration", () => {
  it("creates workspace-scoped run and verification tables with RLS", async () => {
    expect(
      migrationNames.some((name) => name.startsWith("0014_")),
    ).toBe(true);

    const database = new PGlite();
    await database.waitReady;

    try {
      await applyMigrations(database);
      const tables = await database.query<{
        relname: string;
        relrowsecurity: boolean;
      }>(`
        select relname, relrowsecurity
        from pg_class
        where relname in (
          'prospecting_runs',
          'prospecting_email_verifications'
        )
        order by relname
      `);
      expect(tables.rows).toEqual([
        {
          relname: "prospecting_email_verifications",
          relrowsecurity: true,
        },
        { relname: "prospecting_runs", relrowsecurity: true },
      ]);

      const indexes = await database.query<{ indexname: string }>(`
        select indexname
        from pg_indexes
        where tablename in (
          'prospecting_runs',
          'prospecting_email_verifications'
        )
      `);
      expect(indexes.rows.map(({ indexname }) => indexname)).toEqual(
        expect.arrayContaining([
          "prospecting_runs_workspace_campaign_latest_idx",
          "prospecting_verifications_run_domain_email_unique",
          "prospecting_verifications_pending_idx",
          "prospecting_verifications_workspace_run_idx",
        ]),
      );
    } finally {
      await database.close();
    }
  });
});
