import { z } from "zod";

import type { ActionState } from "@/features/app/action-state";
import type { AppServices } from "@/features/app/app-services";
import type { InternalActionContext } from "@/features/app/internal-action-context";

type OfferActionDependencies = {
  services: AppServices;
  resolveContext: () => Promise<InternalActionContext>;
};

const requiredLines = (message: string) =>
  z
    .string()
    .transform((value) =>
      value
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean),
    )
    .refine((lines) => lines.length > 0, { message });

const optionalLines = z.string().transform((value) =>
  value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean),
);

const offerFormSchema = z.object({
  name: z.string().trim().min(2, "Ingresá un nombre"),
  rawText: z
    .string()
    .trim()
    .min(20, "Describí la solución con al menos 20 caracteres"),
  problems: requiredLines("Ingresá al menos un problema"),
  expectedResults: requiredLines(
    "Ingresá al menos un resultado esperado",
  ),
  ticketBand: z.enum(["usd_5k_15k", "usd_15k_plus"], {
    error: "Seleccioná un ticket objetivo",
  }),
  allowedPilot: z
    .string()
    .trim()
    .min(2, "Ingresá las condiciones del piloto"),
  prohibitedClaims: optionalLines,
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

function isAuthRequired(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message === "AUTH_REQUIRED" ||
      "code" in error &&
        (error as { code?: unknown }).code === "AUTH_REQUIRED")
  );
}

export async function createOfferSubmission(
  dependencies: OfferActionDependencies,
  formData: FormData,
): Promise<ActionState<{ entityId: string }>> {
  let context: InternalActionContext;
  try {
    context = await dependencies.resolveContext();
  } catch (error) {
    if (isAuthRequired(error)) {
      return {
        status: "error",
        globalError: "Necesitás autenticarte para realizar esta acción.",
      };
    }
    return {
      status: "error",
      globalError: "No pudimos validar tu acceso.",
    };
  }

  const parsed = offerFormSchema.safeParse({
    name: stringValue(formData, "name"),
    rawText: stringValue(formData, "rawText"),
    problems: stringValue(formData, "problems"),
    expectedResults: stringValue(formData, "expectedResults"),
    ticketBand: stringValue(formData, "ticketBand"),
    allowedPilot: stringValue(formData, "allowedPilot"),
    prohibitedClaims: stringValue(formData, "prohibitedClaims"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      fieldErrors: fieldErrors(parsed.error),
    };
  }

  try {
    const created = await dependencies.services.offerService.createOffer({
      workspaceId: context.workspaceId,
      actorId: context.actorId,
      input: parsed.data,
    });
    return { status: "success", entityId: created.id };
  } catch {
    return {
      status: "error",
      globalError: "No pudimos guardar la oferta.",
    };
  }
}
