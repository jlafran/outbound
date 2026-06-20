import type { AuditAction } from "@/db/schema/audit";

export type { AuditAction } from "@/db/schema/audit";

export type AuditEventInput = {
  workspaceId: string;
  actorId: string;
  action: AuditAction;
  entityId: string;
  metadata: Record<string, unknown>;
};

export interface AuditRepository {
  append(input: AuditEventInput): Promise<void>;
  list(workspaceId: string): Promise<AuditEventInput[]>;
}

export function createMemoryAuditRepository(): AuditRepository {
  const events: AuditEventInput[] = [];

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
