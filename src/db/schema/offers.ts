import {
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { workspaceMembers, workspaces } from "./workspaces";

export const offerTicketBandValues = [
  "usd_5k_15k",
  "usd_15k_plus",
] as const;

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
    ),
  ],
);
