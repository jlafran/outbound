import { z } from "zod";

import type { ActionState } from "@/features/app/action-state";
import type { AppServices } from "@/features/app/app-services";
import type { InternalActionContext } from "@/features/app/internal-action-context";

import { CampaignError } from "./campaign-schema";

type CampaignActionDependencies = {
  services: AppServices;
  resolveContext: () => Promise<InternalActionContext>;
};

type CampaignMutationSuccess = {
  campaignId: string;
  version: number;
};

type DryRunCompanySummary = {
  campaignCompanyId: string;
  name: string;
  domain: string;
  score: number;
};

type DryRunSuccess = CampaignMutationSuccess & {
  companies: DryRunCompanySummary[];
  dossierId: string;
};

const campaignFormSchema = z.object({
  offerId: z.string().trim().min(1, "La oferta es obligatoria"),
  name: z.string().trim().min(2, "Ingresá un nombre de campaña"),
  targetDailyEmails: z.coerce
    .number()
    .int("Ingresá un número entero")
    .min(1, "El mínimo es 1")
    .max(200, "El máximo es 200"),
  paidDataMode: z.enum(["free", "paid", "fallback"], {
    error: "Seleccioná un modo de datos",
  }),
});

const campaignMutationSchema = z.object({
  campaignId: z.string().trim().min(1),
  expectedVersion: z.coerce.number().int().positive(),
});

function stringValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function zodFieldErrors(error: z.ZodError) {
  const errors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    (errors[key] ??= []).push(issue.message);
  }
  return errors;
}

function mapError(error: unknown): ActionState {
  if (
    error instanceof Error &&
    (error.message === "AUTH_REQUIRED" ||
      ("code" in error &&
        (error as { code?: unknown }).code === "AUTH_REQUIRED"))
  ) {
    return {
      status: "error",
      globalError: "Necesitás autenticarte para realizar esta acción.",
    };
  }
  if (error instanceof CampaignError) {
    const messages: Partial<Record<typeof error.code, string>> = {
      APPROVED_NICHE_REQUIRED: "Seleccioná al menos un nicho.",
      CAMPAIGN_NOT_FOUND: "La campaña no existe.",
      INVALID_CAMPAIGN_TRANSITION:
        "La campaña no está lista para esta operación.",
      NICHE_RECOMMENDATIONS_REQUIRED:
        "Primero generá recomendaciones de nichos.",
      OFFER_REQUIRED:
        "La oferta no existe en este espacio de trabajo.",
      STALE_CAMPAIGN_UPDATE:
        "La campaña cambió en otra operación. Actualizá la página e intentá de nuevo.",
    };
    return {
      status: "error",
      globalError:
        messages[error.code] ?? "No pudimos actualizar la campaña.",
    };
  }
  return {
    status: "error",
    globalError: "No pudimos completar la operación.",
  };
}

async function withContext<T extends object>(
  dependencies: CampaignActionDependencies,
  operation: (
    context: InternalActionContext,
  ) => Promise<ActionState<T>>,
): Promise<ActionState<T>> {
  try {
    return await operation(await dependencies.resolveContext());
  } catch (error) {
    return mapError(error) as ActionState<T>;
  }
}

function parseMutation(formData: FormData) {
  return campaignMutationSchema.safeParse({
    campaignId: stringValue(formData, "campaignId"),
    expectedVersion: stringValue(formData, "expectedVersion"),
  });
}

function normalizeSubmittedIds(formData: FormData): string[] {
  const ids = formData
    .getAll("nicheIds")
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim());
  if (ids.length === 0 || ids.some((id) => id.length === 0)) {
    throw new CampaignError("APPROVED_NICHE_REQUIRED");
  }
  return [...new Set(ids)];
}

export async function createCampaignSubmission(
  dependencies: CampaignActionDependencies,
  formData: FormData,
): Promise<ActionState<{ entityId: string }>> {
  return withContext<{ entityId: string }>(
    dependencies,
    async (context) => {
    const parsed = campaignFormSchema.safeParse({
      offerId: stringValue(formData, "offerId"),
      name: stringValue(formData, "name"),
      targetDailyEmails: stringValue(formData, "targetDailyEmails"),
      paidDataMode: stringValue(formData, "paidDataMode"),
    });
    if (!parsed.success) {
      return {
        status: "error",
        fieldErrors: zodFieldErrors(parsed.error),
      };
    }

    const created = await dependencies.services.campaignService.create({
      workspaceId: context.workspaceId,
      actorId: context.actorId,
      ...parsed.data,
    });
    return { status: "success", entityId: created.id };
    },
  );
}

