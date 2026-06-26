import { describe, expect, it, vi } from "vitest";

import {
  refreshProspectingSubmission,
  runProspectingSubmission,
} from "@/features/prospecting/prospecting-action-logic";

function dependencies(input?: { campaignExists?: boolean; brave?: boolean }) {
  return {
    workspaceId: "workspace-1",
    campaignRepository: {
      getById: vi.fn().mockResolvedValue(
        input?.campaignExists === false ? null : { id: "campaign-1" },
      ),
    },
    runService: {
      run: vi.fn().mockResolvedValue({ leads: [] }),
      refreshPending: vi.fn().mockResolvedValue({
        checked: 1,
        updated: 1,
        pending: 0,
      }),
    },
    hasBraveSearch: input?.brave !== false,
    hasRefreshProvider: true,
  };
}

describe("prospecting action logic", () => {
  it("rejects a run when Brave is not configured", async () => {
    const deps = dependencies({ brave: false });

    await expect(
      runProspectingSubmission(deps, "campaign-1"),
    ).resolves.toEqual({ status: "error", code: "missing_brave" });
    expect(deps.runService.run).not.toHaveBeenCalled();
  });

  it("scopes a run to the authenticated workspace", async () => {
    const deps = dependencies();

    await expect(
      runProspectingSubmission(deps, "campaign-1"),
    ).resolves.toEqual({ status: "success", code: "run_complete" });
    expect(deps.campaignRepository.getById).toHaveBeenCalledWith(
      "workspace-1",
      "campaign-1",
    );
    expect(deps.runService.run).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      campaignId: "campaign-1",
    });
  });

  it("does not refresh when the campaign does not belong to the workspace", async () => {
    const deps = dependencies({ campaignExists: false });

    await expect(
      refreshProspectingSubmission(deps, "campaign-1"),
    ).resolves.toEqual({ status: "error", code: "campaign_not_found" });
    expect(deps.runService.refreshPending).not.toHaveBeenCalled();
  });
});
