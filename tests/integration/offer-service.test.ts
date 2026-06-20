import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { offers, workspaceMembers } from "@/db/schema";
import { createMemoryAuditRepository } from "@/features/audit/audit-repository";
import {
  createMemoryOfferRepository,
  type OfferRecord,
} from "@/features/offers/offer-repository";
import { OfferService } from "@/features/offers/offer-service";
import { validOfferInput } from "../fixtures/offer";

describe("OfferService", () => {
  it("normalizes and persists an offer for its workspace", async () => {
    const offerRepository = createMemoryOfferRepository();
    const service = new OfferService(
      offerRepository,
      createMemoryAuditRepository(),
    );

    const created = await service.createOffer({
      workspaceId: "workspace-1",
      actorId: "user-1",
      input: validOfferInput,
    });

    expect(created).toMatchObject({
      workspaceId: "workspace-1",
      createdBy: "user-1",
      ...validOfferInput,
      prohibitedClaims: [],
      version: 1,
    });
    expect(created.id).toEqual(expect.any(String));
    expect(created.createdAt).toBeInstanceOf(Date);
    expect(
      await offerRepository.getById("workspace-1", created.id),
    ).toEqual(created);
    expect(
      await offerRepository.getById("workspace-2", created.id),
    ).toBeNull();
  });

  it("appends created and normalized audit events in order", async () => {
    const auditRepository = createMemoryAuditRepository();
    const service = new OfferService(
      createMemoryOfferRepository(),
      auditRepository,
    );

    const created = await service.createOffer({
      workspaceId: "workspace-1",
      actorId: "user-1",
      input: {
        ...validOfferInput,
        prohibitedClaims: ["Guaranteed revenue growth"],
      },
    });

    const events = await auditRepository.list("workspace-1");

    expect(events.map((event) => event.action)).toEqual([
      "offer.created",
      "offer.normalized",
    ]);
    expect(events.every((event) => event.entityId === created.id)).toBe(true);
    expect(JSON.stringify(events)).not.toContain(validOfferInput.rawText);
    expect(JSON.stringify(events)).not.toContain("Guaranteed revenue growth");
    expect(events[0].metadata).toEqual({
      name: validOfferInput.name,
      ticketBand: validOfferInput.ticketBand,
      version: 1,
    });
    expect(events[1].metadata).toEqual({
      problemCount: 1,
      expectedResultCount: 1,
      version: 1,
    });
  });

  it("keeps persisted offers immutable from input and output mutations", async () => {
    const offerRepository = createMemoryOfferRepository();
    const service = new OfferService(
      offerRepository,
      createMemoryAuditRepository(),
    );
    const mutableInput = structuredClone(validOfferInput);

    const created = await service.createOffer({
      workspaceId: "workspace-1",
      actorId: "user-1",
      input: mutableInput,
    });
    mutableInput.problems.push("Changed input");
    created.expectedResults.push("Changed output");

    const persisted = await offerRepository.getById(
      "workspace-1",
      created.id,
    );

    expect(persisted?.problems).toEqual(["Pipeline stalls"]);
    expect(persisted?.expectedResults).toEqual([
      "Faster qualified pipeline",
    ]);
  });
});

describe("offers schema", () => {
  it("requires the creator to be a member of the offer workspace", () => {
    const config = getTableConfig(offers);
    const creatorMembershipForeignKey = config.foreignKeys.find(
      (foreignKey) => {
        const reference = foreignKey.reference();

        return (
          reference.foreignTable === workspaceMembers &&
          reference.columns.map((column) => column.name).join(",") ===
            "workspace_id,created_by"
        );
      },
    );

    expect(creatorMembershipForeignKey?.reference().foreignColumns).toEqual([
      workspaceMembers.workspaceId,
      workspaceMembers.userId,
    ]);
  });

  it("indexes workspace offers by creation time", () => {
    const config = getTableConfig(offers);
    const listingIndex = config.indexes.find(
      (index) => index.config.name === "offers_workspace_created_at_idx",
    );

    expect(
      listingIndex?.config.columns.map((column) =>
        "name" in column ? column.name : undefined,
      ),
    ).toEqual(["workspace_id", "created_at"]);
  });

  it("constrains ticket bands to supported values", () => {
    expect(offers.ticketBand.enumValues).toEqual([
      "usd_5k_15k",
      "usd_15k_plus",
    ]);
  });
});

const jsonSafeRecord: OfferRecord = {
  id: "offer-1",
  workspaceId: "workspace-1",
  createdBy: "user-1",
  name: "Offer",
  rawText: "A sufficiently descriptive raw offer document.",
  problems: ["Problem"],
  expectedResults: ["Result"],
  ticketBand: "usd_5k_15k",
  allowedPilot: "Pilot",
  prohibitedClaims: ["Guarantee"],
  version: 1,
  createdAt: new Date("2026-06-19T00:00:00.000Z"),
};

void jsonSafeRecord;
