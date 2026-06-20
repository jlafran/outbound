import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import {
  campaignStateValues,
  paidDataModeValues,
} from "@/features/campaigns/campaign-schema";

import { offers } from "./offers";
import { workspaceMembers, workspaces } from "./workspaces";

export const campaignState = pgEnum(
  "campaign_state",
  campaignStateValues,
);
export const campaignPaidDataMode = pgEnum(
  "campaign_paid_data_mode",
  paidDataModeValues,
);

export const campaigns = pgTable(
  "campaigns",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    offerId: text("offer_id").notNull(),
    createdBy: text("created_by").notNull(),
    name: text("name").notNull(),
    targetDailyEmails: integer("target_daily_emails").notNull(),
    paidDataMode: campaignPaidDataMode("paid_data_mode").notNull(),
    state: campaignState("state").notNull(),
    nicheRecommendationIds: jsonb("niche_recommendation_ids")
      .$type<string[]>()
      .notNull()
      .default([]),
    approvedNicheIds: jsonb("approved_niche_ids")
      .$type<string[]>()
      .notNull()
      .default([]),
    version: integer("version").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    foreignKey({
      name: "campaigns_workspace_creator_member_fk",
      columns: [table.workspaceId, table.createdBy],
      foreignColumns: [
        workspaceMembers.workspaceId,
        workspaceMembers.userId,
      ],
    }),
    foreignKey({
      name: "campaigns_workspace_offer_fk",
      columns: [table.workspaceId, table.offerId],
      foreignColumns: [offers.workspaceId, offers.id],
    }),
    index("campaigns_workspace_created_at_id_idx").on(
      table.workspaceId,
      table.createdAt,
      table.id,
    ),
    check(
      "campaigns_target_daily_emails_check",
      sql`${table.targetDailyEmails} between 1 and 200`,
    ),
    check(
      "campaigns_niche_recommendation_ids_json_array_check",
      sql`jsonb_typeof(${table.nicheRecommendationIds}) = 'array'`,
    ),
    check(
      "campaigns_approved_niche_ids_json_array_check",
      sql`jsonb_typeof(${table.approvedNicheIds}) = 'array'`,
    ),
    check(
      "campaigns_version_positive_check",
      sql`${table.version} >= 1`,
    ),
  ],
);
