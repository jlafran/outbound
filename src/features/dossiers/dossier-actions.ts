"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import type { ActionState } from "@/features/app/action-state";
import {
  getAppServices,
  type AppServices,
} from "@/features/app/app-services";
import {
  InternalActionContextError,
  resolveInternalActionContext,
  type InternalActionContext,
} from "@/features/app/internal-action-context";

import { DossierError } from "./dossier-repository";
import type { Dossier, DossierItem } from "./dossier-schema";
import type { DossierPatch } from "./dossier-service";

type DossierMutationSuccess = {
  dossierId: string;
  version: number;
};

type DossierActionDependencies = {
  services: AppServices;
  resolveContext: () => Promise<InternalActionContext>;
};

const categoryValues = [
  "confirmedNeeds",
  "researchedFacts",
  "hypotheses",
  "estimates",
  "competitors",
  "recommendations",
] as const;

type DossierCategory = (typeof categoryValues)[number];

const baseMutationSchema = z.object({
  dossierId: z.string().trim().min(1, "El dossier es obligatorio."),
  expectedVersion: z.coerce
    .number()
    .int("La versión debe ser un número entero.")
    .positive("La versión es obligatoria."),
});

const recommendationSchema = baseMutationSchema.extend({
  statement: z
    .string()
    .trim()
    .min(2, "Ingresá una recomendación de al menos 2 caracteres."),
});

const editItemSchema = baseMutationSchema.extend({
  category: z.enum(categoryValues, {
    error: "Seleccioná una categoría válida.",
  }),
  itemId: z.string().trim().min(1, "El elemento es obligatorio."),
  statement: z
    .string()
    .trim()
    .min(2, "Ingresá una declaración de al menos 2 caracteres."),
  hidden: z.enum(["true", "false", "on"]).transform((value) => value !== "false"),
});

const hideItemSchema = baseMutationSchema.extend({
  itemId: z.string().trim().min(1, "El elemento es obligatorio."),
});

function stringValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function fieldErrors(error: z.ZodError): Record<string, string[]> {
  const errors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    (errors[key] ??= []).push(issue.message);
  }
  return errors;
}

function mutationValues(formData: FormData) {
  return {
    dossierId: stringValue(formData, "dossierId"),
    expectedVersion: stringValue(formData, "expectedVersion"),
  };
}

function mapError(
  error: unknown,
): ActionState<DossierMutationSuccess> {
  if (
    error instanceof InternalActionContextError ||
    (error instanceof Error && error.message === "AUTH_REQUIRED")
  ) {
    return {
      status: "error",
      globalError: "Necesitás autenticarte para realizar esta acción.",
    };
  }
  if (error instanceof DossierError) {
    const messages: Partial<Record<typeof error.code, string>> = {
      DOSSIER_ITEM_NOT_FOUND:
        "El elemento no existe en la categoría indicada.",
      DOSSIER_NOT_FOUND: "El dossier no existe.",
      STALE_DOSSIER_VERSION:
        "El dossier cambió en otra operación. Actualizá la página e intentá de nuevo.",
    };
    return {
      status: "error",
      globalError:
        messages[error.code] ?? "No pudimos actualizar el dossier.",
    };
  }
  return {
    status: "error",
    globalError: "No pudimos actualizar el dossier.",
  };
}

async function withContext(
  dependencies: DossierActionDependencies,
  operation: (
    context: InternalActionContext,
  ) => Promise<ActionState<DossierMutationSuccess>>,
): Promise<ActionState<DossierMutationSuccess>> {
  try {
    return await operation(await dependencies.resolveContext());
  } catch (error) {
    return mapError(error);
  }
}

async function loadDossier(
  dependencies: DossierActionDependencies,
  context: InternalActionContext,
  dossierId: string,
): Promise<Dossier> {
  const dossier = await dependencies.services.dossierRepository.getById(
    context.workspaceId,
    dossierId,
  );
  if (!dossier) {
    throw new DossierError("DOSSIER_NOT_FOUND");
  }
  return dossier;
}

async function loadMutableDossier(
  dependencies: DossierActionDependencies,
  context: InternalActionContext,
  dossierId: string,
  expectedVersion: number,
): Promise<{ loaded: Dossier; latest: Dossier }> {
  const loaded = await loadDossier(dependencies, context, dossierId);
  if (loaded.version !== expectedVersion) {
    throw new DossierError("STALE_DOSSIER_VERSION");
  }
  const latest = await dependencies.services.dossierRepository.getLatest(
    context.workspaceId,
    loaded.campaignCompanyId,
  );
  if (
    !latest ||
    latest.id !== loaded.id ||
    latest.version !== expectedVersion
  ) {
    throw new DossierError("STALE_DOSSIER_VERSION");
  }
  return { loaded, latest };
}

function success(dossier: Dossier): ActionState<DossierMutationSuccess> {
  return {
    status: "success",
    dossierId: dossier.id,
    version: dossier.version,
  };
}

function categoryAllowsKind(
  category: DossierCategory,
  kind: DossierItem["kind"],
): boolean {
  const expectedKinds: Record<DossierCategory, DossierItem["kind"][]> = {
    confirmedNeeds: ["confirmed_by_prospect"],
    researchedFacts: ["researched_fact"],
    hypotheses: ["hypothesis"],
    estimates: ["estimate"],
    competitors: ["researched_fact", "hypothesis"],
    recommendations: ["recommendation"],
  };
  return expectedKinds[category].includes(kind);
}

