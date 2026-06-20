import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  createDrizzleCompanyPersistenceExecutor,
  createDrizzleCompanyRepository,
  createMemoryCompanyRepository,
  type CompanyDbExecutor,
  type CompanyPersistenceExecutor,
} from "@/features/companies/company-repository";
import { normalizeCompanyDomain } from "@/features/companies/company-schema";
import {
  campaignCompanies,
  companies,
  evidence,
  offerOpportunities,
  sources,
} from "@/db/schema";
import {
  confidenceValues,
  evidenceKindValues,
  evidenceSchema,
} from "@/features/research/research-schema";

describe("createMemoryCompanyRepository", () => {
  it("reuses the existing company id for the same workspace and domain", async () => {
    const repository = createMemoryCompanyRepository();

    const first = await repository.upsertByDomain({
      workspaceId: "workspace-1",
      domain: "https://www.Acme.com/about",
      name: "Acme",
    });
    const reused = await repository.upsertByDomain({
      workspaceId: "workspace-1",
      domain: "acme.com",
      name: "Acme",
    });

    expect(reused.id).toBe(first.id);
    expect(await repository.count()).toBe(1);
  });

  it("does not replace a canonical name with a casing-only variant", async () => {
    const repository = createMemoryCompanyRepository();
    const first = await repository.upsertByDomain({
      workspaceId: "workspace-1",
      domain: "acme.com",
      name: "Acme",
    });

    const reused = await repository.upsertByDomain({
      workspaceId: "workspace-1",
      domain: "ACME.COM",
      name: "ACME",
    });

    expect(reused).toMatchObject({
      id: first.id,
      name: "Acme",
      version: 1,
      updatedAt: first.updatedAt,
    });
  });

  it("uses a more descriptive incoming name for an existing company", async () => {
    const repository = createMemoryCompanyRepository();
    const first = await repository.upsertByDomain({
      workspaceId: "workspace-1",
      domain: "acme.com",
      name: "Acme",
    });

    const updated = await repository.upsertByDomain({
      workspaceId: "workspace-1",
      domain: "acme.com",
      name: "Acme Corporation",
    });

    expect(updated).toMatchObject({
      id: first.id,
      name: "Acme Corporation",
      version: 2,
    });
    expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(
      first.updatedAt.getTime(),
    );
  });

  it("isolates the same normalized domain by workspace", async () => {
    const repository = createMemoryCompanyRepository();

    const first = await repository.upsertByDomain({
      workspaceId: "workspace-1",
      domain: "acme.com",
      name: "Acme",
    });
    const second = await repository.upsertByDomain({
      workspaceId: "workspace-2",
      domain: "https://www.acme.com",
      name: "Acme",
    });

    expect(second.id).not.toBe(first.id);
    expect(await repository.getById("workspace-2", first.id)).toBeNull();
    expect(await repository.count()).toBe(2);
    expect(await repository.count("workspace-1")).toBe(1);
    expect(await repository.count("workspace-2")).toBe(1);
  });

  it("keeps stored records isolated from returned mutations", async () => {
    const repository = createMemoryCompanyRepository();
    const created = await repository.upsertByDomain({
      workspaceId: "workspace-1",
      domain: "acme.com",
      name: "Acme",
    });

    created.name = "Mutated";
    created.updatedAt.setUTCFullYear(2000);

    expect(
      await repository.getByDomain("workspace-1", "acme.com"),
    ).toMatchObject({
      name: "Acme",
      version: 1,
    });
  });

  it("serializes concurrent upserts for one normalized domain", async () => {
    const repository = createMemoryCompanyRepository();

    const records = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        repository.upsertByDomain({
          workspaceId: "workspace-1",
          domain:
            index % 2 === 0
              ? "https://www.acme.com/path"
              : "ACME.COM.",
          name: "Acme",
        }),
      ),
    );

    expect(new Set(records.map((record) => record.id))).toHaveLength(1);
    expect(await repository.count("workspace-1")).toBe(1);
  });
});

