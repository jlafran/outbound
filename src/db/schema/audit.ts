import {
  foreignKey,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { workspaceMembers, workspaces } from "./workspaces";

export const auditActionValues = [
  "offer.created",
  "offer.normalized",
  "campaign.created",
  "niches.recommended",
  "company.scored",
  "dossier.updated",
  "dossier.exported",
] as const;

export type AuditAction = (typeof auditActionValues)[number];

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

export const auditAction = pgEnum("audit_action", auditActionValues);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    actorId: text("actor_id").notNull(),
    action: auditAction("action").notNull(),
    entityId: text("entity_id").notNull(),
    metadata: jsonb("metadata").$type<JsonValue>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "audit_events_workspace_actor_member_fk",
      columns: [table.workspaceId, table.actorId],
      foreignColumns: [
        workspaceMembers.workspaceId,
        workspaceMembers.userId,
      ],
    }),
    index("audit_events_workspace_listing_idx").on(
      table.workspaceId,
      table.createdAt,
      table.id,
    ),
  ],
);
