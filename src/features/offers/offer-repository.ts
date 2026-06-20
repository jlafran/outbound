import { and, eq } from "drizzle-orm";

import type { db as applicationDb } from "@/db/client";
import { offers } from "@/db/schema/offers";

import {
  normalizedOfferSchema,
  type NormalizedOffer,
} from "./offer-schema";

export type OfferRecord = NormalizedOffer & {
  id: string;
  workspaceId: string;
  createdBy: string;
  createdAt: Date;
};

export interface OfferRepository {
  create(record: OfferRecord): Promise<OfferRecord>;
  getById(workspaceId: string, id: string): Promise<OfferRecord | null>;
}

export function createMemoryOfferRepository(): OfferRepository {
  const records = new Map<string, OfferRecord>();

  return {
    async create(record) {
      const storedRecord = structuredClone(record);
      records.set(record.id, storedRecord);
      return structuredClone(storedRecord);
    },
    async getById(workspaceId, id) {
      const record = records.get(id);

      if (!record || record.workspaceId !== workspaceId) {
        return null;
      }

      return structuredClone(record);
    },
  };
}

type ApplicationDb = typeof applicationDb;
type OfferRow = typeof offers.$inferSelect;

function toOfferRecord(row: OfferRow): OfferRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    createdBy: row.createdBy,
    ...normalizedOfferSchema.parse(row),
    createdAt: row.createdAt,
  };
}

export function createDrizzleOfferRepository(
  database: ApplicationDb,
): OfferRepository {
  return {
    async create(record) {
      const [created] = await database
        .insert(offers)
        .values(record)
        .returning();

      return toOfferRecord(created);
    },
    async getById(workspaceId, id) {
      const [record] = await database
        .select()
        .from(offers)
        .where(and(eq(offers.workspaceId, workspaceId), eq(offers.id, id)))
        .limit(1);

      return record ? toOfferRecord(record) : null;
    },
  };
}
