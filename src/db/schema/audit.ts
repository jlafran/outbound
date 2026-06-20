import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { users, workspaces } from "./workspaces";

export type AuditAction =
  | "offer.created"
  | "offer.normalized"
  | "campaign.created"
  | "niches.recommended"
  | "company.scored"
  | "dossier.updated"
  | "dossier.exported";

export const auditEvents = pgTable("audit_events", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id),
  actorId: text("actor_id")
    .notNull()
    .references(() => users.id),
  action: text("action").$type<AuditAction>().notNull(),
  entityId: text("entity_id").notNull(),
  metadata: jsonb("metadata")
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