export async function addRecommendationSubmission(
  dependencies: DossierActionDependencies,
  formData: FormData,
): Promise<ActionState<DossierMutationSuccess>> {
  const parsed = recommendationSchema.safeParse({
    ...mutationValues(formData),
    statement: stringValue(formData, "statement"),
  });
  if (!parsed.success) {
    return { status: "error", fieldErrors: fieldErrors(parsed.error) };
  }
  return withContext(dependencies, async (context) => {
    const { loaded, latest } = await loadMutableDossier(
      dependencies,
      context,
      parsed.data.dossierId,
      parsed.data.expectedVersion,
    );
    const created = await dependencies.services.dossierService.editById({
      workspaceId: context.workspaceId,
      campaignCompanyId: loaded.campaignCompanyId,
      dossierId: loaded.id,
      actorId: context.actorId,
      expectedVersion: parsed.data.expectedVersion,
      expectedLatestId: latest.id,
      patch: {
        recommendations: [
          ...loaded.recommendations,
          {
            id: crypto.randomUUID(),
            kind: "recommendation",
            statement: parsed.data.statement,
            confidence: "medium",
            assumptions: [],
            hidden: false,
          },
        ],
      },
    });
    return success(created);
  });
}

export async function editDossierItemSubmission(
  dependencies: DossierActionDependencies,
  formData: FormData,
): Promise<ActionState<DossierMutationSuccess>> {
  const parsed = editItemSchema.safeParse({
    ...mutationValues(formData),
    category: stringValue(formData, "category"),
    itemId: stringValue(formData, "itemId"),
    statement: stringValue(formData, "statement"),
    hidden: stringValue(formData, "hidden") || "false",
  });
  if (!parsed.success) {
    return { status: "error", fieldErrors: fieldErrors(parsed.error) };
  }
  return withContext(dependencies, async (context) => {
    const { loaded, latest } = await loadMutableDossier(
      dependencies,
      context,
      parsed.data.dossierId,
      parsed.data.expectedVersion,
    );
    const matches = loaded[parsed.data.category].filter(
      (item) => item.id === parsed.data.itemId,
    );
    const item = matches[0];
    if (
      matches.length !== 1 ||
      !item ||
      !categoryAllowsKind(parsed.data.category, item.kind)
    ) {
      throw new DossierError("DOSSIER_ITEM_NOT_FOUND");
    }
    const patch = {
      [parsed.data.category]: loaded[parsed.data.category].map((candidate) =>
        candidate.id === item.id
          ? {
              ...candidate,
              statement: parsed.data.statement,
              hidden: parsed.data.hidden,
            }
          : candidate,
      ),
    };
    const created = await dependencies.services.dossierService.editById({
      workspaceId: context.workspaceId,
      campaignCompanyId: loaded.campaignCompanyId,
      dossierId: loaded.id,
      actorId: context.actorId,
      expectedVersion: parsed.data.expectedVersion,
      expectedLatestId: latest.id,
      patch,
    });
    return success(created);
  });
}

export async function hideDossierItemSubmission(
  dependencies: DossierActionDependencies,
  formData: FormData,
): Promise<ActionState<DossierMutationSuccess>> {
  const parsed = hideItemSchema.safeParse({
    ...mutationValues(formData),
    itemId: stringValue(formData, "itemId"),
  });
  if (!parsed.success) {
    return { status: "error", fieldErrors: fieldErrors(parsed.error) };
  }
  return withContext(dependencies, async (context) => {
    const { loaded, latest } = await loadMutableDossier(
      dependencies,
      context,
      parsed.data.dossierId,
      parsed.data.expectedVersion,
    );
    const items: DossierItem[] = [];
    for (const category of categoryValues) {
      for (const item of loaded[category]) {
        items.push(item);
      }
    }
    const matches = items.filter((item) => item.id === parsed.data.itemId);
    if (matches.length !== 1 || !matches[0]) {
      throw new DossierError("DOSSIER_ITEM_NOT_FOUND");
    }
    if (matches[0].hidden) {
      return {
        status: "error",
        globalError: "El elemento ya está oculto.",
      };
    }
    const patch = Object.fromEntries(
      categoryValues.map((category) => [
        category,
        loaded[category].map((candidate) =>
          candidate.id === parsed.data.itemId
            ? { ...candidate, hidden: true }
            : candidate,
        ),
      ]),
    ) as DossierPatch;
    const created = await dependencies.services.dossierService.editById({
      workspaceId: context.workspaceId,
      campaignCompanyId: loaded.campaignCompanyId,
      dossierId: loaded.id,
      actorId: context.actorId,
      expectedVersion: parsed.data.expectedVersion,
      expectedLatestId: latest.id,
      patch,
      operation: "hide",
    });
    return success(created);
  });
}

async function actionDependencies(): Promise<DossierActionDependencies | null> {
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

async function runAction(
  submission: (
    dependencies: DossierActionDependencies,
    formData: FormData,
  ) => Promise<ActionState<DossierMutationSuccess>>,
  formData: FormData,
): Promise<ActionState<DossierMutationSuccess>> {
  const dependencies = await actionDependencies();
  if (!dependencies) {
    return {
      status: "error",
      globalError: "Necesitás autenticarte para realizar esta acción.",
    };
  }
  const result = await submission(dependencies, formData);
  if (result.status === "success") {
    redirect(`/dossiers/${result.dossierId}`);
  }
  return result;
}

export async function addRecommendationAction(
  _previousState: ActionState<DossierMutationSuccess>,
  formData: FormData,
) {
  return runAction(addRecommendationSubmission, formData);
}

export async function editDossierItemAction(
  _previousState: ActionState<DossierMutationSuccess>,
  formData: FormData,
) {
  return runAction(editDossierItemSubmission, formData);
}

export async function hideDossierItemAction(
  _previousState: ActionState<DossierMutationSuccess>,
  formData: FormData,
) {
  return runAction(hideDossierItemSubmission, formData);
}
