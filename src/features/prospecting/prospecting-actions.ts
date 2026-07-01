"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getAppServices } from "@/features/app/app-services";
import { resolveInternalActionContext } from "@/features/app/internal-action-context";
import { BraveSearchClient } from "@/features/research/brave-search-client";

import {
  refreshProspectingSubmission,
  runProspectingSubmission,
} from "./prospecting-action-logic";
import { DentalAestheticsProspectingService } from "./dental-prospecting-service";
import { ReacherEmailVerifier } from "./email-verifier";
import { ProspectingRunService } from "./prospecting-run-service";
import { OfficialWebsiteCrawler } from "./official-website-crawler";

function configuredVerifier(): ReacherEmailVerifier | undefined {
  const endpoint = process.env.REACHER_ENDPOINT?.trim();
  if (!endpoint) return undefined;
  const requestBodyMode = process.env.REACHER_REQUEST_BODY_MODE;
  return new ReacherEmailVerifier({
    endpoint,
    path: process.env.REACHER_CHECK_PATH,
    apiToken: process.env.REACHER_API_TOKEN,
    authHeaderName: process.env.REACHER_AUTH_HEADER_NAME,
    authHeaderPrefix: process.env.REACHER_AUTH_HEADER_PREFIX,
    requestBodyMode:
      requestBodyMode === "no2bounceSingle"
        ? "no2bounceSingle"
        : requestBodyMode === "emailList"
          ? "emailList"
          : undefined,
  });
}

function campaignIdFrom(formData: FormData): string {
  return String(formData.get("campaignId") ?? "").trim();
}

function resultUrl(
  campaignId: string,
  result: Awaited<ReturnType<typeof runProspectingSubmission>>,
): string {
  const key = result.status === "success" ? "status" : "error";
  return `/campaigns/${campaignId}/prospecting-test?${key}=${result.code}`;
}

export async function runProspectingAction(formData: FormData): Promise<void> {
  const campaignId = campaignIdFrom(formData);
  const [context, services] = await Promise.all([
    resolveInternalActionContext(),
    getAppServices(),
  ]);
  const apiKey = process.env.BRAVE_SEARCH_API_KEY?.trim();
  const verifier = configuredVerifier();
  const runner = new DentalAestheticsProspectingService({
    searchClient: new BraveSearchClient({ apiKey: apiKey ?? "" }),
    emailVerifier: verifier,
    websiteCrawler: new OfficialWebsiteCrawler(),
    maxCompanies: 12,
  });
  const runService = new ProspectingRunService(
    services.prospectingRepository,
    runner,
    verifier,
  );
  const result = await runProspectingSubmission(
    {
      workspaceId: context.workspaceId,
      campaignRepository: services.campaignRepository,
      runService,
      hasBraveSearch: Boolean(apiKey),
      hasRefreshProvider: Boolean(verifier?.refresh),
    },
    campaignId,
  );
  revalidatePath(`/campaigns/${campaignId}/prospecting-test`);
  redirect(resultUrl(campaignId, result));
}

export async function refreshProspectingAction(
  formData: FormData,
): Promise<void> {
  const campaignId = campaignIdFrom(formData);
  const [context, services] = await Promise.all([
    resolveInternalActionContext(),
    getAppServices(),
  ]);
  const verifier = configuredVerifier();
  const runService = new ProspectingRunService(
    services.prospectingRepository,
    { run: async () => Promise.reject(new Error("RUNNER_NOT_AVAILABLE")) },
    verifier,
  );
  const result = await refreshProspectingSubmission(
    {
      workspaceId: context.workspaceId,
      campaignRepository: services.campaignRepository,
      runService,
      hasBraveSearch: Boolean(process.env.BRAVE_SEARCH_API_KEY?.trim()),
      hasRefreshProvider: Boolean(verifier?.refresh),
    },
    campaignId,
  );
  revalidatePath(`/campaigns/${campaignId}/prospecting-test`);
  redirect(resultUrl(campaignId, result));
}
