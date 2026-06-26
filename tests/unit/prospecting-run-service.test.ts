import { describe, expect, it, vi } from "vitest";

import { createMemoryProspectingRepository } from "@/features/prospecting/prospecting-repository";
import { ProspectingRunService } from "@/features/prospecting/prospecting-run-service";
import type { DentalAestheticsProspectingResult } from "@/features/prospecting/dental-prospecting-service";

const result: DentalAestheticsProspectingResult = {
  leads: [
    {
      companyName: "Clínica Uno",
      domain: "clinicauno.com.ar",
      websiteUrl: "https://clinicauno.com.ar",
      status: "review",
      score: 75,
      decisionMakers: [],
      contacts: {
        emails: [],
        phones: [],
        whatsapps: [],
        emailCandidates: [
          {
            email: "ana@clinicauno.com.ar",
            source: "pattern",
            verificationStatus: "pending",
            verificationProvider: "no2bounce",
            verificationTrackingId: "track-1",
          },
        ],
      },
      opportunitySignals: [],
      evidence: [],
    },
  ],
  unassociatedDecisionMakers: [],
  rejected: [],
};

describe("ProspectingRunService", () => {
  it("persists a completed snapshot around one prospecting execution", async () => {
    const repository = createMemoryProspectingRepository();
    const runner = { run: vi.fn().mockResolvedValue(result) };
    const service = new ProspectingRunService(repository, runner, undefined, {
      createId: () => "run-1",
      now: () => new Date("2026-06-26T18:00:00.000Z"),
    });

    await service.run({
      workspaceId: "workspace-1",
      campaignId: "campaign-1",
    });

    expect(runner.run).toHaveBeenCalledTimes(1);
    await expect(
      repository.getLatestCompletedRun("workspace-1", "campaign-1"),
    ).resolves.toMatchObject({
      id: "run-1",
      status: "completed",
      resultSnapshot: result,
    });
  });

  it("refreshes pending tracking ids without submitting emails again", async () => {
    const repository = createMemoryProspectingRepository();
    const runner = { run: vi.fn().mockResolvedValue(result) };
    const verifier = {
      verify: vi.fn(),
      refresh: vi.fn().mockResolvedValue({
        status: "valid" as const,
        provider: "no2bounce" as const,
        trackingId: "track-1",
      }),
    };
    let tick = 0;
    const service = new ProspectingRunService(repository, runner, verifier, {
      createId: () => "run-1",
      now: () => new Date(1782496800000 + tick++ * 1000),
    });
    await service.run({
      workspaceId: "workspace-1",
      campaignId: "campaign-1",
    });

    await expect(
      service.refreshPending({
        workspaceId: "workspace-1",
        campaignId: "campaign-1",
      }),
    ).resolves.toEqual({ checked: 1, updated: 1, pending: 0 });
    expect(verifier.refresh).toHaveBeenCalledWith("track-1");
    expect(verifier.verify).not.toHaveBeenCalled();
  });
});
