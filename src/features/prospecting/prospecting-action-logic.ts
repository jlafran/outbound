import type { CampaignRepository } from "@/features/campaigns/campaign-repository";

import type { ProspectingRunService } from "./prospecting-run-service";

type ProspectingActionDependencies = {
  workspaceId: string;
  campaignRepository: Pick<CampaignRepository, "getById">;
  runService: Pick<ProspectingRunService, "run" | "refreshPending">;
  hasBraveSearch: boolean;
  hasRefreshProvider: boolean;
};

export type ProspectingActionResult =
  | { status: "success"; code: "run_complete" | "refresh_complete" }
  | {
      status: "error";
      code:
        | "campaign_not_found"
        | "missing_brave"
        | "missing_verifier"
        | "operation_failed";
    };

async function campaignExists(
  dependencies: ProspectingActionDependencies,
  campaignId: string,
): Promise<boolean> {
  return Boolean(
    await dependencies.campaignRepository.getById(
      dependencies.workspaceId,
      campaignId,
    ),
  );
}

export async function runProspectingSubmission(
  dependencies: ProspectingActionDependencies,
  campaignId: string,
): Promise<ProspectingActionResult> {
  if (!dependencies.hasBraveSearch) {
    return { status: "error", code: "missing_brave" };
  }
  if (!(await campaignExists(dependencies, campaignId))) {
    return { status: "error", code: "campaign_not_found" };
  }
  try {
    await dependencies.runService.run({
      workspaceId: dependencies.workspaceId,
      campaignId,
    });
    return { status: "success", code: "run_complete" };
  } catch {
    return { status: "error", code: "operation_failed" };
  }
}

export async function refreshProspectingSubmission(
  dependencies: ProspectingActionDependencies,
  campaignId: string,
): Promise<ProspectingActionResult> {
  if (!(await campaignExists(dependencies, campaignId))) {
    return { status: "error", code: "campaign_not_found" };
  }
  if (!dependencies.hasRefreshProvider) {
    return { status: "error", code: "missing_verifier" };
  }
  try {
    await dependencies.runService.refreshPending({
      workspaceId: dependencies.workspaceId,
      campaignId,
    });
    return { status: "success", code: "refresh_complete" };
  } catch {
    return { status: "error", code: "operation_failed" };
  }
}
