import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import {
  confidenceValues,
  evidenceKindValues,
} from "@/features/research/research-schema";

import { campaigns } from "./campaigns";
import { companies } from "./companies";
import { offers } from "./offers";
import { workspaces } from "./workspaces";

export const campaignCompanyStatusValues = [
  "discovered",
  "researched",
  "qualified",
  "discarded",
] as const;
export const opportunityStatusValues = [
  "candidate",
  "fit",
  "not_fit",
] as const;

export const campaignCompanyStatus = pgEnum(
  "campaign_company_status",
  campaignCompanyStatusValues,
);
export const evidenceKind = pgEnum("evidence_kind", evidenceKindValues);
export const evidenceConfidence = pgEnum(
  "evidence_confidence",
  confidenceValues,
);
export const opportunityStatus = pgEnum(
  "opportunity_status",
  opportunityStatusValues,
);

export const campaignCompanies = pgTable(
  "campaign_companies",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    campaignId: text("campaign_id").notNull(),
    companyId: text("company_id").notNull(),
    status: campaignCompanyStatus("status").notNull(),
    fitReason: text("fit_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    foreignKey({
      name: "campaign_companies_workspace_campaign_fk",
      columns: [table.workspaceId, table.campaignId],
      foreignColumns: [campaigns.workspaceId, campaigns.id],
    }),
    foreignKey({
      name: "campaign_companies_workspace_company_fk",
      columns: [table.workspaceId, table.companyId],
      foreignColumns: [companies.workspaceId, companies.id],
    }),
    uniqueIndex("campaign_companies_campaign_company_unique").on(
      table.campaignId,
      table.companyId,
    ),
    uniqueIndex("campaign_companies_workspace_id_unique").on(
      table.workspaceId,
      table.id,
    ),
  ],
);

export const sources = pgTable(
  "sources",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    companyId: text("company_id").notNull(),
    url: text("url").notNull(),
    sourceType: text("source_type").notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    foreignKey({
      name: "sources_workspace_company_fk",
      columns: [table.workspaceId, table.companyId],
      foreignColumns: [companies.workspaceId, companies.id],
    }),
    uniqueIndex("sources_company_url_unique").on(
      table.companyId,
      table.url,
    ),
    uniqueIndex("sources_workspace_id_unique").on(
      table.workspaceId,
      table.id,
    ),
  ],
);

export const evidence = pgTable(
  "evidence",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    companyId: text("company_id").notNull(),
    campaignCompanyId: text("campaign_company_id"),
    sourceId: text("source_id"),
    kind: evidenceKind("kind").notNull(),
    confidence: evidenceConfidence("confidence").notNull(),
    statement: text("statement").notNull(),
    assumptions: jsonb("assumptions").$type<string[]>().notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    foreignKey({
      name: "evidence_workspace_company_fk",
      columns: [table.workspaceId, table.companyId],
      foreignColumns: [companies.workspaceId, companies.id],
    }),
    foreignKey({
      name: "evidence_workspace_campaign_company_fk",
      columns: [table.workspaceId, table.campaignCompanyId],
      foreignColumns: [
        campaignCompanies.workspaceId,
        campaignCompanies.id,
      ],
    }),
    foreignKey({
      name: "evidence_workspace_source_fk",
      columns: [table.workspaceId, table.sourceId],
      foreignColumns: [sources.workspaceId, sources.id],
    }),
    check(
      "evidence_assumptions_json_array_check",
      sql`jsonb_typeof(${table.assumptions}) = 'array'`,
    ),
    check(
      "evidence_researched_fact_source_check",
      sql`${table.kind} <> 'researched_fact' or ${table.sourceId} is not null`,
    ),
    check(
      "evidence_inferred_assumptions_check",
      sql`case when ${table.kind} in ('hypothesis', 'estimate') then case when jsonb_typeof(${table.assumptions}) = 'array' then jsonb_array_length(${table.assumptions}) > 0 else false end else true end`,
    ),
  ],
);

export const offerOpportunities = pgTable(
  "offer_opportunities",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    companyId: text("company_id").notNull(),
    offerId: text("offer_id").notNull(),
    campaignCompanyId: text("campaign_company_id"),
    status: opportunityStatus("status").notNull(),
    problem: text("problem").notNull(),
    rationale: text("rationale").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    foreignKey({
      name: "offer_opportunities_workspace_company_fk",
      columns: [table.workspaceId, table.companyId],
      foreignColumns: [companies.workspaceId, companies.id],
    }),
    foreignKey({
      name: "offer_opportunities_workspace_offer_fk",
      columns: [table.workspaceId, table.offerId],
      foreignColumns: [offers.workspaceId, offers.id],
    }),
    foreignKey({
      name: "offer_opportunities_workspace_campaign_company_fk",
      columns: [table.workspaceId, table.campaignCompanyId],
      foreignColumns: [
        campaignCompanies.workspaceId,
        campaignCompanies.id,
      ],
    }),
    uniqueIndex("offer_opportunities_company_offer_unique").on(
      table.companyId,
      table.offerId,
    ),
  ],
);
