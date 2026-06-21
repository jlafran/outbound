import { and, asc, desc, eq } from "drizzle-orm";

import type { db as applicationDb } from "@/db/client";
import { dossiers } from "@/db/schema/dossiers";

import { dossierSchema, type Dossier } from "./dossier-schema";

export type DossierErrorCode =
  | "DOSSIER_ALREADY_EXISTS"
  | "DOSSIER_NOT_FOUND"
  | "DOSSIER_ITEM_NOT_FOUND"
  | "INVALID_DOSSIER_REFERENCE"
  | "STALE_DOSSIER_VERSION";

export class DossierError extends Error {
  constructor(
    readonly code: DossierErrorCode,
    options?: ErrorOptions,
  ) {
    super(code, options);
    this.name = "DossierError";
  }
}

export interface DossierRepository {
  createInitial(dossier: Dossier): Promise<Dossier>;
  appendVersion(
    dossier: Dossier,
    expectedLatestVersion: number,
  ): Promise<Dossier>;
  getLatest(
    workspaceId: string,
    campaignCompanyId: string,
  ): Promise<Dossier | null>;
  getById(workspaceId: string, id: string): Promise<Dossier | null>;
  listVersions(
    workspaceId: string,
    campaignCompanyId: string,
  ): Promise<Dossier[]>;
}

function cloneRecords(
  records: Map<string, Dossier>,
): Map<string, Dossier> {
  return new Map(
    Array.from(records, ([id, record]) => [id, structuredClone(record)]),
  );
}

export { cloneRecords as cloneDossierRecords };

export function createMemoryDossierRepository(
  records: Map<string, Dossier> = new Map(),
): DossierRepository {
  let queue = Promise.resolve();

  function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = queue.then(operation);
    queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  function series(workspaceId: string, campaignCompanyId: string) {
    return Array.from(records.values())
      .filter(
        (record) =>
          record.workspaceId === workspaceId &&
          record.campaignCompanyId === campaignCompanyId,
      )
      .sort((left, right) => left.version - right.version);
  }

  return {
    createInitial(dossier) {
      return enqueue(async () => {
        const parsed = dossierSchema.parse(dossier);
        if (
          parsed.version !== 1 ||
          parsed.previousVersionId !== null ||
          records.has(parsed.id) ||
          series(parsed.workspaceId, parsed.campaignCompanyId).length > 0
        ) {
          throw new DossierError("DOSSIER_ALREADY_EXISTS");
        }
        const stored = structuredClone(parsed);
        records.set(stored.id, stored);
        return structuredClone(stored);
      });
    },
    appendVersion(dossier, expectedLatestVersion) {
      return enqueue(async () => {
        const parsed = dossierSchema.parse(dossier);
        const versions = series(
          parsed.workspaceId,
          parsed.campaignCompanyId,
        );
        const latest = versions.at(-1);

        if (
          !latest ||
          latest.version !== expectedLatestVersion ||
          parsed.version !== expectedLatestVersion + 1 ||
          parsed.previousVersionId !== latest.id ||
          records.has(parsed.id)
        ) {
          throw new DossierError("STALE_DOSSIER_VERSION");
        }

        const stored = structuredClone(parsed);
        records.set(stored.id, stored);
        return structuredClone(stored);
      });
    },
    async getLatest(workspaceId, campaignCompanyId) {
      await queue;
      const latest = series(workspaceId, campaignCompanyId).at(-1);
      return latest ? structuredClone(latest) : null;
    },
    async getById(workspaceId, id) {
      await queue;
      const record = records.get(id);
      return record?.workspaceId === workspaceId
        ? structuredClone(record)
        : null;
    },
    async listVersions(workspaceId, campaignCompanyId) {
      await queue;
      return series(workspaceId, campaignCompanyId).map((record) =>
        structuredClone(record),
      );
    },
  };
}

export type DossierSeriesIdentity = {
  workspaceId: string;
  campaignCompanyId: string;
};
export type DossierIdentity = {
  workspaceId: string;
  id: string;
};

export interface DossierPersistenceExecutor {
  insertInitial(record: Dossier): Promise<unknown | null>;
  insertVersionIfLatest(
    record: Dossier,
    expectedLatestVersion: number,
  ): Promise<unknown | null>;
  getLatest(identity: DossierSeriesIdentity): Promise<unknown | null>;
  getById(identity: DossierIdentity): Promise<unknown | null>;
  listVersions(identity: DossierSeriesIdentity): Promise<unknown[]>;
}

export type DossierDbExecutor = Pick<
  typeof applicationDb,
  "insert" | "select"
>;

function dossierPersistenceValues(record: Dossier) {
  return {
    ...record,
    previousVersion: record.version === 1 ? null : record.version - 1,
  };
}

