import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import type { DentalAestheticsProspectingResult } from "@/features/prospecting/dental-prospecting-service";

import { campaigns } from "./campaigns";
import { workspaces } from "./workspaces";

export const prospectingRunStatusValues = [
  "running",
  "completed",
  "failed",
] as const;
export const prospectingVerificationStatusValues = [
  "unverified",
  "valid",
  "risky",
  "invalid",
  "pending",
  "unknown",
] as const;

export const prospectingRunStatus = pgEnum(
  "prospecting_run_status",
  prospectingRunStatusValues,
);
export const prospectingVerificationStatus = pgEnum(
  "prospecting_verification_status",
  prospectingVerificationStatusValues,
);

export const prospectingRuns = pgTable(
  "prospecting_runs",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    campaignId: text("campaign_id").notNull(),
    profile: text("profile").notNull(),
    status: prospectingRunStatus("status").notNull(),
    resultSnapshot: jsonb("result_snapshot").$type<DentalAestheticsProspectingResult>(),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    foreignKey({
      name: "prospecting_runs_workspace_campaign_fk",
      columns: [table.workspaceId, table.campaignId],
      foreignColumns: [campaigns.workspaceId, campaigns.id],
    }),
    uniqueIndex("prospecting_runs_workspace_id_unique").on(
      table.workspaceId,
      table.id,
    ),
    index("prospecting_runs_workspace_campaign_latest_idx").on(
      table.workspaceId,
      table.campaignId,
      table.createdAt,
      table.id,
    ),
    check(
      "prospecting_runs_result_status_check",
      sql`case when ${table.status} = 'completed' then ${table.resultSnapshot} is not null and ${table.completedAt} is not null else true end`,
    ),
  ],
);

export const prospectingEmailVerifications = pgTable(
  "prospecting_email_verifications",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    campaignId: text("campaign_id").notNull(),
    runId: text("run_id").notNull(),
    leadDomain: text("lead_domain").notNull(),
    email: text("email").notNull(),
    source: text("source").notNull(),
    provider: text("provider"),
    status: prospectingVerificationStatus("status").notNull(),
    providerTrackingId: text("provider_tracking_id"),
    checkedAt: timestamp("checked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    foreignKey({
      name: "prospecting_verifications_workspace_campaign_fk",
      columns: [table.workspaceId, table.campaignId],
      foreignColumns: [campaigns.workspaceId, campaigns.id],
    }),
    foreignKey({
      name: "prospecting_verifications_workspace_run_fk",
      columns: [table.workspaceId, table.runId],
      foreignColumns: [prospectingRuns.workspaceId, prospectingRuns.id],
    }),
    uniqueIndex("prospecting_verifications_run_domain_email_unique").on(
      table.runId,
      table.leadDomain,
      table.email,
    ),
    index("prospecting_verifications_pending_idx")
      .on(table.workspaceId, table.campaignId, table.runId)
      .where(sql`${table.status} = 'pending'`),
    index("prospecting_verifications_workspace_run_idx").on(
      table.workspaceId,
      table.runId,
    ),
    check(
      "prospecting_verifications_source_check",
      sql`${table.source} in ('official_website', 'pattern', 'public', 'hunter', 'reacher')`,
    ),
    check(
      "prospecting_verifications_provider_check",
      sql`${table.provider} is null or ${table.provider} in ('no2bounce', 'reacher')`,
    ),
    check(
      "prospecting_verifications_pending_tracking_check",
      sql`${table.status} <> 'pending' or ${table.providerTrackingId} is not null`,
    ),
  ],
);