describe("normalizeCompanyDomain", () => {
  it.each([
    "example.com",
    "EXAMPLE.COM.",
    "www.example.com",
    "https://www.Example.com:443/path?query=yes#hash",
    "http://user:password@example.com:8080/path",
  ])("collapses %s to a canonical hostname", (input) => {
    expect(normalizeCompanyDomain(input)).toBe("example.com");
  });

  it("normalizes international domains through URL hostname parsing", () => {
    expect(normalizeCompanyDomain("https://www.münich.example/path")).toBe(
      "xn--mnich-kva.example",
    );
    expect(normalizeCompanyDomain("xn--mnich-kva.example")).toBe(
      "xn--mnich-kva.example",
    );
  });

  it.each([
    "localhost",
    "http://localhost:3000",
    "127.0.0.1",
    "https://192.168.1.1/path",
    "https://[::1]",
    "internal",
    "ftp://example.com/file",
    "mailto:user@example.com",
    "https://bad_host.example",
    "https://-bad.example",
    "https://bad-.example",
  ])("rejects invalid company host %s", (input) => {
    expect(() => normalizeCompanyDomain(input)).toThrow();
  });

  it("trims company names and rejects blank names", async () => {
    const repository = createMemoryCompanyRepository();

    const created = await repository.upsertByDomain({
      workspaceId: "workspace-1",
      domain: "example.com",
      name: "  Example Inc  ",
    });

    expect(created.name).toBe("Example Inc");
    await expect(
      repository.upsertByDomain({
        workspaceId: "workspace-1",
        domain: "other.example",
        name: "   ",
      }),
    ).rejects.toThrow();
  });
});

describe("evidenceSchema", () => {
  const baseEvidence = {
    kind: "confirmed_by_prospect" as const,
    statement: "Prospect confirmed a manual handoff.",
    observedAt: new Date("2026-06-20T12:00:00.000Z"),
    confidence: "high" as const,
    assumptions: [],
  };

  it("exposes the exact evidence and confidence vocabularies", () => {
    expect(evidenceKindValues).toEqual([
      "confirmed_by_prospect",
      "researched_fact",
      "hypothesis",
      "estimate",
    ]);
    expect(confidenceValues).toEqual(["low", "medium", "high"]);
  });

  it("allows prospect-confirmed evidence without a public source", () => {
    expect(evidenceSchema.parse(baseEvidence)).toEqual(baseEvidence);
  });

  it("requires a valid HTTP(S) source for researched facts", () => {
    expect(() =>
      evidenceSchema.parse({
        ...baseEvidence,
        kind: "researched_fact",
      }),
    ).toThrow();
    expect(() =>
      evidenceSchema.parse({
        ...baseEvidence,
        kind: "researched_fact",
        sourceUrl: "ftp://example.com/report",
      }),
    ).toThrow();

    expect(
      evidenceSchema.parse({
        ...baseEvidence,
        kind: "researched_fact",
        sourceUrl: "https://example.com/report",
      }).sourceUrl,
    ).toBe("https://example.com/report");
  });

  it.each(["hypothesis", "estimate"] as const)(
    "requires at least one assumption for %s evidence",
    (kind) => {
      expect(() =>
        evidenceSchema.parse({
          ...baseEvidence,
          kind,
        }),
      ).toThrow();

      expect(
        evidenceSchema.parse({
          ...baseEvidence,
          kind,
          assumptions: ["  Based on public hiring activity  "],
        }).assumptions,
      ).toEqual(["Based on public hiring activity"]);
    },
  );

  it("requires explicit confidence and a Date observation", () => {
    const withoutConfidence = {
      kind: baseEvidence.kind,
      statement: baseEvidence.statement,
      observedAt: baseEvidence.observedAt,
      assumptions: baseEvidence.assumptions,
    };

    expect(() => evidenceSchema.parse(withoutConfidence)).toThrow();
    expect(() =>
      evidenceSchema.parse({
        ...baseEvidence,
        observedAt: "2026-06-20T12:00:00.000Z",
      }),
    ).toThrow();
    expect(evidenceSchema.parse(baseEvidence).observedAt).toBeInstanceOf(Date);
  });

  it("trims statements and requires at least two characters", () => {
    expect(
      evidenceSchema.parse({
        ...baseEvidence,
        statement: "  Confirmed need  ",
      }).statement,
    ).toBe("Confirmed need");
    expect(() =>
      evidenceSchema.parse({ ...baseEvidence, statement: " x " }),
    ).toThrow();
  });

  it("trims assumptions and rejects duplicates or blank values", () => {
    expect(() =>
      evidenceSchema.parse({
        ...baseEvidence,
        kind: "hypothesis",
        assumptions: ["Growth continues", " Growth continues "],
      }),
    ).toThrow();
    expect(() =>
      evidenceSchema.parse({
        ...baseEvidence,
        kind: "estimate",
        assumptions: ["  "],
      }),
    ).toThrow();
  });
});