function parsePersistedDossier(record: unknown): Dossier {
  if (
    typeof record === "object" &&
    record !== null &&
    "previousVersion" in record
  ) {
    const dossier = { ...record };
    delete dossier.previousVersion;
    return dossierSchema.parse(dossier);
  }
  return dossierSchema.parse(record);
}

function getDatabaseErrorCode(error: unknown): string | undefined {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
    ? error.code
    : undefined;
}

export function createDrizzleDossierPersistenceExecutor(
  database: DossierDbExecutor,
): DossierPersistenceExecutor {
  const getLatest = async ({
    workspaceId,
    campaignCompanyId,
  }: DossierSeriesIdentity) => {
    const [record] = await database
      .select()
      .from(dossiers)
      .where(
        and(
          eq(dossiers.workspaceId, workspaceId),
          eq(dossiers.campaignCompanyId, campaignCompanyId),
        ),
      )
      .orderBy(desc(dossiers.version), asc(dossiers.id))
      .limit(1);
    return record ?? null;
  };

  return {
    async insertInitial(record) {
      const [created] = await database
        .insert(dossiers)
        .values(dossierPersistenceValues(record))
        .onConflictDoNothing({
          target: [
            dossiers.workspaceId,
            dossiers.campaignCompanyId,
            dossiers.version,
          ],
        })
        .returning();
      return created ?? null;
    },
    async insertVersionIfLatest(record, expectedLatestVersion) {
      const latest = await getLatest(record);
      if (
        !latest ||
        latest.version !== expectedLatestVersion ||
        latest.id !== record.previousVersionId
      ) {
        return null;
      }
      const [created] = await database
        .insert(dossiers)
        .values(dossierPersistenceValues(record))
        .onConflictDoNothing({
          target: [
            dossiers.workspaceId,
            dossiers.campaignCompanyId,
            dossiers.version,
          ],
        })
        .returning();
      return created ?? null;
    },
    getLatest,
    async getById({ workspaceId, id }) {
      const [record] = await database
        .select()
        .from(dossiers)
        .where(
          and(
            eq(dossiers.workspaceId, workspaceId),
            eq(dossiers.id, id),
          ),
        )
        .limit(1);
      return record ?? null;
    },
    async listVersions({ workspaceId, campaignCompanyId }) {
      return database
        .select()
        .from(dossiers)
        .where(
          and(
            eq(dossiers.workspaceId, workspaceId),
            eq(dossiers.campaignCompanyId, campaignCompanyId),
          ),
        )
        .orderBy(asc(dossiers.version), asc(dossiers.id));
    },
  };
}

export function createDrizzleDossierRepository(
  executor: DossierPersistenceExecutor,
): DossierRepository {
  return {
    async createInitial(dossier) {
      const parsed = dossierSchema.parse(dossier);
      if (parsed.version !== 1 || parsed.previousVersionId !== null) {
        throw new DossierError("DOSSIER_ALREADY_EXISTS");
      }
      let created: unknown | null;
      try {
        created = await executor.insertInitial(parsed);
      } catch (error) {
        const databaseCode = getDatabaseErrorCode(error);
        if (databaseCode === "23505") {
          throw new DossierError("DOSSIER_ALREADY_EXISTS", {
            cause: error,
          });
        }
        if (databaseCode === "23503") {
          throw new DossierError("INVALID_DOSSIER_REFERENCE", {
            cause: error,
          });
        }
        throw error;
      }
      if (created === null) {
        throw new DossierError("DOSSIER_ALREADY_EXISTS");
      }
      return parsePersistedDossier(created);
    },
    async appendVersion(dossier, expectedLatestVersion) {
      const parsed = dossierSchema.parse(dossier);
      if (parsed.version !== expectedLatestVersion + 1) {
        throw new DossierError("STALE_DOSSIER_VERSION");
      }
      const created = await executor.insertVersionIfLatest(
        parsed,
        expectedLatestVersion,
      );
      if (created === null) {
        throw new DossierError("STALE_DOSSIER_VERSION");
      }
      return parsePersistedDossier(created);
    },
    async getLatest(workspaceId, campaignCompanyId) {
      const record = await executor.getLatest({
        workspaceId,
        campaignCompanyId,
      });
      return record === null ? null : parsePersistedDossier(record);
    },
    async getById(workspaceId, id) {
      const record = await executor.getById({ workspaceId, id });
      return record === null ? null : parsePersistedDossier(record);
    },
    async listVersions(workspaceId, campaignCompanyId) {
      return (
        await executor.listVersions({ workspaceId, campaignCompanyId })
      ).map((record) => parsePersistedDossier(record));
    },
  };
}