export async function recommendNichesSubmission(
  dependencies: CampaignActionDependencies,
  formData: FormData,
): Promise<ActionState<CampaignMutationSuccess>> {
  return withContext<CampaignMutationSuccess>(
    dependencies,
    async (context) => {
    const parsed = parseMutation(formData);
    if (!parsed.success) {
      return {
        status: "error",
        fieldErrors: zodFieldErrors(parsed.error),
      };
    }
    const current =
      await dependencies.services.campaignRepository.getById(
        context.workspaceId,
        parsed.data.campaignId,
      );
    if (!current) {
      throw new CampaignError("CAMPAIGN_NOT_FOUND");
    }
    if (
      current.state === "draft" &&
      current.nicheRecommendationIds.length > 0
    ) {
      const projected =
        await dependencies.services.nicheRecommendationProjection.get(
          context.workspaceId,
          parsed.data.campaignId,
        );
      if (projected.length === 0) {
        if (
          parsed.data.expectedVersion !== current.version &&
          parsed.data.expectedVersion !== current.version - 1
        ) {
          throw new CampaignError("STALE_CAMPAIGN_UPDATE");
        }
        const recommendations =
          await dependencies.services.campaignService.recoverNicheRecommendations(
            context.workspaceId,
            parsed.data.campaignId,
          );
        try {
          await dependencies.services.nicheRecommendationProjection.save(
            context.workspaceId,
            parsed.data.campaignId,
            recommendations,
          );
        } catch {
          return {
            status: "error",
            globalError:
              "Las recomendaciones quedaron guardadas, pero no pudimos mostrarlas. Intentá recomendarlas nuevamente.",
          };
        }
        return {
          status: "success",
          campaignId: current.id,
          version: current.version,
        };
      }
    }
    const result =
      await dependencies.services.campaignService.recommendNiches(
        context.workspaceId,
        parsed.data.campaignId,
        context.actorId,
        parsed.data.expectedVersion,
      );
    try {
      await dependencies.services.nicheRecommendationProjection.save(
        context.workspaceId,
        parsed.data.campaignId,
        result.recommendations,
      );
    } catch {
      return {
        status: "error",
        globalError:
          "Las recomendaciones quedaron guardadas, pero no pudimos mostrarlas. Intentá recomendarlas nuevamente.",
      };
    }
    return {
      status: "success",
      campaignId: result.campaign.id,
      version: result.campaign.version,
    };
    },
  );
}

export async function moveToNicheReviewSubmission(
  dependencies: CampaignActionDependencies,
  formData: FormData,
): Promise<ActionState<CampaignMutationSuccess>> {
  return withContext<CampaignMutationSuccess>(
    dependencies,
    async (context) => {
    const parsed = parseMutation(formData);
    if (!parsed.success) {
      return {
        status: "error",
        fieldErrors: zodFieldErrors(parsed.error),
      };
    }
    const campaign =
      await dependencies.services.campaignService.moveToNicheReview(
        context.workspaceId,
        parsed.data.campaignId,
        parsed.data.expectedVersion,
      );
    return {
      status: "success",
      campaignId: campaign.id,
      version: campaign.version,
    };
    },
  );
}

export async function approveNichesSubmission(
  dependencies: CampaignActionDependencies,
  formData: FormData,
): Promise<ActionState<CampaignMutationSuccess>> {
  return withContext<CampaignMutationSuccess>(
    dependencies,
    async (context) => {
    const parsed = parseMutation(formData);
    if (!parsed.success) {
      return {
        status: "error",
        fieldErrors: zodFieldErrors(parsed.error),
      };
    }
    const ids = normalizeSubmittedIds(formData);
    const current =
      await dependencies.services.campaignRepository.getById(
        context.workspaceId,
        parsed.data.campaignId,
      );
    if (!current) {
      throw new CampaignError("CAMPAIGN_NOT_FOUND");
    }
    let approved = current;
    if (
      current.state === "niche_review" &&
      current.approvedNicheIds.length > 0
    ) {
      if (
        parsed.data.expectedVersion !== current.version &&
        parsed.data.expectedVersion !== current.version - 1
      ) {
        throw new CampaignError("STALE_CAMPAIGN_UPDATE");
      }
      if (
        ids.length !== current.approvedNicheIds.length ||
        ids.some((id, index) => id !== current.approvedNicheIds[index])
      ) {
        return {
          status: "error",
          globalError:
            "La selección enviada no coincide con los nichos ya aprobados.",
        };
      }
    } else {
      approved =
        await dependencies.services.campaignService.approveNiches(
            context.workspaceId,
            parsed.data.campaignId,
            ids,
            parsed.data.expectedVersion,
            context.actorId,
          );
    }
    let campaign;
    try {
      campaign =
        await dependencies.services.campaignService.moveToDiscoveryReady(
          context.workspaceId,
          parsed.data.campaignId,
          approved.version,
        );
    } catch {
      return {
        status: "error",
        globalError:
          "Los nichos quedaron aprobados, pero no pudimos preparar discovery. Intentá aprobarlos nuevamente.",
      };
    }
    return {
      status: "success",
      campaignId: campaign.id,
      version: campaign.version,
    };
    },
  );
}

export async function generateDryRunSubmission(
  dependencies: CampaignActionDependencies,
  formData: FormData,
): Promise<ActionState<DryRunSuccess>> {
  return withContext<DryRunSuccess>(dependencies, async (context) => {
    const parsed = parseMutation(formData);
    if (!parsed.success) {
      return {
        status: "error",
        fieldErrors: zodFieldErrors(parsed.error),
      };
    }
    const generated =
      await dependencies.services.campaignDryRunService.generate({
        workspaceId: context.workspaceId,
        actorId: context.actorId,
        campaignId: parsed.data.campaignId,
        expectedVersion: parsed.data.expectedVersion,
      });
    return {
      status: "success",
      campaignId: generated.campaignId,
      version: parsed.data.expectedVersion,
      companies: generated.companies.map((company) => ({
        campaignCompanyId: company.campaignCompanyId,
        name: company.name,
        domain: company.domain,
        score: company.score.total,
      })),
      dossierId: generated.dossierId,
    };
  });
}
