import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { offers, workspaceMembers } from "@/db/schema";
import { OfferService } from "@/features/offers/offer-service";
import { createMemoryOfferUnitOfWork } from "@/features/offers/offer-unit-of-work";
import { validOfferInput } from "../fixtures/offer";

describe("OfferService", () => {
  it("normalizes and persists an offer for its workspace", async () => {
    const unitOfWork = createMemoryOfferUnitOfWork();
    const service = new OfferService(unitOfWork);

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
      await unitOfWork.offerRepository.getById("workspace-1", created.id),
    ).toEqual(created);
    expect(
      await unitOfWork.offerRepository.getById("workspace-2", created.id),
    ).toBeNull();
  });

  it("appends created and normalized audit events in order", async () => {
    const unitOfWork = createMemoryOfferUnitOfWork();
    const service = new OfferService(unitOfWork);

    const created = await service.createOffer({
      workspaceId: "workspace-1",
      actorId: "user-1",
      input: {
        ...validOfferInput,
        prohibitedClaims: ["Guaranteed revenue growth"],
      },
    });

    const events = await unitOfWork.auditRepository.list("workspace-1");

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
    const unitOfWork = createMemoryOfferUnitOfWork();
    const service = new OfferService(unitOfWork);
    const mutableInput = structuredClone(validOfferInput);

    const created = await service.createOffer({
      workspaceId: "workspace-1",
      actorId: "user-1",
      input: mutableInput,
    });
    mutableInput.problems.push("Changed input");
    created.expectedResults.push("Changed output");

    const persisted = await unitOfWork.offerRepository.getById(
      "workspace-1",
      created.id,
    );

    expect(persisted?.problems).toEqual(["Pipeline stalls"]);
    expect(persisted?.expectedResults).toEqual([
      "Faster qualified pipeline",
    ]);
  });

  it.each([1, 2])(
    "rolls back all persistence when audit append %i fails and retries once",
    async (failedAppend) => {
      let failurePending = true;
      let failedOfferId: string | undefined;
      const unitOfWork = createMemoryOfferUnitOfWork({
        beforeAuditAppend(input, appendNumber) {
          if (failurePending && appendNumber === failedAppend) {
            failurePending = false;
            failedOfferId = input.entityId;
            throw new Error(`audit append ${appendNumber} failed`);
          }
        },
      });
      const service = new OfferService(unitOfWork);
      const createInput = {
        workspaceId: "workspace-1",
        actorId: "user-1",
        input: validOfferInput,
      };

      await expect(service.createOffer(createInput)).rejects.toThrow(
        `audit append ${failedAppend} failed`,
      );

      expect(failedOfferId).toEqual(expect.any(String));
      expect(
        await unitOfWork.offerRepository.getById(
          "workspace-1",
          failedOfferId!,
        ),
      ).toBeNull();
      expect(
        await unitOfWork.auditRepository.list("workspace-1"),
      ).toEqual([]);

      const retried = await service.createOffer(createInput);

      expect(retried.id).not.toBe(failedOfferId);
      expect(
        await unitOfWork.offerRepository.getById(
          "workspace-1",
          retried.id,
        ),
      ).toEqual(retried);
      expect(
        await unitOfWork.auditRepository.list("workspace-1"),
      ).toHaveLength(2);
    },
  );
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
    ).toEqual(["workspace_id", "created_at", "id"]);
  });

  it("constrains ticket bands to supported values", () => {
    expect(offers.ticketBand.enumValues).toEqual([
      "usd_5k_15k",
      "usd_15k_plus",
    ]);
  });

  it("checks normalized version and JSON array fields", () => {
    const checkNames = getTableConfig(offers).checks.map(
      (constraint) => constraint.name,
    );

    expect(checkNames).toEqual(
      expect.arrayContaining([
        "offers_version_1_check",
        "offers_problems_json_array_check",
        "offers_expected_results_json_array_check",
        "offers_prohibited_claims_json_array_check",
      ]),
    );
  });
});
