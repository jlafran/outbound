import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { initialActionState } from "@/features/app/action-state";
import {
  createMemoryAppServices,
  type AppServices,
} from "@/features/app/app-services";
import type { InternalActionContext } from "@/features/app/internal-action-context";
import {
  approveNichesSubmission,
  createCampaignSubmission,
  generateDryRunSubmission,
  moveToNicheReviewSubmission,
  recommendNichesSubmission,
} from "@/features/campaigns/campaign-action-logic";
import { createCampaignAction } from "@/features/campaigns/campaign-actions";
import { createOfferSubmission } from "@/features/offers/offer-action-logic";
import { createOfferAction } from "@/features/offers/offer-actions";

const workspaceOne = {
  workspaceId: "workspace-1",
  actorId: "user-1",
} satisfies InternalActionContext;

const workspaceTwo = {
  workspaceId: "workspace-2",
  actorId: "user-2",
} satisfies InternalActionContext;

function resolveContext(context: InternalActionContext) {
  return async () => context;
}

function validOfferForm() {
  const formData = new FormData();
  formData.set("name", "Agente de soporte");
  formData.set(
    "rawText",
    "Automatiza consultas repetitivas y reduce tiempos de respuesta.",
  );
  formData.set("problems", "Consultas repetitivas\nSeguimiento manual");
  formData.set(
    "expectedResults",
    "Menor tiempo de respuesta\nMayor capacidad operativa",
  );
  formData.set("ticketBand", "usd_15k_plus");
  formData.set("allowedPilot", "Piloto pago de cuatro semanas");
  formData.set("prohibitedClaims", "Resultados garantizados");
  return formData;
}

function campaignForm(offerId: string) {
  const formData = new FormData();
  formData.set("offerId", offerId);
  formData.set("name", "Argentina operaciones");
  formData.set("targetDailyEmails", "50");
  formData.set("paidDataMode", "fallback");
  return formData;
}

function campaignMutationForm(campaignId: string, expectedVersion: number) {
  const formData = new FormData();
  formData.set("campaignId", campaignId);
  formData.set("expectedVersion", String(expectedVersion));
  return formData;
}

async function createOffer(
  services: AppServices,
  context = workspaceOne,
) {
  const result = await createOfferSubmission(
    { services, resolveContext: resolveContext(context) },
    validOfferForm(),
  );
  expect(result.status).toBe("success");
  if (result.status !== "success") {
    throw new Error("Expected offer creation to succeed");
  }
  return result.entityId;
}

async function createCampaign(
  services: AppServices,
  offerId: string,
  context = workspaceOne,
) {
  const result = await createCampaignSubmission(
    { services, resolveContext: resolveContext(context) },
    campaignForm(offerId),
  );
  expect(result.status).toBe("success");
  if (result.status !== "success") {
    throw new Error("Expected campaign creation to succeed");
  }
  return result.entityId;
}

async function prepareDiscoveryReady(
  services: AppServices,
  campaignId: string,
) {
  const recommended = await recommendNichesSubmission(
    { services, resolveContext: resolveContext(workspaceOne) },
    campaignMutationForm(campaignId, 1),
  );
  expect(recommended.status).toBe("success");
  if (recommended.status !== "success") {
    throw new Error("Expected recommendations");
  }

  const review = await moveToNicheReviewSubmission(
    { services, resolveContext: resolveContext(workspaceOne) },
    campaignMutationForm(campaignId, recommended.version),
  );
  expect(review.status).toBe("success");
  if (review.status !== "success") {
    throw new Error("Expected niche review");
  }

  const approveForm = campaignMutationForm(campaignId, review.version);
  approveForm.append("nicheIds", "logistica-ar");
  const approved = await approveNichesSubmission(
    { services, resolveContext: resolveContext(workspaceOne) },
    approveForm,
  );
  expect(approved.status).toBe("success");
  if (approved.status !== "success") {
    throw new Error("Expected niche approval");
  }
  return approved;
}

