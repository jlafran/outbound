"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { ActionState } from "@/features/app/action-state";
import { getAppServices } from "@/features/app/app-services";
import {
  InternalActionContextError,
  resolveInternalActionContext,
} from "@/features/app/internal-action-context";

import {
  approveNichesSubmission,
  createCampaignSubmission,
  generateDryRunSubmission,
  moveToNicheReviewSubmission,
  recommendNichesSubmission,
} from "./campaign-action-logic";

type CampaignMutationState = ActionState<{
  campaignId: string;
  version: number;
}>;

async function dependencies() {
  try {
    const context = await resolveInternalActionContext();
    return {
      services: await getAppServices(),
      resolveContext: async () => context,
    };
  } catch (error) {
    if (error instanceof InternalActionContextError) {
      return null;
    }
    throw error;
  }
}

function authRequiredState() {
  return {
    status: "error" as const,
    globalError: "Necesitás autenticarte para realizar esta acción.",
  };
}

export async function createCampaignAction(
  _previousState: ActionState<{ entityId: string }>,
  formData: FormData,
): Promise<ActionState<{ entityId: string }>> {
  const resolved = await dependencies();
  if (!resolved) return authRequiredState();
  const result = await createCampaignSubmission(resolved, formData);
  if (result.status === "success") {
    redirect(`/campaigns/${result.entityId}`);
  }
  return result;
}

export async function recommendNichesAction(
  _previousState: CampaignMutationState,
  formData: FormData,
): Promise<CampaignMutationState> {
  const resolved = await dependencies();
  if (!resolved) return authRequiredState();
  const result = await recommendNichesSubmission(resolved, formData);
  if (result.status === "success") {
    revalidatePath(`/campaigns/${result.campaignId}`);
    redirect(`/campaigns/${result.campaignId}`);
  }
  return result;
}

export async function moveToNicheReviewAction(
  _previousState: CampaignMutationState,
  formData: FormData,
): Promise<CampaignMutationState> {
  const resolved = await dependencies();
  if (!resolved) return authRequiredState();
  const result = await moveToNicheReviewSubmission(resolved, formData);
  if (result.status === "success") {
    revalidatePath(`/campaigns/${result.campaignId}`);
    redirect(`/campaigns/${result.campaignId}`);
  }
  return result;
}

export async function approveNichesAction(
  _previousState: CampaignMutationState,
  formData: FormData,
): Promise<CampaignMutationState> {
  const resolved = await dependencies();
  if (!resolved) return authRequiredState();
  const result = await approveNichesSubmission(resolved, formData);
  if (result.status === "success") {
    revalidatePath(`/campaigns/${result.campaignId}`);
    redirect(`/campaigns/${result.campaignId}`);
  }
  return result;
}

export async function generateDryRunAction(
  _previousState: ActionState<{
    campaignId: string;
    version: number;
    companies: {
      campaignCompanyId: string;
      name: string;
      domain: string;
      score: number;
    }[];
    dossierId: string;
  }>,
  formData: FormData,
) {
  const resolved = await dependencies();
  if (!resolved) return authRequiredState();
  const result = await generateDryRunSubmission(resolved, formData);
  if (result.status === "success") {
    revalidatePath(`/campaigns/${result.campaignId}`);
    redirect(`/campaigns/${result.campaignId}`);
  }
  return result;
}