function columnNames(columns: { name: string }[]): string[] {
  return columns.map((column) => column.name);
}

describe("company and research database schemas", () => {
  it("indexes and uniquely identifies companies within a workspace", () => {
    const config = getTableConfig(companies);
    const unique = config.indexes.find(
      (index) => index.config.name === "companies_workspace_domain_unique",
    );
    const listing = config.indexes.find(
      (index) =>
        index.config.name === "companies_workspace_created_at_id_idx",
    );

    expect(columnNames(unique!.config.columns as { name: string }[])).toEqual([
      "workspace_id",
      "normalized_domain",
    ]);
    expect(
      columnNames(listing!.config.columns as { name: string }[]),
    ).toEqual(["workspace_id", "created_at", "id"]);
    expect(config.checks.map((check) => check.name)).toContain(
      "companies_version_positive_check",
    );
  });

  it("keeps campaign participation tenant-safe and unique", () => {
    const config = getTableConfig(campaignCompanies);
    const foreignColumnSets = config.foreignKeys.map((foreignKey) => {
      const reference = foreignKey.reference();
      return {
        local: columnNames(reference.columns),
        foreign: columnNames(reference.foreignColumns),
      };
    });
    const unique = config.indexes.find(
      (index) =>
        index.config.name === "campaign_companies_campaign_company_unique",
    );

    expect(foreignColumnSets).toEqual(
      expect.arrayContaining([
        {
          local: ["workspace_id", "campaign_id"],
          foreign: ["workspace_id", "id"],
        },
        {
          local: ["workspace_id", "company_id"],
          foreign: ["workspace_id", "id"],
        },
      ]),
    );
    expect(columnNames(unique!.config.columns as { name: string }[])).toEqual([
      "campaign_id",
      "company_id",
    ]);
    expect(campaignCompanies.status.enumValues).toEqual([
      "discovered",
      "researched",
      "qualified",
      "discarded",
    ]);
  });

  it("keeps sources unique per company and tenant-safe", () => {
    const config = getTableConfig(sources);
    const companyForeignKey = config.foreignKeys
      .map((foreignKey) => foreignKey.reference())
      .find(
        (reference) =>
          columnNames(reference.columns).join(",") ===
          "workspace_id,company_id",
      );
    const unique = config.indexes.find(
      (index) => index.config.name === "sources_company_url_unique",
    );

    expect(columnNames(companyForeignKey!.foreignColumns)).toEqual([
      "workspace_id",
      "id",
    ]);
    expect(columnNames(unique!.config.columns as { name: string }[])).toEqual([
      "company_id",
      "url",
    ]);
  });

  it("enforces evidence epistemology and tenant-safe optional links", () => {
    const config = getTableConfig(evidence);
    const checkNames = config.checks.map((check) => check.name);
    const foreignColumnSets = config.foreignKeys.map((foreignKey) => {
      const reference = foreignKey.reference();
      return columnNames(reference.columns);
    });

    expect(evidence.kind.enumValues).toEqual(evidenceKindValues);
    expect(evidence.confidence.enumValues).toEqual(confidenceValues);
    expect(checkNames).toEqual(
      expect.arrayContaining([
        "evidence_assumptions_json_array_check",
        "evidence_researched_fact_source_check",
        "evidence_inferred_assumptions_check",
      ]),
    );
    expect(foreignColumnSets).toEqual(
      expect.arrayContaining([
        ["workspace_id", "company_id"],
        ["workspace_id", "campaign_company_id"],
        ["workspace_id", "source_id"],
      ]),
    );
  });

  it("keeps offer opportunities tenant-safe and unique per company and offer", () => {
    const config = getTableConfig(offerOpportunities);
    const unique = config.indexes.find(
      (index) =>
        index.config.name ===
        "offer_opportunities_company_offer_unique",
    );
    const foreignColumnSets = config.foreignKeys.map((foreignKey) =>
      columnNames(foreignKey.reference().columns),
    );

    expect(offerOpportunities.status.enumValues).toEqual([
      "candidate",
      "fit",
      "not_fit",
    ]);
    expect(columnNames(unique!.config.columns as { name: string }[])).toEqual([
      "company_id",
      "offer_id",
    ]);
    expect(foreignColumnSets).toEqual(
      expect.arrayContaining([
        ["workspace_id", "company_id"],
        ["workspace_id", "offer_id"],
        ["workspace_id", "campaign_company_id"],
      ]),
    );
  });
});

