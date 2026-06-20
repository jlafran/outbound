import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { workspaces } from "./workspaces";

export const companies = pgTable(
  "companies",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    normalizedDomain: text("normalized_domain").notNull(),
    displayDomain: text("display_domain").notNull(),
    name: text("name").notNull(),
    version: integer("version").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("companies_workspace_domain_unique").on(
      table.workspaceId,
      table.normalizedDomain,
    ),
    uniqueIndex("companies_workspace_id_unique").on(
      table.workspaceId,
      table.id,
    ),
    index("companies_workspace_created_at_id_idx").on(
      table.workspaceId,
      table.createdAt,
      table.id,
    ),
    check(
      "companies_version_positive_check",
      sql`${table.version} >= 1`,
    ),
  ],
);
