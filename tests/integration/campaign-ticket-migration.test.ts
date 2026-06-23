import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const drizzleDirectory = join(process.cwd(), "drizzle");
const migrationNames = readdirSync(drizzleDirectory)
  .filter((name) => /^\d{4}_.+\.sql$/.test(name))
  .sort();

async function applyMigrations(database: PGlite, names: string[]) {
  for (const migrationName of names) {
    await database.exec(
      readFileSync(join(drizzleDirectory, migrationName), "utf8").replaceAll(
        "--> statement-breakpoint",
        "",
      ),
    );
  }
}

async function seedCampaignBeforeTargetTicket(database: PGlite) {
  await database.exec(`
    insert into users (id, email, name, created_at)
    values ('user-1', 'user-1@example.com', 'User One', now());
    insert into workspaces (id, name, created_at)
    values ('workspace-1', 'Workspace One', now());
    insert into workspace_members (workspace_id, user_id, role, created_at)
    values ('workspace-1', 'user-1', 'owner', now());
    insert into offers (
      id, workspace_id, name, raw_text, problems, expected_results,
      ticket_band, allowed_pilot, prohibited_claims, version, created_at,
      created_by
    ) values (
      'offer-1', 'workspace-1', 'Offer', 'Raw offer', '[]'::jsonb,
      '[]'::jsonb, 'usd_15k_plus', 'Allowed', '[]'::jsonb, 1, now(),
      'user-1'
    );
    insert into campaigns (
      id, workspace_id, offer_id, created_by, name, target_daily_emails,
      paid_data_mode, state, niche_recommendation_ids, approved_niche_ids,
      version, created_at, updated_at
    ) values (
      'campaign-1', 'workspace-1', 'offer-1', 'user-1', 'Campaign', 20,
      'free', 'draft', '[]'::jsonb, '[]'::jsonb, 1, now(), now()
    );
  `);
}

describe("campaign target ticket migration", () => {
  it("backfills existing campaigns from their linked offer before enforcing not null", async () => {
    const database = new PGlite();
    await database.waitReady;

    try {
      await applyMigrations(database, migrationNames.slice(0, -1));
      await seedCampaignBeforeTargetTicket(database);
      await applyMigrations(database, migrationNames.slice(-1));

      const result = await database.query<{
        target_ticket_band: string;
      }>(
        `select target_ticket_band
         from campaigns
         where id = 'campaign-1'`,
      );

      expect(result.rows).toEqual([
        { target_ticket_band: "usd_15k_plus" },
      ]);
      await expect(
        database.exec(`
          insert into campaigns (
            id, workspace_id, offer_id, created_by, name,
            target_daily_emails, paid_data_mode, state,
            niche_recommendation_ids, approved_niche_ids, version,
            created_at, updated_at
          ) values (
            'campaign-2', 'workspace-1', 'offer-1', 'user-1',
            'Missing ticket', 20, 'free', 'draft', '[]'::jsonb,
            '[]'::jsonb, 1, now(), now()
          )
        `),
      ).rejects.toMatchObject({ code: "23502" });
    } finally {
      await database.close();
    }
  });
});
