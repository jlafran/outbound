import { and, eq } from "drizzle-orm";

import type { db as applicationDb } from "@/db/client";
import { campaigns } from "@/db/schema/campaigns";

import {
  CampaignError,
  campaignRecordSchema,
  type CampaignRecord,
} from "./campaign-schema";

export interface CampaignRepository {
  create(record: CampaignRecord): Promise<CampaignRecord>;
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
      records.set(record.id, stored);
      return structuredClone(stored);
    },
    async getById(workspaceId, id) {
      const record = records.get(id);

      if (!record || record.workspaceId !== workspaceId) {
        return null;
      }

      return structuredClone(record);
    },
    async update(record, expectedVersion) {
      const current = records.get(record.id);

      if (
        !current ||
        current.workspaceId !== record.workspaceId ||
        current.version !== expectedVersion ||
        record.version !== expectedVersion + 1
      ) {
        throw new CampaignError("STALE_CAMPAIGN_UPDATE");
      }

      const stored = structuredClone(campaignRecordSchema.parse(record));
      records.set(record.id, stored);
      return structuredClone(stored);
    },
  };
}

export type CampaignDbExecutor = Pick<
  typeof applicationDb,
  "insert" | "select" | "update"
>;
type CampaignRow = typeof campaigns.$inferSelect;

function toCampaignRecord(row: CampaignRow): CampaignRecord {
  return campaignRecordSchema.parse({
    id: row.id,
    workspaceId: row.workspaceId,
    offerId: row.offerId,
    createdBy: row.createdBy,
    name: row.name,
    targetDailyEmails: row.targetDailyEmails,
    paidDataMode: row.paidDataMode,
    state: row.state,
    nicheRecommendationIds: row.nicheRecommendationIds,
    approvedNicheIds: row.approvedNicheIds,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export function createDrizzleCampaignRepository(
  database: CampaignDbExecutor,
): CampaignRepository {
  return {
    async create(record) {
      const parsed = campaignRecordSchema.parse(record);
      const [created] = await database
        .insert(campaigns)
        .values(parsed)
        .returning();

      return toCampaignRecord(created);
    },
    async getById(workspaceId, id) {
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

      return record ? toCampaignRecord(record) : null;
    },
    async update(record, expectedVersion) {
      const parsed = campaignRecordSchema.parse(record);

      if (parsed.version !== expectedVersion + 1) {
        throw new CampaignError("STALE_CAMPAIGN_UPDATE");
      }

      const [updated] = await database
        .update(campaigns)
        .set(parsed)
        .where(
          and(
            eq(campaigns.workspaceId, parsed.workspaceId),
            eq(campaigns.id, parsed.id),
            eq(campaigns.version, expectedVersion),
          ),
        )
        .returning();

      if (!updated) {
        throw new CampaignError("STALE_CAMPAIGN_UPDATE");
      }

      return toCampaignRecord(updated);
    },
  };
}
