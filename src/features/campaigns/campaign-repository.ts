import { and, desc, eq } from "drizzle-orm";

import type { db as applicationDb } from "@/db/client";
import { campaigns } from "@/db/schema/campaigns";

import {
  CampaignError,
  campaignRecordSchema,
  type CampaignRecord,
} from "./campaign-schema";

export interface CampaignRepository {
  create(record: CampaignRecord): Promise<CampaignRecord>;
  list(workspaceId: string): Promise<CampaignRecord[]>;
  getById(
    workspaceId: string,
    id: string,
  ): Promise<CampaignRecord | null>;
  update(
    record: CampaignRecord,
    expectedVersion: number,
  ): Promise<CampaignRecord>;
}

export function createMemoryCampaignRepository(
  records: Map<string, CampaignRecord> = new Map(),
): CampaignRepository {
  return {
    async create(record) {
      const stored = structuredClone(campaignRecordSchema.parse(record));
      records.set(stored.id, stored);
      return structuredClone(stored);
    },
    async list(workspaceId) {
      return [...records.values()]
        .filter((record) => record.workspaceId === workspaceId)
        .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
        .map((record) => structuredClone(record));
    },
    async getById(workspaceId, id) {
      const record = records.get(id);

      if (!record || record.workspaceId !== workspaceId) {
        return null;
      }

      return structuredClone(record);
    },
    async update(record, expectedVersion) {
      const parsed = campaignRecordSchema.parse(record);
      const current = records.get(parsed.id);

      if (
        !current ||
        current.workspaceId !== parsed.workspaceId ||
        current.version !== expectedVersion ||
        parsed.version !== expectedVersion + 1
      ) {
        throw new CampaignError("STALE_CAMPAIGN_UPDATE");
      }

      const stored = structuredClone(parsed);
      records.set(parsed.id, stored);
      return structuredClone(stored);
    },
  };
}

export type CampaignDbExecutor = Pick<
  typeof applicationDb,
  "insert" | "select" | "update"
>;

export type CampaignIdentity = {
  workspaceId: string;
  id: string;
};

export type CampaignCasUpdate = CampaignIdentity & {
  expectedVersion: number;
  record: CampaignRecord;
};

export interface CampaignPersistenceExecutor {
  insert(record: CampaignRecord): Promise<unknown>;
  list?(workspaceId: string): Promise<unknown[]>;
  getByIdentity(identity: CampaignIdentity): Promise<unknown | null>;
  updateByIdentityAndVersion(
    input: CampaignCasUpdate,
  ): Promise<unknown | null>;
}

export function createDrizzleCampaignPersistenceExecutor(
  database: CampaignDbExecutor,
): CampaignPersistenceExecutor {
  return {
    async insert(record) {
      const [created] = await database
        .insert(campaigns)
        .values(record)
        .returning();

      return created;
    },
    async list(workspaceId) {
      return database
        .select()
        .from(campaigns)
        .where(eq(campaigns.workspaceId, workspaceId))
        .orderBy(desc(campaigns.createdAt));
    },
    async getByIdentity({ workspaceId, id }) {
      const [record] = await database
        .select()
        .from(campaigns)
        .where(
          and(
            eq(campaigns.workspaceId, workspaceId),
            eq(campaigns.id, id),
          ),
        )
        .limit(1);

      return record ?? null;
    },
    async updateByIdentityAndVersion({
      workspaceId,
      id,
      expectedVersion,
      record,
    }) {
      const [updated] = await database
        .update(campaigns)
        .set(record)
        .where(
          and(
            eq(campaigns.workspaceId, workspaceId),
            eq(campaigns.id, id),
            eq(campaigns.version, expectedVersion),
          ),
        )
        .returning();

      return updated ?? null;
    },
  };
}

export function createDrizzleCampaignRepository(
  executor: CampaignPersistenceExecutor,
): CampaignRepository {
  return {
    async create(record) {
      const parsed = campaignRecordSchema.parse(record);
      return campaignRecordSchema.parse(await executor.insert(parsed));
    },
    async list(workspaceId) {
      if (!executor.list) {
        return [];
      }
      return (await executor.list(workspaceId)).map((record) =>
        campaignRecordSchema.parse(record),
      );
    },
    async getById(workspaceId, id) {
      const record = await executor.getByIdentity({ workspaceId, id });
      return record === null ? null : campaignRecordSchema.parse(record);
    },
    async update(record, expectedVersion) {
      const parsed = campaignRecordSchema.parse(record);

      if (parsed.version !== expectedVersion + 1) {
        throw new CampaignError("STALE_CAMPAIGN_UPDATE");
      }

      const updated = await executor.updateByIdentityAndVersion({
        workspaceId: parsed.workspaceId,
        id: parsed.id,
        expectedVersion,
        record: parsed,
      });

      if (updated === null) {
        throw new CampaignError("STALE_CAMPAIGN_UPDATE");
      }

      return campaignRecordSchema.parse(updated);
    },
  };
}
