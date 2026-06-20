import { asc, eq } from "drizzle-orm";

import type { db as applicationDb } from "@/db/client";
import type { AuditAction, JsonValue } from "@/db/schema/audit";
import { auditEvents } from "@/db/schema/audit";

export type {
  AuditAction,
  JsonPrimitive,
  JsonValue,
} from "@/db/schema/audit";

export type AuditEventInput = {
  workspaceId: string;
  actorId: string;
  action: AuditAction;
  entityId: string;
  metadata: JsonValue;
};

export interface AuditRepository {
  append(input: AuditEventInput): Promise<void>;
  list(workspaceId: string): Promise<AuditEventInput[]>;
}

export function createMemoryAuditRepository(
  events: AuditEventInput[] = [],
): AuditRepository {
  return {
    async append(input) {
      events.push(structuredClone(input));
    },
    async list(workspaceId) {
      return events
        .filter((event) => event.workspaceId === workspaceId)
        .map((event) => structuredClone(event));
    },
  };
}

export type AuditDbExecutor = Pick<
  typeof applicationDb,
  "insert" | "select"
>;

export function createDrizzleAuditRepository(
  database: AuditDbExecutor,
): AuditRepository {
  return {
    async append(input) {
      await database.insert(auditEvents).values({
        id: crypto.randomUUID(),
        ...input,
      });
    },
    async list(workspaceId) {
      return database
        .select({
          workspaceId: auditEvents.workspaceId,
          actorId: auditEvents.actorId,
          action: auditEvents.action,
          entityId: auditEvents.entityId,
          metadata: auditEvents.metadata,
        })
        .from(auditEvents)
        .where(eq(auditEvents.workspaceId, workspaceId))
        .orderBy(
          asc(auditEvents.workspaceId),
          asc(auditEvents.sequence),
        );
    },
  };
}
