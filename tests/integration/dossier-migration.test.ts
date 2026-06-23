import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const drizzleDirectory = join(process.cwd(), "drizzle");
const migrationNames = readdirSync(drizzleDirectory)
  .filter((name) => /^\d{4}_.+\.sql$/.test(name))
  .sort();

async function applyMigrations(
  database: PGlite,
  names: string[],
): Promise<void> {
  for (const migrationName of names) {
    await database.exec(
      readFileSync(join(drizzleDirectory, migrationName), "utf8").replaceAll(
        "--> statement-breakpoint",
        "",
      ),
    );
  }
}

async function createMigratedDatabase(): Promise<PGlite> {
  const database = new PGlite();
  await database.waitReady;
  await applyMigrations(database, migrationNames);
  return database;
}

async function seedBaseRecords(database: PGlite) {
  const targetTicketColumn = await database.query<{ exists: boolean }>(
    `select exists (
      select 1
      from information_schema.columns
      where table_name = 'campaigns'
        and column_name = 'target_ticket_band'
    ) as exists`,
  );
  const campaignTicketColumn = targetTicketColumn.rows[0]?.exists
    ? ", target_ticket_band"
    : "";
  const campaignTicketValue = targetTicketColumn.rows[0]?.exists
    ? ", 'usd_5k_15k'"
    : "";

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
      '[]'::jsonb, 'usd_5k_15k', 'Allowed', '[]'::jsonb, 1, now(),
      'user-1'
    );
    insert into campaigns (
      id, workspace_id, offer_id, created_by, name, target_daily_emails,
      paid_data_mode, state, niche_recommendation_ids, approved_niche_ids,
      version, created_at, updated_at${campaignTicketColumn}
    ) values (
      'campaign-1', 'workspace-1', 'offer-1', 'user-1', 'Campaign', 20,
      'free', 'draft', '[]'::jsonb, '[]'::jsonb, 1, now(), now()
      ${campaignTicketValue}
    );
  `);
}

async function seedCampaignCompany(database: PGlite, id: string) {
  const companyId = `company-${id}`;
  await database.query(
    `insert into companies (
      id, workspace_id, normalized_domain, display_domain, name,
      version, created_at, updated_at
    ) values ($1, 'workspace-1', $2, $2, $3, 1, now(), now())`,
    [companyId, `${id}.example`, `Company ${id}`],
  );
  await database.query(
    `insert into campaign_companies (
      id, workspace_id, campaign_id, company_id, status,
      created_at, updated_at
    ) values ($1, 'workspace-1', 'campaign-1', $2, 'researched', now(), now())`,
    [id, companyId],
  );
}

type DossierInsert = {
  id: string;
  campaignCompanyId: string;
  version: number;
  previousVersionId?: string | null;
  previousVersion?: number | null;
};

function insertDossier(
  database: Pick<PGlite, "query">,
  input: DossierInsert,
) {
  return database.query(
    `insert into dossiers (
      id, workspace_id, campaign_company_id, meeting_id, version,
      previous_version_id, previous_version, executive_summary,
      company_overview, business_model, contacts, conversation_summary,
      confirmed_needs, researched_facts, hypotheses, estimates,
      competitors, recommendations, pending_questions, created_at,
      created_by
    ) values (
      $1, 'workspace-1', $2, null, $3, $4, $5, 'Executive summary',
      'Company overview', 'Business model', '[]'::jsonb,
      'Conversation summary', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
      '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, now(),
      'user-1'
    )`,
    [
      input.id,
      input.campaignCompanyId,
      input.version,
      input.previousVersionId ?? null,
      input.previousVersion ?? null,
    ],
  );
}

describe("dossier PostgreSQL migrations", () => {
  let database: PGlite;

  beforeAll(async () => {
    database = await createMigratedDatabase();
    await seedBaseRecords(database);
  });

  afterAll(async () => {
    await database.close();
  });

  it("applies the dossier migrations in order", async () => {
    const result = await database.query<{ exists: boolean }>(
      `select exists (
        select 1
        from information_schema.columns
        where table_name = 'dossiers'
          and column_name = 'previous_version'
      ) as exists`,
    );

    expect(result.rows).toEqual([{ exists: true }]);
  });

  it("backfills predecessor versions when upgrading existing chains", async () => {
    const upgradeDatabase = new PGlite();
    await upgradeDatabase.waitReady;

    try {
      const dossierMigrationIndex = migrationNames.indexOf(
        "0010_amusing_the_anarchist.sql",
      );
      await applyMigrations(
        upgradeDatabase,
        migrationNames.slice(0, dossierMigrationIndex),
      );
      await seedBaseRecords(upgradeDatabase);
      await seedCampaignCompany(upgradeDatabase, "upgrade-chain");
      await upgradeDatabase.exec(`
        insert into dossiers (
          id, workspace_id, campaign_company_id, meeting_id, version,
          previous_version_id, executive_summary, company_overview,
          business_model, contacts, conversation_summary, confirmed_needs,
          researched_facts, hypotheses, estimates, competitors,
          recommendations, pending_questions, created_at, created_by
        ) values (
          'upgrade-v1', 'workspace-1', 'upgrade-chain', null, 1, null,
          'Executive summary', 'Company overview', 'Business model',
          '[]'::jsonb, 'Conversation summary', '[]'::jsonb, '[]'::jsonb,
          '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
          '[]'::jsonb, now(), 'user-1'
        );
        insert into dossiers (
          id, workspace_id, campaign_company_id, meeting_id, version,
          previous_version_id, executive_summary, company_overview,
          business_model, contacts, conversation_summary, confirmed_needs,
          researched_facts, hypotheses, estimates, competitors,
          recommendations, pending_questions, created_at, created_by
        ) values (
          'upgrade-v2', 'workspace-1', 'upgrade-chain', null, 2,
          'upgrade-v1', 'Executive summary', 'Company overview',
          'Business model', '[]'::jsonb, 'Conversation summary',
          '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
          '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, now(), 'user-1'
        );
      `);

      await applyMigrations(upgradeDatabase, [
        migrationNames[dossierMigrationIndex],
      ]);

      const result = await upgradeDatabase.query<{
        version: number;
        previous_version: number | null;
      }>(
        `select version, previous_version
         from dossiers
         where campaign_company_id = 'upgrade-chain'
         order by version`,
      );

      expect(result.rows).toEqual([
        { version: 1, previous_version: null },
        { version: 2, previous_version: 1 },
      ]);
    } finally {
      await upgradeDatabase.close();
    }
  });

  it("accepts a valid v1 and v2 chain", async () => {
    await seedCampaignCompany(database, "chain-valid");
    await insertDossier(database, {
      id: "chain-valid-v1",
      campaignCompanyId: "chain-valid",
      version: 1,
    });
    await insertDossier(database, {
      id: "chain-valid-v2",
      campaignCompanyId: "chain-valid",
      version: 2,
      previousVersionId: "chain-valid-v1",
      previousVersion: 1,
    });

    const result = await database.query<{ version: number }>(
      `select version from dossiers
       where campaign_company_id = 'chain-valid'
       order by version`,
    );

    expect(result.rows).toEqual([{ version: 1 }, { version: 2 }]);
  });

  it("rejects a predecessor from another dossier series", async () => {
    await seedCampaignCompany(database, "cross-series-a");
    await seedCampaignCompany(database, "cross-series-b");
    await insertDossier(database, {
      id: "cross-series-a-v1",
      campaignCompanyId: "cross-series-a",
      version: 1,
    });

    await expect(
      insertDossier(database, {
        id: "cross-series-b-v2",
        campaignCompanyId: "cross-series-b",
        version: 2,
        previousVersionId: "cross-series-a-v1",
        previousVersion: 1,
      }),
    ).rejects.toMatchObject({ code: "23503" });
  });

  it("rejects a skipped predecessor version", async () => {
    await seedCampaignCompany(database, "skipped-chain");
    await insertDossier(database, {
      id: "skipped-chain-v1",
      campaignCompanyId: "skipped-chain",
      version: 1,
    });

    await expect(
      insertDossier(database, {
        id: "skipped-chain-v3",
        campaignCompanyId: "skipped-chain",
        version: 3,
        previousVersionId: "skipped-chain-v1",
        previousVersion: 2,
      }),
    ).rejects.toMatchObject({ code: "23503" });
  });

  it("rejects a later version without predecessor version metadata", async () => {
    await seedCampaignCompany(database, "missing-predecessor-version");
    await insertDossier(database, {
      id: "missing-predecessor-version-v1",
      campaignCompanyId: "missing-predecessor-version",
      version: 1,
    });

    await expect(
      insertDossier(database, {
        id: "missing-predecessor-version-v2",
        campaignCompanyId: "missing-predecessor-version",
        version: 2,
        previousVersionId: "missing-predecessor-version-v1",
        previousVersion: null,
      }),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("rejects a v1 row with predecessor data", async () => {
    await seedCampaignCompany(database, "invalid-v1");

    await expect(
      insertDossier(database, {
        id: "invalid-v1-row",
        campaignCompanyId: "invalid-v1",
        version: 1,
        previousVersionId: "some-predecessor",
        previousVersion: 1,
      }),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("rejects UPDATE and DELETE to keep dossier rows append-only", async () => {
    await seedCampaignCompany(database, "append-only");
    await insertDossier(database, {
      id: "append-only-v1",
      campaignCompanyId: "append-only",
      version: 1,
    });

    await expect(
      database.query(
        `update dossiers
         set executive_summary = 'Mutated'
         where id = 'append-only-v1'`,
      ),
    ).rejects.toThrow(/append-only/i);
    await expect(
      database.query(`delete from dossiers where id = 'append-only-v1'`),
    ).rejects.toThrow(/append-only/i);
  });

  it("rolls back dossier and audit inserts on transaction failure", async () => {
    await seedCampaignCompany(database, "rollback");

    await expect(
      database.transaction(async (transaction) => {
        await insertDossier(transaction as Pick<PGlite, "query">, {
          id: "rollback-v1",
          campaignCompanyId: "rollback",
          version: 1,
        });
        await transaction.query(
          `insert into audit_events (
            id, workspace_id, actor_id, action, entity_id, metadata
          ) values (
            'rollback-audit', 'workspace-1', 'user-1', 'dossier.updated',
            'rollback-v1', '{}'::jsonb
          )`,
        );
        throw new Error("forced failure");
      }),
    ).rejects.toThrow("forced failure");

    const dossierCount = await database.query<{ count: number }>(
      `select count(*)::int as count
       from dossiers where campaign_company_id = 'rollback'`,
    );
    const auditCount = await database.query<{ count: number }>(
      `select count(*)::int as count
       from audit_events where id = 'rollback-audit'`,
    );

    expect(dossierCount.rows[0].count).toBe(0);
    expect(auditCount.rows[0].count).toBe(0);
  });

  it("allows only one concurrent insert for the same series version", async () => {
    await seedCampaignCompany(database, "concurrent");
    await insertDossier(database, {
      id: "concurrent-v1",
      campaignCompanyId: "concurrent",
      version: 1,
    });

    const results = await Promise.allSettled([
      insertDossier(database, {
        id: "concurrent-v2-a",
        campaignCompanyId: "concurrent",
        version: 2,
        previousVersionId: "concurrent-v1",
        previousVersion: 1,
      }),
      insertDossier(database, {
        id: "concurrent-v2-b",
        campaignCompanyId: "concurrent",
        version: 2,
        previousVersionId: "concurrent-v1",
        previousVersion: 1,
      }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(
      results.find((result) => result.status === "rejected"),
    ).toMatchObject({
      reason: { code: "23505" },
    });
  });
});
