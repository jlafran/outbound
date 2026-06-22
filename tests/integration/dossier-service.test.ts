import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  campaignCompanies,
  dossiers,
  workspaceMembers,
} from "@/db/schema";
import {
  dossierItemSchema,
  dossierSchema,
  type Dossier,
} from "@/features/dossiers/dossier-schema";
import {
  createDrizzleDossierRepository,
  createDrizzleDossierPersistenceExecutor,
  createMemoryDossierRepository,
  DossierError,
  type DossierDbExecutor,
  type DossierPersistenceExecutor,
} from "@/features/dossiers/dossier-repository";
import {
  DossierService,
  type DossierSourceReader,
} from "@/features/dossiers/dossier-service";
import { createMemoryDossierUnitOfWork } from "@/features/dossiers/dossier-unit-of-work";

const sourceMaterial = {
  executiveSummary: "The prospect is evaluating pipeline improvements",
  companyOverview: "Acme sells workflow software",
  businessModel: "Annual B2B subscriptions",
  contacts: [
    {
      name: "Alex Rivera",
      role: "VP Sales",
      corporateEmail: "alex@acme.example",
    },
  ],
  conversationSummary: "Alex described inconsistent qualification",
  evidence: [
    {
      id: "confirmed-1",
      kind: "confirmed_by_prospect" as const,
      statement: "Qualification is inconsistent",
      confidence: "high" as const,
      assumptions: [],
      hidden: false,
    },
    {
      id: "fact-1",
      kind: "researched_fact" as const,
      statement: "Acme opened a second sales office",
      sourceUrl: "https://acme.example/news",
      confidence: "high" as const,
      assumptions: [],
      hidden: false,
    },
    {
      id: "hypothesis-1",
      kind: "hypothesis" as const,
      statement: "Growth may be increasing onboarding pressure",
      confidence: "medium" as const,
      assumptions: ["The new office is hiring"],
      hidden: false,
    },
    {
      id: "estimate-1",
      kind: "estimate" as const,
      statement: "A pilot may save ten hours weekly",
      confidence: "low" as const,
      assumptions: ["Five representatives use the workflow"],
      hidden: false,
    },
  ],
  competitors: [
    {
      id: "competitor-1",
      kind: "hypothesis" as const,
      statement: "A competing CRM may be under evaluation",
      confidence: "low" as const,
      assumptions: ["The procurement cycle is active"],
      hidden: false,
    },
  ],
  recommendations: [
    {
      id: "recommendation-1",
      kind: "recommendation" as const,
      statement: "Run a two-week qualification pilot",
      confidence: "medium" as const,
      assumptions: [],
      hidden: false,
    },
  ],
  pendingQuestions: ["How many representatives need access?"],
};

function createSourceReader(
  material = sourceMaterial,
): DossierSourceReader {
  return {
    async read() {
      return structuredClone(material);
    },
  };
}

function createDossier(overrides: Partial<Dossier> = {}): Dossier {
  return dossierSchema.parse({
    id: "dossier-1",
    workspaceId: "workspace-1",
    campaignCompanyId: "campaign-company-1",
    meetingId: null,
    version: 1,
    previousVersionId: null,
    executiveSummary: "Executive summary",
    companyOverview: "Company overview",
    businessModel: "Business model",
    contacts: [],
    conversationSummary: "Conversation summary",
    confirmedNeeds: [],
    researchedFacts: [],
    hypotheses: [],
    estimates: [],
    competitors: [],
    recommendations: [],
    pendingQuestions: [],
    createdAt: new Date("2026-06-21T12:00:00.000Z"),
    createdBy: "user-1",
    ...overrides,
  });
}

