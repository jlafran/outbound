import { desc, sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import type { Dossier } from "@/features/dossiers/dossier-schema";

import { campaignCompanies } from "./research";
import { workspaceMembers, workspaces } from "./workspaces";

export const dossiers = pgTable(
  "dossiers",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    campaignCompanyId: text("campaign_company_id").notNull(),
    meetingId: text("meeting_id"),
    version: integer("version").notNull(),
    previousVersionId: text("previous_version_id"),
    previousVersion: integer("previous_version"),
    executiveSummary: text("executive_summary").notNull(),
    companyOverview: text("company_overview").notNull(),
    businessModel: text("business_model").notNull(),
    contacts: jsonb("contacts").$type<Dossier["contacts"]>().notNull(),
    conversationSummary: text("conversation_summary").notNull(),
    confirmedNeeds: jsonb("confirmed_needs")
      .$type<Dossier["confirmedNeeds"]>()
      .notNull(),
    researchedFacts: jsonb("researched_facts")
      .$type<Dossier["researchedFacts"]>()
      .notNull(),
    hypotheses: jsonb("hypotheses")
      .$type<Dossier["hypotheses"]>()
      .notNull(),
    estimates: jsonb("estimates").$type<Dossier["estimates"]>().notNull(),
    competitors: jsonb("competitors")
      .$type<Dossier["competitors"]>()
      .notNull(),
    recommendations: jsonb("recommendations")
      .$type<Dossier["recommendations"]>()
      .notNull(),
    pendingQuestions: jsonb("pending_questions")
      .$type<Dossier["pendingQuestions"]>()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    createdBy: text("created_by").notNull(),
  },
  (table) => [
    foreignKey({
      name: "dossiers_workspace_campaign_company_fk",
      columns: [table.workspaceId, table.campaignCompanyId],
      foreignColumns: [
        campaignCompanies.workspaceId,
        campaignCompanies.id,
      ],
    }),
    foreignKey({
      name: "dossiers_workspace_creator_member_fk",
      columns: [table.workspaceId, table.createdBy],
      foreignColumns: [
        workspaceMembers.workspaceId,
        workspaceMembers.userId,
      ],
    }),
    foreignKey({
      name: "dossiers_version_chain_fk",
      columns: [
        table.workspaceId,
        table.campaignCompanyId,
        table.previousVersionId,
        table.previousVersion,
      ],
      foreignColumns: [
        table.workspaceId,
        table.campaignCompanyId,
        table.id,
        table.version,
      ],
    }),
    uniqueIndex("dossiers_workspace_id_unique").on(
      table.workspaceId,
      table.id,
    ),
    uniqueIndex("dossiers_workspace_company_version_unique").on(
      table.workspaceId,
      table.campaignCompanyId,
      table.version,
    ),
    uniqueIndex("dossiers_version_chain_target_unique").on(
      table.workspaceId,
      table.campaignCompanyId,
      table.id,
      table.version,
    ),
    index("dossiers_latest_idx").on(
      table.workspaceId,
      table.campaignCompanyId,
      desc(table.version),
      table.id,
    ),
    check(
      "dossiers_version_positive_check",
      sql`${table.version} > 0`,
    ),
    check(
      "dossiers_version_chain_check",
      sql`(${table.version} = 1 and ${table.previousVersionId} is null and ${table.previousVersion} is null) or (${table.version} > 1 and ${table.previousVersionId} is not null and ${table.previousVersion} is not null and ${table.previousVersion} = ${table.version} - 1)`,
    ),
    check(
      "dossiers_contacts_json_array_check",
      sql`jsonb_typeof(${table.contacts}) = 'array'`,
    ),
    check(
      "dossiers_confirmed_needs_json_array_check",
      sql`jsonb_typeof(${table.confirmedNeeds}) = 'array'`,
    ),
    check(
      "dossiers_researched_facts_json_array_check",
      sql`jsonb_typeof(${table.researchedFacts}) = 'array'`,
    ),
    check(
      "dossiers_hypotheses_json_array_check",
      sql`jsonb_typeof(${table.hypotheses}) = 'array'`,
    ),
    check(
      "dossiers_estimates_json_array_check",
      sql`jsonb_typeof(${table.estimates}) = 'array'`,
    ),
    check(
      "dossiers_competitors_json_array_check",
      sql`jsonb_typeof(${table.competitors}) = 'array'`,
    ),
    check(
      "dossiers_recommendations_json_array_check",
      sql`jsonb_typeof(${table.recommendations}) = 'array'`,
    ),
    check(
      "dossiers_pending_questions_json_array_check",
      sql`jsonb_typeof(${table.pendingQuestions}) = 'array'`,
    ),
  ],
);
