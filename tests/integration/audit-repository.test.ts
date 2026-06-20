import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";

import {
  auditEvents,
  type JsonValue,
  workspaceMembers,
} from "@/db/schema";
import {
  createDrizzleAuditRepository,
  createMemoryAuditRepository,
  type AuditDbExecutor,
  type AuditEventInput,
} from "@/features/audit/audit-repository";

const validJsonMetadata: JsonValue = {
  active: true,
  count: 3,
  nested: {
    nullable: null,
    values: ["text", 2, false, { deeper: "value" }],
  },
};

// @ts-expect-error Date instances are not JSON-safe values.
const invalidJsonMetadata: JsonValue = { createdAt: new Date() };

void invalidJsonMetadata;

function createEvent(
  overrides: Partial<AuditEventInput> = {},
): AuditEventInput {
  return {
    workspaceId: "workspace-1",
    actorId: "user-1",
    action: "offer.created",
    entityId: "offer-1",
    metadata: {},
    ...overrides,
  };
}

describe("createMemoryAuditRepository", () => {
  it("accepts nested JSON-safe metadata", async () => {
    const repository = createMemoryAuditRepository();
    const event = createEvent({ metadata: validJsonMetadata });

    await repository.append(event);

    expect(await repository.list("workspace-1")).toEqual([event]);
  });

  it("lists a workspace's events in insertion order", async () => {
    const repository = createMemoryAuditRepository();
    const firstEvent = createEvent({ entityId: "offer-1" });
    const otherWorkspaceEvent = createEvent({
      workspaceId: "workspace-2",
      entityId: "offer-2",
    });
    const secondEvent = createEvent({
      action: "offer.normalized",
      entityId: "offer-3",
    });

    await repository.append(firstEvent);
    await repository.append(otherWorkspaceEvent);
    await repository.append(secondEvent);

    expect(await repository.list("workspace-1")).toEqual([
      firstEvent,
      secondEvent,
    ]);
  });

  it("keeps stored events immutable from input and output mutations", async () => {
    const repository = createMemoryAuditRepository();
    const event = createEvent({
      metadata: {
        nested: { status: "original" },
        tags: ["initial"],
      },
    });

    await repository.append(event);

    const mutableInputMetadata = event.metadata as {
      nested: { status: string };
      tags: string[];
    };
    mutableInputMetadata.nested.status = "changed-input";
    mutableInputMetadata.tags.push("changed-input");

    const firstRead = await repository.list("workspace-1");
    const mutableReturnedMetadata = firstRead[0].metadata as {
      nested: { status: string };
      tags: string[];
    };
    mutableReturnedMetadata.nested.status = "changed-output";
    mutableReturnedMetadata.tags.push("changed-output");

    expect(await repository.list("workspace-1")).toEqual([
      createEvent({
        metadata: {
          nested: { status: "original" },
          tags: ["initial"],
        },
      }),
    ]);
  });
});

describe("createDrizzleAuditRepository", () => {
  it("lists workspace events by workspace and monotonic sequence", async () => {
    let orderedColumns: string[] = [];
    const database = {
      select() {
        return {
          from() {
            return {
              where() {
                return {
                  orderBy(...expressions: { queryChunks: unknown[] }[]) {
                    orderedColumns = expressions.map((expression) => {
                      const column = expression.queryChunks.find(
                        (chunk): chunk is { name: string } =>
                          typeof chunk === "object" &&
                          chunk !== null &&
                          "name" in chunk,
                      );

                      return column?.name ?? "";
                    });
                    return Promise.resolve([]);
                  },
                };
              },
            };
          },
        };
      },
    } as unknown as AuditDbExecutor;

    await createDrizzleAuditRepository(database).list("workspace-1");

    expect(orderedColumns).toEqual(["workspace_id", "sequence"]);
  });
});

describe("auditEvents schema", () => {
  it("constrains actions to the AuditAction values", () => {
    expect(auditEvents.action.enumValues).toEqual([
      "offer.created",
      "offer.normalized",
      "campaign.created",
      "niches.recommended",
      "niches.approved",
      "company.scored",
      "dossier.updated",
      "dossier.exported",
    ]);
  });

  it("requires the actor to be a member of the event workspace", () => {
    const config = getTableConfig(auditEvents);
    const tenantActorForeignKey = config.foreignKeys.find((foreignKey) => {
      const reference = foreignKey.reference();

      return (
        reference.foreignTable === workspaceMembers &&
        reference.columns.map((column) => column.name).join(",") ===
          "workspace_id,actor_id"
      );
    });

    expect(tenantActorForeignKey?.reference().foreignColumns).toEqual([
      workspaceMembers.workspaceId,
      workspaceMembers.userId,
    ]);
  });

  it("indexes workspace audit listings deterministically", () => {
    const config = getTableConfig(auditEvents);
    const listingIndex = config.indexes.find(
      (index) => index.config.name === "audit_events_workspace_listing_idx",
    );

    expect(
      listingIndex?.config.columns.map((column) =>
        "name" in column ? column.name : undefined,
      ),
    ).toEqual(["workspace_id", "sequence"]);
  });

  it("uses a database-generated monotonic sequence for append order", () => {
    const sequenceColumn = getTableConfig(auditEvents).columns.find(
      (column) => column.name === "sequence",
    );

    expect(sequenceColumn).toMatchObject({
      dataType: "number",
      notNull: true,
      hasDefault: true,
    });
  });
});
