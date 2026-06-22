import { describe, expect, it, vi } from "vitest";

import { createProductionProjections } from "@/features/app/app-services";

describe("production app service composition", () => {
  it("fails closed for every unconfigured dashboard projection operation", async () => {
    const {
      nicheRecommendationProjection,
      campaignDryRunProjection,
    } = createProductionProjections();
    const createDryRun = vi.fn();

    for (const operation of [
      () => nicheRecommendationProjection.get("workspace-1", "campaign-1"),
      () =>
        nicheRecommendationProjection.save(
          "workspace-1",
          "campaign-1",
          [],
        ),
    ]) {
      await expect(operation()).rejects.toThrow(
        "NICHE_PROJECTION_NOT_CONFIGURED",
      );
    }

    for (const operation of [
      () => campaignDryRunProjection.get("workspace-1", "campaign-1"),
      () =>
        campaignDryRunProjection.getOrCreate(
          "workspace-1",
          "campaign-1",
          createDryRun,
        ),
      () =>
        campaignDryRunProjection.getCompany(
          "workspace-1",
          "campaign-company-1",
        ),
      () => campaignDryRunProjection.stageCompanies("workspace-1", []),
    ]) {
      await expect(operation()).rejects.toThrow(
        "DRY_RUN_PROJECTION_NOT_CONFIGURED",
      );
    }

    expect(createDryRun).not.toHaveBeenCalled();
  });
});