describe("dashboard action submissions", () => {
  let services: AppServices;

  beforeEach(() => {
    services = createMemoryAppServices();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns stable field errors for invalid offer input", async () => {
    const result = await createOfferSubmission(
      {
        services,
        resolveContext: resolveContext(workspaceOne),
      },
      new FormData(),
    );

    expect(result).toEqual({
      status: "error",
      fieldErrors: {
        allowedPilot: ["Ingresá las condiciones del piloto"],
        expectedResults: ["Ingresá al menos un resultado esperado"],
        name: ["Ingresá un nombre"],
        problems: ["Ingresá al menos un problema"],
        rawText: ["Describí la solución con al menos 20 caracteres"],
        ticketBand: ["Seleccioná un ticket objetivo"],
      },
    });
  });

  it("fails closed when internal action context is unavailable", async () => {
    const result = await createOfferSubmission(
      {
        services,
        resolveContext: async () => {
          throw new Error("AUTH_REQUIRED");
        },
      },
      validOfferForm(),
    );

    expect(result).toEqual({
      status: "error",
      globalError: "Necesitás autenticarte para realizar esta acción.",
    });
  });

  it("server action wrappers fail closed before loading production services", async () => {
    vi.stubEnv("OUTREACH_E2E_MODE", "");

    await expect(
      createOfferAction(initialActionState, validOfferForm()),
    ).resolves.toEqual({
      status: "error",
      globalError: "Necesitás autenticarte para realizar esta acción.",
    });
    await expect(
      createCampaignAction(initialActionState, campaignForm("offer-1")),
    ).resolves.toEqual({
      status: "error",
      globalError: "Necesitás autenticarte para realizar esta acción.",
    });
  });

  it("creates an offer and campaign using only resolved context", async () => {
    const offerId = await createOffer(services);
    const campaignId = await createCampaign(services, offerId);

    await expect(
      services.offerRepository.getById(workspaceOne.workspaceId, offerId),
    ).resolves.toMatchObject({
      id: offerId,
      workspaceId: workspaceOne.workspaceId,
      createdBy: workspaceOne.actorId,
      name: "Agente de soporte",
    });
    await expect(
      services.campaignRepository.getById(
        workspaceOne.workspaceId,
        campaignId,
      ),
    ).resolves.toMatchObject({
      id: campaignId,
      offerId,
      workspaceId: workspaceOne.workspaceId,
      createdBy: workspaceOne.actorId,
      state: "draft",
      version: 1,
    });
  });

  it("maps stale campaign updates to a friendly global error", async () => {
    const offerId = await createOffer(services);
    const campaignId = await createCampaign(services, offerId);
    const first = await recommendNichesSubmission(
      { services, resolveContext: resolveContext(workspaceOne) },
      campaignMutationForm(campaignId, 1),
    );
    expect(first.status).toBe("success");

    const stale = await moveToNicheReviewSubmission(
      { services, resolveContext: resolveContext(workspaceOne) },
      campaignMutationForm(campaignId, 1),
    );

    expect(stale).toEqual({
      status: "error",
      globalError:
        "La campaña cambió en otra operación. Actualizá la página e intentá de nuevo.",
    });
  });

  it("rejects niche approval when no niche is selected", async () => {
    const offerId = await createOffer(services);
    const campaignId = await createCampaign(services, offerId);
    const recommended = await recommendNichesSubmission(
      { services, resolveContext: resolveContext(workspaceOne) },
      campaignMutationForm(campaignId, 1),
    );
    expect(recommended.status).toBe("success");
    if (recommended.status !== "success") {
      throw new Error("Expected recommendations");
    }
    const review = await moveToNicheReviewSubmission(
      { services, resolveContext: resolveContext(workspaceOne) },
      campaignMutationForm(campaignId, recommended.version),
    );
    expect(review.status).toBe("success");
    if (review.status !== "success") {
      throw new Error("Expected niche review");
    }

    const result = await approveNichesSubmission(
      { services, resolveContext: resolveContext(workspaceOne) },
      campaignMutationForm(campaignId, review.version),
    );

    expect(result).toEqual({
      status: "error",
      globalError: "Seleccioná al menos un nicho.",
    });
  });

  it("approves niches and immediately makes the campaign discovery ready", async () => {
    const offerId = await createOffer(services);
    const campaignId = await createCampaign(services, offerId);
    const recommended = await recommendNichesSubmission(
      { services, resolveContext: resolveContext(workspaceOne) },
      campaignMutationForm(campaignId, 1),
    );
    expect(recommended.status).toBe("success");
    if (recommended.status !== "success") {
      throw new Error("Expected recommendations");
    }
    const review = await moveToNicheReviewSubmission(
      { services, resolveContext: resolveContext(workspaceOne) },
      campaignMutationForm(campaignId, recommended.version),
    );
    expect(review.status).toBe("success");
    if (review.status !== "success") {
      throw new Error("Expected niche review");
    }

    const approveForm = campaignMutationForm(campaignId, review.version);
    approveForm.append("nicheIds", "logistica-ar");
    const result = await approveNichesSubmission(
      { services, resolveContext: resolveContext(workspaceOne) },
      approveForm,
    );

    expect(result).toEqual({
      status: "success",
      campaignId,
      version: review.version + 2,
    });
    await expect(
      services.campaignRepository.getById(
        workspaceOne.workspaceId,
        campaignId,
      ),
    ).resolves.toMatchObject({
      state: "discovery_ready",
      approvedNicheIds: ["logistica-ar"],
      version: review.version + 2,
    });
  });

  it("retries discovery readiness without approving niches twice", async () => {
    const offerId = await createOffer(services);
    const campaignId = await createCampaign(services, offerId);
    const recommended = await recommendNichesSubmission(
      { services, resolveContext: resolveContext(workspaceOne) },
      campaignMutationForm(campaignId, 1),
    );
    expect(recommended.status).toBe("success");
    if (recommended.status !== "success") {
      throw new Error("Expected recommendations");
    }
    const review = await moveToNicheReviewSubmission(
      { services, resolveContext: resolveContext(workspaceOne) },
      campaignMutationForm(campaignId, recommended.version),
    );
    expect(review.status).toBe("success");
    if (review.status !== "success") {
      throw new Error("Expected niche review");
    }

    const approve = vi.spyOn(
      services.campaignService,
      "approveNiches",
    );
    vi.spyOn(
      services.campaignService,
      "moveToDiscoveryReady",
    ).mockRejectedValueOnce(new Error("TRANSIENT_DISCOVERY_FAILURE"));
    const approveForm = campaignMutationForm(campaignId, review.version);
    approveForm.append("nicheIds", "logistica-ar");

    const failed = await approveNichesSubmission(
      { services, resolveContext: resolveContext(workspaceOne) },
      approveForm,
    );

    expect(failed).toEqual({
      status: "error",
      globalError:
        "Los nichos quedaron aprobados, pero no pudimos preparar discovery. Intentá aprobarlos nuevamente.",
    });
    await expect(
      services.campaignRepository.getById(
        workspaceOne.workspaceId,
        campaignId,
      ),
    ).resolves.toMatchObject({
      state: "niche_review",
      approvedNicheIds: ["logistica-ar"],
      version: review.version + 1,
    });

    const retried = await approveNichesSubmission(
      { services, resolveContext: resolveContext(workspaceOne) },
      approveForm,
    );

    expect(retried).toEqual({
      status: "success",
      campaignId,
      version: review.version + 2,
    });
    expect(approve).toHaveBeenCalledTimes(1);
  });

  it("generates one stable dry-run dataset and dossier", async () => {
    const offerId = await createOffer(services);
    const campaignId = await createCampaign(services, offerId);
    const ready = await prepareDiscoveryReady(services, campaignId);
    const form = campaignMutationForm(campaignId, ready.version);

    const first = await generateDryRunSubmission(
      { services, resolveContext: resolveContext(workspaceOne) },
      form,
    );
    const second = await generateDryRunSubmission(
      { services, resolveContext: resolveContext(workspaceOne) },
      form,
    );

    expect(first.status).toBe("success");
    expect(second).toEqual(first);
    if (first.status !== "success") {
      throw new Error("Expected dry-run generation");
    }
    expect(first.companies).toHaveLength(3);
    expect(first.companies.map(({ score }) => score)).toEqual(
      [...first.companies.map(({ score }) => score)].sort(
        (left, right) => right - left,
      ),
    );
    expect(first.companies[0]?.name).toBe("Logística Pampa");
    expect(first.dossierId).toEqual(expect.any(String));
    await expect(
      services.dossierRepository.getById(
        workspaceOne.workspaceId,
        first.dossierId,
      ),
    ).resolves.toMatchObject({
      id: first.dossierId,
      campaignCompanyId: first.companies[0]?.campaignCompanyId,
      version: 1,
    });
  });

  it("does not allow a campaign to reference another workspace offer", async () => {
    const offerId = await createOffer(services, workspaceOne);

    const result = await createCampaignSubmission(
      {
        services,
        resolveContext: resolveContext(workspaceTwo),
      },
      campaignForm(offerId),
    );

    expect(result).toEqual({
      status: "error",
      globalError: "La oferta no existe en este espacio de trabajo.",
    });
    await expect(
      services.campaignRepository.getById(workspaceTwo.workspaceId, offerId),
    ).resolves.toBeNull();
  });
});
