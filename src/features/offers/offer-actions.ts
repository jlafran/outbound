"use server";

import { redirect } from "next/navigation";

import type { ActionState } from "@/features/app/action-state";
import { getAppServices } from "@/features/app/app-services";
import {
  InternalActionContextError,
  resolveInternalActionContext,
} from "@/features/app/internal-action-context";

import { createOfferSubmission } from "./offer-action-logic";

export async function createOfferAction(
  _previousState: ActionState<{ entityId: string }>,
  formData: FormData,
): Promise<ActionState<{ entityId: string }>> {
  let context;
  try {
    context = await resolveInternalActionContext();
  } catch (error) {
    if (!(error instanceof InternalActionContextError)) {
      throw error;
    }
    return {
      status: "error",
      globalError: "Necesitás autenticarte para realizar esta acción.",
    };
  }
  const result = await createOfferSubmission(
    {
      services: await getAppServices(),
      resolveContext: async () => context,
    },
    formData,
  );

  if (result.status === "success") {
    redirect(`/offers/${result.entityId}`);
  }
  return result;
}