describe("dossierSchema", () => {
  it("keeps item categories separated", () => {
    const base = {
      id: "dossier-1",
      workspaceId: "workspace-1",
      campaignCompanyId: "campaign-company-1",
      meetingId: null,
      version: 1,
      previousVersionId: null,
      executiveSummary: "Executive summary",
      companyOverview: "Company overview",
      businessModel: "Business model",
      contacts: [],
      conversationSummary: "Conversation summary",
      confirmedNeeds: [],
      researchedFacts: [],
      hypotheses: [],
      estimates: [],
      competitors: [],
      recommendations: [],
      pendingQuestions: [],
      createdAt: new Date("2026-06-21T12:00:00.000Z"),
      createdBy: "user-1",
    };

    expect(() =>
      dossierSchema.parse({
        ...base,
        researchedFacts: [
          {
            id: "item-1",
            kind: "hypothesis",
            statement: "This belongs in hypotheses",
            confidence: "medium",
            assumptions: ["The market remains stable"],
            hidden: false,
          },
        ],
      }),
    ).toThrow();
  });

  it("requires sources for facts and assumptions for hypotheses and estimates", () => {
    expect(() =>
      dossierItemSchema.parse({
        id: "fact-1",
        kind: "researched_fact",
        statement: "Revenue grew last year",
        confidence: "high",
        assumptions: [],
      }),
    ).toThrow();
    expect(() =>
      dossierItemSchema.parse({
        id: "hypothesis-1",
        kind: "hypothesis",
        statement: "The team may be understaffed",
        confidence: "medium",
        assumptions: [],
      }),
    ).toThrow();
    expect(() =>
      dossierItemSchema.parse({
        id: "estimate-1",
        kind: "estimate",
        statement: "The project may take six months",
        confidence: "low",
        assumptions: [],
      }),
    ).toThrow();
  });

  it("accepts recommendations without sources and defaults hidden to false", () => {
    expect(
      dossierItemSchema.parse({
        id: "recommendation-1",
        kind: "recommendation",
        statement: "Prioritize a short discovery pilot",
        confidence: "medium",
        assumptions: [],
      }),
    ).toMatchObject({
      kind: "recommendation",
      hidden: false,
    });
  });

  it("rejects invalid contacts and duplicate trimmed questions", () => {
    const valid = dossierSchema.parse({
      id: "dossier-1",
      workspaceId: "workspace-1",
      campaignCompanyId: "campaign-company-1",
      meetingId: null,
      version: 1,
      previousVersionId: null,
      executiveSummary: "Executive summary",
      companyOverview: "Company overview",
      businessModel: "Business model",
      contacts: [],
      conversationSummary: "Conversation summary",
      confirmedNeeds: [],
      researchedFacts: [],
      hypotheses: [],
      estimates: [],
      competitors: [],
      recommendations: [],
      pendingQuestions: [],
      createdAt: new Date("2026-06-21T12:00:00.000Z"),
      createdBy: "user-1",
    });

    expect(() =>
      dossierSchema.parse({
        ...valid,
        contacts: [
          {
            name: "A",
            role: "CEO",
            corporateEmail: "not-an-email",
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      dossierSchema.parse({
        ...valid,
        pendingQuestions: ["First question", " First question "],
      }),
    ).toThrow();
  });

  it("rejects duplicate item ids across categories", () => {
    expect(() =>
      dossierSchema.parse({
        ...createDossier(),
        researchedFacts: [
          {
            id: "shared-item",
            kind: "researched_fact",
            statement: "A sourced fact",
            sourceUrl: "https://example.com/fact",
            confidence: "high",
            assumptions: [],
            hidden: false,
          },
        ],
        recommendations: [
          {
            id: "shared-item",
            kind: "recommendation",
            statement: "Act on the sourced fact",
            confidence: "medium",
            assumptions: [],
            hidden: false,
          },
        ],
      }),
    ).toThrowError(/unique/i);
  });
});

describe("DossierService", () => {
  it("builds v1 from source material and keeps categories distinct", async () => {
    const unitOfWork = createMemoryDossierUnitOfWork();
    const service = new DossierService(
      unitOfWork,
      createSourceReader(),
    );

    const created = await service.build({
      workspaceId: "workspace-1",
      campaignCompanyId: "campaign-company-1",
      meetingId: "meeting-1",
      actorId: "user-1",
    });

    expect(created).toMatchObject({
      version: 1,
      previousVersionId: null,
      meetingId: "meeting-1",
      createdBy: "user-1",
      confirmedNeeds: [{ kind: "confirmed_by_prospect" }],
      researchedFacts: [{ kind: "researched_fact" }],
      hypotheses: [{ kind: "hypothesis" }],
      estimates: [{ kind: "estimate" }],
      competitors: [{ kind: "hypothesis" }],
      recommendations: [{ kind: "recommendation" }],
    });
    expect(
      await unitOfWork.dossierRepository.getLatest(
        "workspace-1",
        "campaign-company-1",
      ),
    ).toEqual(created);
  });

  it("keeps confirmed needs empty when the source has none", async () => {
    const unitOfWork = createMemoryDossierUnitOfWork();
    const service = new DossierService(
      unitOfWork,
      createSourceReader({
        ...sourceMaterial,
        evidence: sourceMaterial.evidence.filter(
          (item) => item.kind !== "confirmed_by_prospect",
        ),
      }),
    );

    const created = await service.build({
      workspaceId: "workspace-1",
      campaignCompanyId: "campaign-company-1",
      meetingId: null,
      actorId: "user-1",
    });

    expect(created.confirmedNeeds).toEqual([]);
  });

  it("applies hidden defaults to source items", async () => {
    const unitOfWork = createMemoryDossierUnitOfWork();
    const service = new DossierService(unitOfWork, {
      async read() {
        return {
          ...structuredClone(sourceMaterial),
          evidence: [
            {
              id: "fact-with-default",
              kind: "researched_fact",
              statement: "A sourced fact without an explicit hidden flag",
              sourceUrl: "https://example.com/default",
              confidence: "high",
              assumptions: [],
            },
          ],
          competitors: [],
          recommendations: [],
        };
      },
    });

    const created = await service.build({
      workspaceId: "workspace-1",
      campaignCompanyId: "campaign-company-1",
      meetingId: null,
      actorId: "user-1",
    });

    expect(created.researchedFacts[0].hidden).toBe(false);
  });

  it("rejects recommendations supplied through evidence", async () => {
    const unitOfWork = createMemoryDossierUnitOfWork();
    const service = new DossierService(unitOfWork, {
      async read() {
        return {
          ...structuredClone(sourceMaterial),
          evidence: [
            ...structuredClone(sourceMaterial.evidence),
            {
              id: "misplaced-recommendation",
              kind: "recommendation",
              statement: "This belongs in the recommendations field",
              confidence: "medium",
              assumptions: [],
              hidden: false,
            },
          ],
        };
      },
    } as DossierSourceReader);

    await expect(
      service.build({
        workspaceId: "workspace-1",
        campaignCompanyId: "campaign-company-1",
        meetingId: null,
        actorId: "user-1",
      }),
    ).rejects.toThrow();
    expect(
      await unitOfWork.dossierRepository.listVersions(
        "workspace-1",
        "campaign-company-1",
      ),
    ).toEqual([]);
  });

  it("rejects building a second initial version", async () => {
    const unitOfWork = createMemoryDossierUnitOfWork();
    const service = new DossierService(
      unitOfWork,
      createSourceReader(),
    );
    const input = {
      workspaceId: "workspace-1",
      campaignCompanyId: "campaign-company-1",
      meetingId: null,
      actorId: "user-1",
    };

    await service.build(input);

    await expect(service.build(input)).rejects.toMatchObject({
      code: "DOSSIER_ALREADY_EXISTS",
    });
  });

  it("edits by appending an immutable version", async () => {
    const unitOfWork = createMemoryDossierUnitOfWork();
    const dates = [
      new Date("2026-06-21T12:00:00.000Z"),
      new Date("2026-06-22T12:00:00.000Z"),
    ];
    const ids = ["dossier-v1", "dossier-v2"];
    const service = new DossierService(
      unitOfWork,
      createSourceReader(),
      {
        createId: () => ids.shift()!,
        now: () => dates.shift()!,
      },
    );
    const first = await service.build({
      workspaceId: "workspace-1",
      campaignCompanyId: "campaign-company-1",
      meetingId: null,
      actorId: "user-1",
    });

    const second = await service.edit({
      workspaceId: "workspace-1",
      campaignCompanyId: "campaign-company-1",
      actorId: "user-2",
      expectedVersion: 1,
      patch: {
        executiveSummary: "Updated executive summary",
        meetingId: "meeting-2",
      },
    });

    expect(second).toMatchObject({
      id: "dossier-v2",
      version: 2,
      previousVersionId: "dossier-v1",
      createdBy: "user-2",
      createdAt: new Date("2026-06-22T12:00:00.000Z"),
      executiveSummary: "Updated executive summary",
      meetingId: "meeting-2",
    });
    expect(
      await unitOfWork.dossierRepository.getById(
        "workspace-1",
        first.id,
      ),
    ).toEqual(first);
  });

  it("rejects stale edits that target an older dossier id even if the version matches", async () => {
    const unitOfWork = createMemoryDossierUnitOfWork();
    const service = new DossierService(
      unitOfWork,
      createSourceReader(),
    );
    const first = await service.build({
      workspaceId: "workspace-1",
      campaignCompanyId: "campaign-company-1",
      meetingId: null,
      actorId: "user-1",
    });
    const second = await service.edit({
      workspaceId: "workspace-1",
      campaignCompanyId: "campaign-company-1",
      actorId: "user-2",
      expectedVersion: 1,
      patch: { executiveSummary: "Current summary" },
    });

    await expect(
      (service as unknown as {
        editById(input: {
          workspaceId: string;
          campaignCompanyId: string;
          dossierId: string;
          actorId: string;
          expectedVersion: number;
          expectedLatestId: string;
          patch: { executiveSummary: string };
        }): Promise<Dossier>;
      }).editById({
        workspaceId: "workspace-1",
        campaignCompanyId: "campaign-company-1",
        dossierId: first.id,
        actorId: "user-3",
        expectedVersion: second.version,
        expectedLatestId: second.id,
        patch: { executiveSummary: "Should be rejected" },
      }),
    ).rejects.toMatchObject({
      code: "STALE_DOSSIER_VERSION",
    });
  });

  it("hides an item by creating a new version", async () => {
    const unitOfWork = createMemoryDossierUnitOfWork();
    const service = new DossierService(
      unitOfWork,
      createSourceReader(),
    );
    const first = await service.build({
      workspaceId: "workspace-1",
      campaignCompanyId: "campaign-company-1",
      meetingId: null,
      actorId: "user-1",
    });

    const hidden = await service.hideItem({
      workspaceId: "workspace-1",
      campaignCompanyId: "campaign-company-1",
      actorId: "user-2",
      expectedVersion: 1,
      itemId: "fact-1",
    });

    expect(hidden.version).toBe(2);
    expect(hidden.researchedFacts[0].hidden).toBe(true);
    expect(first.researchedFacts[0].hidden).toBe(false);
  });

  it("returns a stable error when hiding an unknown item", async () => {
    const unitOfWork = createMemoryDossierUnitOfWork();
    const service = new DossierService(
      unitOfWork,
      createSourceReader(),
    );
    await service.build({
      workspaceId: "workspace-1",
      campaignCompanyId: "campaign-company-1",
      meetingId: null,
      actorId: "user-1",
    });

    await expect(
      service.hideItem({
        workspaceId: "workspace-1",
        campaignCompanyId: "campaign-company-1",
        actorId: "user-2",
        expectedVersion: 1,
        itemId: "missing-item",
      }),
    ).rejects.toMatchObject({
      code: "DOSSIER_ITEM_NOT_FOUND",
    });
    expect(
      await unitOfWork.dossierRepository.listVersions(
        "workspace-1",
        "campaign-company-1",
      ),
    ).toHaveLength(1);
  });

  it("rejects identity changes and invalid edited items", async () => {
    const unitOfWork = createMemoryDossierUnitOfWork();
    const service = new DossierService(
      unitOfWork,
      createSourceReader(),
    );
    await service.build({
      workspaceId: "workspace-1",
      campaignCompanyId: "campaign-company-1",
      meetingId: null,
      actorId: "user-1",
    });

    await expect(
      service.edit({
        workspaceId: "workspace-1",
        campaignCompanyId: "campaign-company-1",
        actorId: "user-2",
        expectedVersion: 1,
        patch: {
          workspaceId: "workspace-2",
        } as never,
      }),
    ).rejects.toThrow();
    await expect(
      service.edit({
        workspaceId: "workspace-1",
        campaignCompanyId: "campaign-company-1",
        actorId: "user-2",
        expectedVersion: 1,
        patch: {
          researchedFacts: [
            {
              id: "fact-1",
              kind: "researched_fact",
              statement: "Missing its source",
              confidence: "high",
              assumptions: [],
              hidden: true,
            },
          ],
        } as never,
      }),
    ).rejects.toThrow();
    expect(
      await unitOfWork.dossierRepository.listVersions(
        "workspace-1",
        "campaign-company-1",
      ),
    ).toHaveLength(1);
  });

  it("allows exactly one concurrent edit at an expected version", async () => {
    const unitOfWork = createMemoryDossierUnitOfWork();
    const service = new DossierService(
      unitOfWork,
      createSourceReader(),
    );
    await service.build({
      workspaceId: "workspace-1",
      campaignCompanyId: "campaign-company-1",
      meetingId: null,
      actorId: "user-1",
    });

    const results = await Promise.allSettled([
      service.edit({
        workspaceId: "workspace-1",
        campaignCompanyId: "campaign-company-1",
        actorId: "user-2",
        expectedVersion: 1,
        patch: { executiveSummary: "First concurrent edit" },
      }),
      service.edit({
        workspaceId: "workspace-1",
        campaignCompanyId: "campaign-company-1",
        actorId: "user-3",
        expectedVersion: 1,
        patch: { executiveSummary: "Second concurrent edit" },
      }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(
      await unitOfWork.dossierRepository.listVersions(
        "workspace-1",
        "campaign-company-1",
      ),
    ).toHaveLength(2);
  });

  it("rolls back a version and retries once when audit fails", async () => {
    let failurePending = true;
    const unitOfWork = createMemoryDossierUnitOfWork({
      beforeAuditAppend() {
        if (failurePending) {
          failurePending = false;
          throw new Error("audit failed");
        }
      },
    });
    const service = new DossierService(
      unitOfWork,
      createSourceReader(),
    );
    const input = {
      workspaceId: "workspace-1",
      campaignCompanyId: "campaign-company-1",
      meetingId: null,
      actorId: "user-1",
    };

    await expect(service.build(input)).rejects.toThrow("audit failed");
    expect(
      await unitOfWork.dossierRepository.listVersions(
        "workspace-1",
        "campaign-company-1",
      ),
    ).toEqual([]);
    expect(await unitOfWork.auditRepository.list("workspace-1")).toEqual([]);

    const retried = await service.build(input);
    const events = await unitOfWork.auditRepository.list("workspace-1");

    expect(
      await unitOfWork.dossierRepository.listVersions(
        "workspace-1",
        "campaign-company-1",
      ),
    ).toEqual([retried]);
    expect(events).toEqual([
      {
        workspaceId: "workspace-1",
        actorId: "user-1",
        action: "dossier.updated",
        entityId: retried.id,
        metadata: {
          dossierId: retried.id,
          campaignCompanyId: "campaign-company-1",
          version: 1,
          operation: "build",
        },
      },
    ]);
  });
});

describe("DossierRepository", () => {
  it("isolates workspaces and protects memory records from mutation", async () => {
    const repository = createMemoryDossierRepository();
    const input = createDossier({
      researchedFacts: [
        {
          id: "fact-1",
          kind: "researched_fact",
          statement: "A sourced fact",
          sourceUrl: "https://example.com/fact",
          confidence: "high",
          assumptions: [],
          hidden: false,
        },
      ],
    });

    const created = await repository.createInitial(input);
    input.researchedFacts[0].statement = "Mutated input";
    created.researchedFacts[0].statement = "Mutated output";

    expect(
      await repository.getById("workspace-2", created.id),
    ).toBeNull();
    expect(
      (
        await repository.getLatest(
          "workspace-1",
          "campaign-company-1",
        )
      )?.researchedFacts[0].statement,
    ).toBe("A sourced fact");
  });

  it("never overwrites an immutable version when an id is reused", async () => {
    const repository = createMemoryDossierRepository();
    const first = await repository.createInitial(createDossier());

    await expect(
      repository.appendVersion(
        createDossier({
          id: first.id,
          version: 2,
          previousVersionId: first.id,
          createdAt: new Date("2026-06-22T12:00:00.000Z"),
        }),
        1,
        first.id,
      ),
    ).rejects.toMatchObject({
      code: "STALE_DOSSIER_VERSION",
    });
    expect(
      await repository.getById("workspace-1", first.id),
    ).toEqual(first);
  });

  it("maps stale persistence to the stable dossier error", async () => {
    const executor: DossierPersistenceExecutor = {
      async insertInitial(record) {
        return record;
      },
      async insertVersionIfLatest() {
        return null;
      },
      async getLatest() {
        return null;
      },
      async getById() {
        return null;
      },
      async listVersions() {
        return [];
      },
    };
    const repository = createDrizzleDossierRepository(executor);

    await expect(
      repository.appendVersion(
        createDossier({
          id: "dossier-2",
          version: 2,
          previousVersionId: "dossier-1",
        }),
        1,
        "dossier-1",
      ),
    ).rejects.toEqual(
      new DossierError("STALE_DOSSIER_VERSION"),
    );
  });

  it.each([
    ["23505", "DOSSIER_ALREADY_EXISTS"],
    ["23503", "INVALID_DOSSIER_REFERENCE"],
  ] as const)(
    "maps nested initial insert PostgreSQL error %s to %s",
    async (databaseCode, dossierCode) => {
      const executor: DossierPersistenceExecutor = {
        async insertInitial() {
          throw Object.assign(new Error("Drizzle query failed"), {
            cause: {
              cause: {
                code: databaseCode,
              },
            },
          });
        },
        async insertVersionIfLatest() {
          return null;
        },
        async getLatest() {
          return null;
        },
        async getById() {
          return null;
        },
        async listVersions() {
          return [];
        },
      };

      await expect(
        createDrizzleDossierRepository(executor).createInitial(
          createDossier(),
        ),
      ).rejects.toMatchObject({ code: dossierCode });
    },
  );

  it.each([
    ["23505", "STALE_DOSSIER_VERSION"],
    ["23503", "INVALID_DOSSIER_REFERENCE"],
  ] as const)(
    "maps nested append PostgreSQL error %s to %s",
    async (databaseCode, dossierCode) => {
      const executor: DossierPersistenceExecutor = {
        async insertInitial(record) {
          return record;
        },
        async insertVersionIfLatest() {
          throw Object.assign(new Error("Drizzle query failed"), {
            cause: {
              code: databaseCode,
            },
          });
        },
        async getLatest() {
          return null;
        },
        async getById() {
          return null;
        },
        async listVersions() {
          return [];
        },
      };

      await expect(
      createDrizzleDossierRepository(executor).appendVersion(
        createDossier({
          id: "dossier-2",
          version: 2,
          previousVersionId: "dossier-1",
        }),
        1,
        "dossier-1",
      ),
      ).rejects.toMatchObject({ code: dossierCode });
    },
  );

  it.each(["create", "append"] as const)(
    "does not obscure unknown %s failures through nested causes",
    async (operation) => {
      const failure = Object.assign(new Error("Drizzle query failed"), {
        cause: Object.assign(new Error("database unavailable"), {
          code: "08006",
        }),
      });
      const executor: DossierPersistenceExecutor = {
        async insertInitial() {
          throw failure;
        },
        async insertVersionIfLatest() {
          throw failure;
        },
        async getLatest() {
          return null;
        },
        async getById() {
          return null;
        },
        async listVersions() {
          return [];
        },
      };
      const repository = createDrizzleDossierRepository(executor);
      const promise =
        operation === "create"
          ? repository.createInitial(createDossier())
          : repository.appendVersion(
              createDossier({
                id: "dossier-2",
                version: 2,
                previousVersionId: "dossier-1",
              }),
              1,
              "dossier-1",
            );

      await expect(promise).rejects.toBe(failure);
    },
  );

  it("preserves cyclic unknown errors without looping", async () => {
    const failure = new Error("cyclic Drizzle error") as Error & {
      cause?: unknown;
    };
    const nested = { cause: failure };
    failure.cause = nested;
    const executor: DossierPersistenceExecutor = {
      async insertInitial() {
        throw failure;
      },
      async insertVersionIfLatest() {
        return null;
      },
      async getLatest() {
        return null;
      },
      async getById() {
        return null;
      },
      async listVersions() {
        return [];
      },
    };

    await expect(
      createDrizzleDossierRepository(executor).createInitial(
        createDossier(),
      ),
    ).rejects.toBe(failure);
  });

  it("parses every persistence row and preserves ascending order", async () => {
    const calls: string[] = [];
    const first = createDossier();
    const second = createDossier({
      id: "dossier-2",
      version: 2,
      previousVersionId: first.id,
    });
    const executor: DossierPersistenceExecutor = {
      async insertInitial(record) {
        return record;
      },
      async insertVersionIfLatest() {
        return second;
      },
      async getLatest(identity) {
        calls.push(`latest:${identity.workspaceId}:${identity.campaignCompanyId}`);
        return second;
      },
      async getById(identity) {
        calls.push(`id:${identity.workspaceId}:${identity.id}`);
        return first;
      },
      async listVersions(identity) {
        calls.push(`list:${identity.workspaceId}:${identity.campaignCompanyId}`);
        return [first, second];
      },
    };
    const repository = createDrizzleDossierRepository(executor);

    expect(
      await repository.getLatest("workspace-1", "campaign-company-1"),
    ).toEqual(second);
    expect(await repository.getById("workspace-1", first.id)).toEqual(first);
    expect(
      await repository.listVersions("workspace-1", "campaign-company-1"),
    ).toEqual([first, second]);
    expect(calls).toEqual([
      "latest:workspace-1:campaign-company-1",
      "id:workspace-1:dossier-1",
      "list:workspace-1:campaign-company-1",
    ]);
  });

  it("uses tenant predicates and deterministic latest/list ordering", async () => {
    const whereColumns: string[][] = [];
    const orderColumns: string[][] = [];
    const collectColumns = (value: unknown): string[] => {
      if (typeof value !== "object" || value === null) {
        return [];
      }
      if ("name" in value && typeof value.name === "string") {
        return [value.name];
      }
      if ("queryChunks" in value && Array.isArray(value.queryChunks)) {
        return value.queryChunks.flatMap(collectColumns);
      }
      return [];
    };
    const database = {
      select() {
        return {
          from() {
            return {
              where(expression: unknown) {
                whereColumns.push(collectColumns(expression));
                return {
                  orderBy(...expressions: unknown[]) {
                    orderColumns.push(expressions.flatMap(collectColumns));
                    return {
                      limit() {
                        return Promise.resolve([]);
                      },
                      then(resolve: (value: unknown[]) => unknown) {
                        return Promise.resolve([]).then(resolve);
                      },
                    };
                  },
                  limit() {
                    return Promise.resolve([]);
                  },
                };
              },
            };
          },
        };
      },
    } as unknown as DossierDbExecutor;
    const executor = createDrizzleDossierPersistenceExecutor(database);

    await executor.getLatest({
      workspaceId: "workspace-1",
      campaignCompanyId: "campaign-company-1",
    });
    await executor.getById({
      workspaceId: "workspace-1",
      id: "dossier-1",
    });
    await executor.listVersions({
      workspaceId: "workspace-1",
      campaignCompanyId: "campaign-company-1",
    });

    expect(whereColumns).toEqual([
      expect.arrayContaining(["workspace_id", "campaign_company_id"]),
      expect.arrayContaining(["workspace_id", "id"]),
      expect.arrayContaining(["workspace_id", "campaign_company_id"]),
    ]);
    expect(orderColumns).toEqual([
      ["version", "id"],
      ["version", "id"],
    ]);
  });
});

describe("dossiers schema", () => {
  it("has tenant-safe relationships, immutable version uniqueness, and checks", () => {
    const config = getTableConfig(dossiers);
    const foreignKeys = config.foreignKeys.map((foreignKey) =>
      foreignKey.reference(),
    );

    expect(
      foreignKeys.some(
        (reference) =>
          reference.foreignTable === campaignCompanies &&
          reference.columns.map((column) => column.name).join(",") ===
            "workspace_id,campaign_company_id",
      ),
    ).toBe(true);
    expect(
      foreignKeys.some(
        (reference) =>
          reference.foreignTable === workspaceMembers &&
          reference.columns.map((column) => column.name).join(",") ===
            "workspace_id,created_by",
      ),
    ).toBe(true);
    expect(
      foreignKeys.some(
        (reference) =>
          reference.foreignTable === dossiers &&
          reference.columns.map((column) => column.name).join(",") ===
            "workspace_id,campaign_company_id,previous_version_id,previous_version" &&
          reference.foreignColumns
            .map((column) => column.name)
            .join(",") ===
            "workspace_id,campaign_company_id,id,version",
      ),
    ).toBe(true);
    expect(config.indexes.map((index) => index.config.name)).toEqual(
      expect.arrayContaining([
        "dossiers_workspace_id_unique",
        "dossiers_workspace_company_version_unique",
        "dossiers_version_chain_target_unique",
        "dossiers_latest_idx",
      ]),
    );
    expect(config.checks.map((check) => check.name)).toEqual(
      expect.arrayContaining([
        "dossiers_version_positive_check",
        "dossiers_version_chain_check",
        "dossiers_contacts_json_array_check",
        "dossiers_confirmed_needs_json_array_check",
        "dossiers_researched_facts_json_array_check",
        "dossiers_hypotheses_json_array_check",
        "dossiers_estimates_json_array_check",
        "dossiers_competitors_json_array_check",
        "dossiers_recommendations_json_array_check",
        "dossiers_pending_questions_json_array_check",
      ]),
    );
    expect(
      config.columns.map((column) => column.name),
    ).toContain("previous_version");
  });
});
