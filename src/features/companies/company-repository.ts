import { and, count, eq, sql } from "drizzle-orm";

import type { db as applicationDb } from "@/db/client";
import { companies } from "@/db/schema/companies";

import {
  companyInputSchema,
  companyRecordSchema,
  type CompanyInput,
  type CompanyRecord,
  normalizeCompanyDomain,
  selectCanonicalCompanyName,
} from "./company-schema";

export interface CompanyRepository {
  upsertByDomain(input: CompanyInput): Promise<CompanyRecord>;
  getById(workspaceId: string, id: string): Promise<CompanyRecord | null>;
  getByDomain(
    workspaceId: string,
    domain: string,
  ): Promise<CompanyRecord | null>;
  count(workspaceId?: string): Promise<number>;
}

export type CompanyDbExecutor = Pick<
  typeof applicationDb,
  "insert" | "select"
>;

export type CompanyIdentity = {
  workspaceId: string;
  id: string;
};

export type CompanyDomainIdentity = {
  workspaceId: string;
  normalizedDomain: string;
};

export interface CompanyPersistenceExecutor {
  upsert(record: CompanyRecord): Promise<unknown>;
  getById(identity: CompanyIdentity): Promise<unknown | null>;
  getByDomain(identity: CompanyDomainIdentity): Promise<unknown | null>;
  count(workspaceId?: string): Promise<number>;
}

export function createDrizzleCompanyPersistenceExecutor(
  database: CompanyDbExecutor,
): CompanyPersistenceExecutor {
  return {
    async upsert(record) {
      const normalizedCurrentName = sql`normalize(btrim(${companies.name}), NFC)`;
      const betterName = sql`(
        char_length(excluded.name) > char_length(${normalizedCurrentName})
        or (
          char_length(excluded.name) = char_length(${normalizedCurrentName})
          and excluded.name collate "C" > ${normalizedCurrentName} collate "C"
        )
      )`;
      const selectedName = sql`case when ${betterName} then excluded.name else ${normalizedCurrentName} end`;
      const betterDisplayDomain = sql`length(excluded.display_domain) > length(${companies.displayDomain})`;
      const hasMeaningfulUpdate = sql`(${selectedName} <> ${companies.name} or ${betterDisplayDomain})`;
      const [upserted] = await database
        .insert(companies)
        .values(record)
        .onConflictDoUpdate({
          target: [companies.workspaceId, companies.normalizedDomain],
          set: {
            displayDomain: sql`case when ${betterDisplayDomain} then excluded.display_domain else ${companies.displayDomain} end`,
            name: selectedName,
            updatedAt: sql`case when ${hasMeaningfulUpdate} then excluded.updated_at else ${companies.updatedAt} end`,
            version: sql`case when ${hasMeaningfulUpdate} then ${companies.version} + 1 else ${companies.version} end`,
          },
        })
        .returning();

      return upserted;
    },
    async getById({ workspaceId, id }) {
      const [record] = await database
        .select()
        .from(companies)
        .where(
          and(
            eq(companies.workspaceId, workspaceId),
            eq(companies.id, id),
          ),
        )
        .limit(1);

      return record ?? null;
    },
    async getByDomain({ workspaceId, normalizedDomain }) {
      const [record] = await database
        .select()
        .from(companies)
        .where(
          and(
            eq(companies.workspaceId, workspaceId),
            eq(companies.normalizedDomain, normalizedDomain),
          ),
        )
        .limit(1);

      return record ?? null;
    },
    async count(workspaceId) {
      const query = database
        .select({ value: count() })
        .from(companies);
      const rows =
        workspaceId === undefined
          ? await query
          : await query.where(eq(companies.workspaceId, workspaceId));

      return rows[0]?.value ?? 0;
    },
  };
}

export type CompanyRepositoryDependencies = {
  createId: () => string;
  now: () => Date;
};

export function createDrizzleCompanyRepository(
  executor: CompanyPersistenceExecutor,
  dependencies: CompanyRepositoryDependencies = {
    createId: () => crypto.randomUUID(),
    now: () => new Date(),
  },
): CompanyRepository {
  return {
    async upsertByDomain(input) {
      const parsed = companyInputSchema.parse(input);
      const normalizedDomain = normalizeCompanyDomain(parsed.domain);
      const now = dependencies.now();
      const row = await executor.upsert({
        id: dependencies.createId(),
        workspaceId: parsed.workspaceId,
        normalizedDomain,
        displayDomain: normalizedDomain,
        name: parsed.name,
        createdAt: now,
        updatedAt: now,
        version: 1,
      });

      return companyRecordSchema.parse(row);
    },
    async getById(workspaceId, id) {
      const row = await executor.getById({ workspaceId, id });
      return row === null ? null : companyRecordSchema.parse(row);
    },
    async getByDomain(workspaceId, domain) {
      const row = await executor.getByDomain({
        workspaceId,
        normalizedDomain: normalizeCompanyDomain(domain),
      });
      return row === null ? null : companyRecordSchema.parse(row);
    },
    async count(workspaceId) {
      return executor.count(workspaceId);
    },
  };
}

export function createMemoryCompanyRepository(): CompanyRepository {
  const records = new Map<string, CompanyRecord>();
  let pendingUpsert: Promise<void> = Promise.resolve();

  function serializeUpsert<T>(operation: () => T | Promise<T>): Promise<T> {
    const result = pendingUpsert.then(operation, operation);
    pendingUpsert = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  return {
    async upsertByDomain(input) {
      return serializeUpsert(() => {
        const parsed = companyInputSchema.parse(input);
        const normalizedDomain = normalizeCompanyDomain(parsed.domain);
        const key = `${parsed.workspaceId}:${normalizedDomain}`;
        const existing = records.get(key);

        if (existing) {
          const canonicalName = selectCanonicalCompanyName(
            existing.name,
            parsed.name,
          );

          if (canonicalName !== existing.name) {
            const updated: CompanyRecord = {
              ...existing,
              name: canonicalName,
              updatedAt: new Date(),
              version: existing.version + 1,
            };
            records.set(key, updated);
            return structuredClone(updated);
          }

          return structuredClone(existing);
        }

        const now = new Date();
        const record: CompanyRecord = {
          id: crypto.randomUUID(),
          workspaceId: parsed.workspaceId,
          normalizedDomain,
          displayDomain: normalizedDomain,
          name: parsed.name,
          createdAt: now,
          updatedAt: now,
          version: 1,
        };
        records.set(key, record);
        return structuredClone(record);
      });
    },
    async getById(workspaceId, id) {
      const record = [...records.values()].find(
        (candidate) =>
          candidate.workspaceId === workspaceId && candidate.id === id,
      );
      return record ? structuredClone(record) : null;
    },
    async getByDomain(workspaceId, domain) {
      const record = records.get(
        `${workspaceId}:${normalizeCompanyDomain(domain)}`,
      );
      return record ? structuredClone(record) : null;
    },
    async count(workspaceId) {
      return [...records.values()].filter(
        (record) =>
          workspaceId === undefined || record.workspaceId === workspaceId,
      ).length;
    },
  };
}