describe("Drizzle company persistence", () => {
  it("uses an atomic domain conflict upsert and returns its row", async () => {
    let conflictTarget: string[] = [];
    let updatedFields: string[] = [];
    const returnedRow = {
      id: "company-1",
      workspaceId: "workspace-1",
      normalizedDomain: "example.com",
      displayDomain: "example.com",
      name: "Example",
      version: 1,
      createdAt: new Date("2026-06-20T12:00:00.000Z"),
      updatedAt: new Date("2026-06-20T12:00:00.000Z"),
    };
    const database = {
      insert() {
        return {
          values() {
            return {
              onConflictDoUpdate(config: {
                target: { name: string }[];
                set: Record<string, unknown>;
              }) {
                conflictTarget = config.target.map((column) => column.name);
                updatedFields = Object.keys(config.set);
                return {
                  returning: () => Promise.resolve([returnedRow]),
                };
              },
            };
          },
        };
      },
    } as unknown as CompanyDbExecutor;

    const row = await createDrizzleCompanyPersistenceExecutor(
      database,
    ).upsert(returnedRow);

    expect(conflictTarget).toEqual(["workspace_id", "normalized_domain"]);
    expect(updatedFields).toEqual(
      expect.arrayContaining([
        "displayDomain",
        "name",
        "updatedAt",
        "version",
      ]),
    );
    expect(row).toBe(returnedRow);
  });

  it("normalizes input and validates rows returned by persistence", async () => {
    let persisted:
      | Parameters<CompanyPersistenceExecutor["upsert"]>[0]
      | undefined;
    const now = new Date("2026-06-20T12:00:00.000Z");
    const executor: CompanyPersistenceExecutor = {
      async upsert(record) {
        persisted = record;
        return record;
      },
      async getById() {
        return null;
      },
      async getByDomain() {
        return null;
      },
      async count() {
        return 0;
      },
    };
    const repository = createDrizzleCompanyRepository(executor, {
      createId: () => "company-1",
      now: () => now,
    });

    const created = await repository.upsertByDomain({
      workspaceId: "workspace-1",
      domain: "https://WWW.Example.com./path",
      name: "  Example Inc  ",
    });

    expect(persisted).toEqual({
      id: "company-1",
      workspaceId: "workspace-1",
      normalizedDomain: "example.com",
      displayDomain: "example.com",
      name: "Example Inc",
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    expect(created).toEqual(persisted);
  });

  it("rejects a malformed persistence row", async () => {
    const executor: CompanyPersistenceExecutor = {
      async upsert() {
        return { id: "company-1" };
      },
      async getById() {
        return null;
      },
      async getByDomain() {
        return null;
      },
      async count() {
        return 0;
      },
    };
    const repository = createDrizzleCompanyRepository(executor);

    await expect(
      repository.upsertByDomain({
        workspaceId: "workspace-1",
        domain: "example.com",
        name: "Example",
      }),
    ).rejects.toThrow();
  });
});
