import { describe, expect, it } from "vitest";

import {
  createMemoryAuditRepository,
  type AuditEventInput,
} from "@/features/audit/audit-repository";

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
