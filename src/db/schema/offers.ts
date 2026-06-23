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
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { workspaceMembers, workspaces } from "./workspaces";
import { offerTicketBandValues } from "@/features/offers/offer-schema";

export const offerTicketBand = pgEnum(
  "offer_ticket_band",
  offerTicketBandValues,
);

export const offers = pgTable(
  "offers",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    name: text("name").notNull(),
    rawText: text("raw_text").notNull(),
    problems: jsonb("problems").$type<string[]>().notNull(),
    expectedResults: jsonb("expected_results").$type<string[]>().notNull(),
    ticketBand: offerTicketBand("ticket_band").notNull(),
    allowedPilot: text("allowed_pilot").notNull(),
    prohibitedClaims: jsonb("prohibited_claims")
      .$type<string[]>()
      .notNull()
      .default([]),
    version: integer("version").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    createdBy: text("created_by").notNull(),
  },
  (table) => [
    foreignKey({
      name: "offers_workspace_creator_member_fk",
      columns: [table.workspaceId, table.createdBy],
      foreignColumns: [
        workspaceMembers.workspaceId,
        workspaceMembers.userId,
      ],
    }),
    index("offers_workspace_created_at_idx").on(
      table.workspaceId,
      table.createdAt,
      table.id,
    ),
    uniqueIndex("offers_workspace_id_id_unique").on(
      table.workspaceId,
      table.id,
    ),
    check("offers_version_1_check", sql`${table.version} = 1`),
    check(
      "offers_problems_json_array_check",
      sql`jsonb_typeof(${table.problems}) = 'array'`,
    ),
    check(
      "offers_expected_results_json_array_check",
      sql`jsonb_typeof(${table.expectedResults}) = 'array'`,
    ),
    check(
      "offers_prohibited_claims_json_array_check",
      sql`jsonb_typeof(${table.prohibitedClaims}) = 'array'`,
    ),
  ],
);
