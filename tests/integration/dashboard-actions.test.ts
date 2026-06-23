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
import {
  addRecommendationSubmission,
  editDossierItemSubmission,
  hideDossierItemSubmission,
} from "@/features/dossiers/dossier-actions";
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
  formData.set("targetTicketBand", "usd_5k_15k");
  return formData;
}

function campaignMutationForm(campaignId: string, expectedVersion: number) {
  const formData = new FormData();
  formData.set("campaignId", campaignId);
  formData.set("expectedVersion", String(expectedVersion));
  return formData;
}

function dossierMutationForm(dossierId: string, expectedVersion: number) {
  const formData = new FormData();
  formData.set("dossierId", dossierId);
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

async function generateDossier(services: AppServices) {
  const offerId = await createOffer(services);
  const campaignId = await createCampaign(services, offerId);
  const ready = await prepareDiscoveryReady(services, campaignId);
  const generated = await generateDryRunSubmission(
    { services, resolveContext: resolveContext(workspaceOne) },
    campaignMutationForm(campaignId, ready.version),
  );
  expect(generated.status).toBe("success");
  if (generated.status !== "success") {
    throw new Error("Expected dossier generation");
  }
  const dossier = await services.dossierRepository.getById(
    workspaceOne.workspaceId,
    generated.dossierId,
  );
  if (!dossier) {
    throw new Error("Expected dossier");
  }
  return dossier;
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
      targetTicketBand: "usd_5k_15k",
      version: 1,
    });
  });

  it.each([
    ["missing", null],
    ["invalid", "usd_50k_plus"],
  ])("rejects %s campaign target ticket input", async (_label, value) => {
    const offerId = await createOffer(services);
    const formData = campaignForm(offerId);
    if (value === null) {
      formData.delete("targetTicketBand");
    } else {
      formData.set("targetTicketBand", value);
    }

    const result = await createCampaignSubmission(
      {
        services,
        resolveContext: resolveContext(workspaceOne),
      },
      formData,
    );

    expect(result).toEqual({
      status: "error",
      fieldErrors: {
        targetTicketBand: ["Seleccioná un ticket objetivo"],
      },
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

  it("recovers a failed recommendation projection save without duplicate mutation or audit", async () => {
    const offerId = await createOffer(services);
    const campaignId = await createCampaign(services, offerId);
    const save = vi.spyOn(
      services.nicheRecommendationProjection,
      "save",
    );
    save.mockRejectedValueOnce(new Error("PROJECTION_SAVE_FAILED"));
    const recommend = vi.spyOn(
      services.campaignService,
      "recommendNiches",
    );
    const form = campaignMutationForm(campaignId, 1);

    const failed = await recommendNichesSubmission(
      { services, resolveContext: resolveContext(workspaceOne) },
      form,
    );

    expect(failed).toEqual({
      status: "error",
      globalError:
        "Las recomendaciones quedaron guardadas, pero no pudimos mostrarlas. Intentá recomendarlas nuevamente.",
    });
    await expect(
      services.campaignRepository.getById(
        workspaceOne.workspaceId,
        campaignId,
      ),
    ).resolves.toMatchObject({
      state: "draft",
      version: 2,
      nicheRecommendationIds: [
        "logistica-ar",
        "software-b2b-ar",
        "salud-privada-ar",
      ],
    });

    const retried = await recommendNichesSubmission(
      { services, resolveContext: resolveContext(workspaceOne) },
      form,
    );

    expect(retried).toEqual({
      status: "success",
      campaignId,
      version: 2,
    });
    expect(recommend).toHaveBeenCalledTimes(1);
    await expect(
      services.nicheRecommendationProjection.get(
        workspaceOne.workspaceId,
        campaignId,
      ),
    ).resolves.toHaveLength(3);
  });

  it("allows recommendation projection recovery from the current display version only", async () => {
    const offerId = await createOffer(services);
    const campaignId = await createCampaign(services, offerId);
    vi.spyOn(
      services.nicheRecommendationProjection,
      "save",
    ).mockRejectedValueOnce(new Error("PROJECTION_SAVE_FAILED"));
    await recommendNichesSubmission(
      { services, resolveContext: resolveContext(workspaceOne) },
      campaignMutationForm(campaignId, 1),
    );

    const recovered = await recommendNichesSubmission(
      { services, resolveContext: resolveContext(workspaceOne) },
      campaignMutationForm(campaignId, 2),
    );
    const campaign = await services.campaignRepository.getById(
      workspaceOne.workspaceId,
      campaignId,
    );
    if (!campaign) {
      throw new Error("Expected campaign");
    }
    await services.campaignRepository.update(
      {
        ...campaign,
        version: campaign.version + 1,
        updatedAt: new Date(),
      },
      campaign.version,
    );
    vi.spyOn(
      services.nicheRecommendationProjection,
      "get",
    ).mockResolvedValueOnce([]);
    const stale = await recommendNichesSubmission(
      { services, resolveContext: resolveContext(workspaceOne) },
      campaignMutationForm(campaignId, 1),
    );

    expect(recovered).toEqual({
      status: "success",
      campaignId,
      version: 2,
    });
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

  it("rejects approval recovery when the submitted selection changed", async () => {
    const offerId = await createOffer(services);
    const campaignId = await createCampaign(services, offerId);
    const recommended = await recommendNichesSubmission(
      { services, resolveContext: resolveContext(workspaceOne) },
      campaignMutationForm(campaignId, 1),
    );
    if (recommended.status !== "success") {
      throw new Error("Expected recommendations");
    }
    const review = await moveToNicheReviewSubmission(
      { services, resolveContext: resolveContext(workspaceOne) },
      campaignMutationForm(campaignId, recommended.version),
    );
    if (review.status !== "success") {
      throw new Error("Expected niche review");
    }
    vi.spyOn(
      services.campaignService,
      "moveToDiscoveryReady",
    ).mockRejectedValueOnce(new Error("TRANSIENT_DISCOVERY_FAILURE"));
    const original = campaignMutationForm(campaignId, review.version);
    original.append("nicheIds", "logistica-ar");
    await approveNichesSubmission(
      { services, resolveContext: resolveContext(workspaceOne) },
      original,
    );
    const changed = campaignMutationForm(campaignId, review.version);
    changed.append("nicheIds", "software-b2b-ar");

    const result = await approveNichesSubmission(
      { services, resolveContext: resolveContext(workspaceOne) },
      changed,
    );

    expect(result).toEqual({
      status: "error",
      globalError:
        "La selección enviada no coincide con los nichos ya aprobados.",
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
  });

  it("rejects approval recovery from an unrelated older version", async () => {
    const offerId = await createOffer(services);
    const campaignId = await createCampaign(services, offerId);
    const recommended = await recommendNichesSubmission(
      { services, resolveContext: resolveContext(workspaceOne) },
      campaignMutationForm(campaignId, 1),
    );
    if (recommended.status !== "success") {
      throw new Error("Expected recommendations");
    }
    const review = await moveToNicheReviewSubmission(
      { services, resolveContext: resolveContext(workspaceOne) },
      campaignMutationForm(campaignId, recommended.version),
    );
    if (review.status !== "success") {
      throw new Error("Expected niche review");
    }
    vi.spyOn(
      services.campaignService,
      "moveToDiscoveryReady",
    ).mockRejectedValueOnce(new Error("TRANSIENT_DISCOVERY_FAILURE"));
    const original = campaignMutationForm(campaignId, review.version);
    original.append("nicheIds", "logistica-ar");
    await approveNichesSubmission(
      { services, resolveContext: resolveContext(workspaceOne) },
      original,
    );
    const replay = campaignMutationForm(campaignId, review.version - 1);
    replay.append("nicheIds", "logistica-ar");

    const result = await approveNichesSubmission(
      { services, resolveContext: resolveContext(workspaceOne) },
      replay,
    );

    expect(result).toEqual({
      status: "error",
      globalError:
        "La campaña cambió en otra operación. Actualizá la página e intentá de nuevo.",
    });
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
    const scoreEvents = (
      await services.auditRepository.list(workspaceOne.workspaceId)
    ).filter((event) => event.action === "company.scored");
    const transitionEvents = (
      await services.auditRepository.list(workspaceOne.workspaceId)
    ).filter((event) => event.action === "campaign.transitioned");
    expect(transitionEvents.map((event) => event.metadata)).toEqual([
      expect.objectContaining({ from: "draft", to: "niche_review" }),
      expect.objectContaining({
        from: "niche_review",
        to: "discovery_ready",
      }),
    ]);
    expect(scoreEvents).toHaveLength(3);
    expect(scoreEvents.map((event) => event.entityId)).toEqual(
      first.companies.map((company) => company.campaignCompanyId),
    );
  });

  it("adds a recommendation as a new immutable dossier version", async () => {
    const dossier = await generateDossier(services);
    const form = dossierMutationForm(dossier.id, dossier.version);
    form.set(
      "statement",
      "Priorizar automatización del triage de consultas.",
    );

    const result = await addRecommendationSubmission(
      { services, resolveContext: resolveContext(workspaceOne) },
      form,
    );

    expect(result).toMatchObject({
      status: "success",
      version: 2,
    });
    if (result.status !== "success") {
      throw new Error("Expected recommendation edit");
    }
    expect(result.dossierId).not.toBe(dossier.id);
    await expect(
      services.dossierRepository.getById(
        workspaceOne.workspaceId,
        dossier.id,
      ),
    ).resolves.toEqual(dossier);
    const created = await services.dossierRepository.getById(
      workspaceOne.workspaceId,
      result.dossierId,
    );
    expect(created).toMatchObject({
      previousVersionId: dossier.id,
      recommendations: expect.arrayContaining([
        {
          statement: "Priorizar automatización del triage de consultas.",
          kind: "recommendation",
          confidence: "medium",
          assumptions: [],
          hidden: false,
          id: expect.any(String),
        },
      ]),
    });
    expect(created?.recommendations).toHaveLength(
      dossier.recommendations.length + 1,
    );
  });

  it("returns a field error for a short recommendation", async () => {
    const dossier = await generateDossier(services);
    const form = dossierMutationForm(dossier.id, dossier.version);
    form.set("statement", "x");

    const result = await addRecommendationSubmission(
      { services, resolveContext: resolveContext(workspaceOne) },
      form,
    );

    expect(result).toEqual({
      status: "error",
      fieldErrors: {
        statement: ["Ingresá una recomendación de al menos 2 caracteres."],
      },
    });
  });

  it("maps stale dossier edits to a friendly error", async () => {
    const dossier = await generateDossier(services);
    const first = dossierMutationForm(dossier.id, dossier.version);
    first.set("statement", "Primera recomendación válida.");
    await addRecommendationSubmission(
      { services, resolveContext: resolveContext(workspaceOne) },
      first,
    );
    const stale = dossierMutationForm(dossier.id, dossier.version);
    stale.set("statement", "Segunda recomendación válida.");

    const result = await addRecommendationSubmission(
      { services, resolveContext: resolveContext(workspaceOne) },
      stale,
    );

    expect(result).toEqual({
      status: "error",
      globalError:
        "El dossier cambió en otra operación. Actualizá la página e intentá de nuevo.",
    });
  });

  it("does not expose a dossier from another workspace", async () => {
    const dossier = await generateDossier(services);
    const form = dossierMutationForm(dossier.id, dossier.version);
    form.set("statement", "Recomendación de otro espacio.");

    const result = await addRecommendationSubmission(
      { services, resolveContext: resolveContext(workspaceTwo) },
      form,
    );

    expect(result).toEqual({
      status: "error",
      globalError: "El dossier no existe.",
    });
  });

  it("rejects adding a recommendation from an older dossier id even when the version matches", async () => {
    const dossier = await generateDossier(services);
    const current = await addRecommendationSubmission(
      { services, resolveContext: resolveContext(workspaceOne) },
      (() => {
        const form = dossierMutationForm(dossier.id, dossier.version);
        form.set("statement", "Recomendación actualizada.");
        return form;
      })(),
    );
    if (current.status !== "success") {
      throw new Error("Expected current recommendation to succeed");
    }
    const stale = dossierMutationForm(dossier.id, current.version);
    stale.set("statement", "Recomendación enviada desde una versión vieja.");

    const result = await addRecommendationSubmission(
      { services, resolveContext: resolveContext(workspaceOne) },
      stale,
    );

    expect(result).toEqual({
      status: "error",
      globalError:
        "El dossier cambió en otra operación. Actualizá la página e intentá de nuevo.",
    });
  });

  it("edits exactly one item while preserving its epistemic metadata", async () => {
    const dossier = await generateDossier(services);
    const item = dossier.hypotheses[0];
    if (!item) {
      throw new Error("Expected hypothesis");
    }
    const form = dossierMutationForm(dossier.id, dossier.version);
    form.set("category", "hypotheses");
    form.set("itemId", item.id);
    form.set(
      "statement",
      "La coordinación operativa requiere automatización del triage.",
    );
    form.set("hidden", "false");

    const result = await editDossierItemSubmission(
      { services, resolveContext: resolveContext(workspaceOne) },
      form,
    );

    expect(result).toMatchObject({ status: "success", version: 2 });
    if (result.status !== "success") {
      throw new Error("Expected item edit");
    }
    const edited = await services.dossierRepository.getById(
      workspaceOne.workspaceId,
      result.dossierId,
    );
    expect(edited?.hypotheses[0]).toEqual({
      ...item,
      statement:
        "La coordinación operativa requiere automatización del triage.",
    });
  });

  it("rejects editing a recommendation from an older dossier id even when the version matches", async () => {
    const dossier = await generateDossier(services);
    const current = await addRecommendationSubmission(
      { services, resolveContext: resolveContext(workspaceOne) },
      (() => {
        const form = dossierMutationForm(dossier.id, dossier.version);
        form.set("statement", "Recomendación base para editar.");
        return form;
      })(),
    );
    if (current.status !== "success") {
      throw new Error("Expected recommendation creation");
    }
    const created = await services.dossierRepository.getById(
      workspaceOne.workspaceId,
      current.dossierId,
    );
    const recommendation = created?.recommendations[0];
    if (!recommendation) {
      throw new Error("Expected recommendation");
    }
    const stale = dossierMutationForm(dossier.id, current.version);
    stale.set("category", "recommendations");
    stale.set("itemId", recommendation.id);
    stale.set("statement", "Edición enviada desde un dossier viejo.");
    stale.set("hidden", "false");

    const result = await editDossierItemSubmission(
      { services, resolveContext: resolveContext(workspaceOne) },
      stale,
    );

    expect(result).toEqual({
      status: "error",
      globalError:
        "El dossier cambió en otra operación. Actualizá la página e intentá de nuevo.",
    });
  });

  it("rejects category-kind mismatches without leaking internals", async () => {
    const dossier = await generateDossier(services);
    const item = dossier.hypotheses[0];
    if (!item) {
      throw new Error("Expected hypothesis");
    }
    const form = dossierMutationForm(dossier.id, dossier.version);
    form.set("category", "researchedFacts");
    form.set("itemId", item.id);
    form.set("statement", "Texto válido para intentar editar.");
    form.set("hidden", "false");

    const result = await editDossierItemSubmission(
      { services, resolveContext: resolveContext(workspaceOne) },
      form,
    );

    expect(result).toEqual({
      status: "error",
      globalError: "El elemento no existe en la categoría indicada.",
    });
  });

  it("hides an item once and rejects hiding it again without a new version", async () => {
    const dossier = await generateDossier(services);
    const item = dossier.recommendations[0];
    if (!item) {
      throw new Error("Expected recommendation");
    }
    const form = dossierMutationForm(dossier.id, dossier.version);
    form.set("itemId", item.id);
    const first = await hideDossierItemSubmission(
      { services, resolveContext: resolveContext(workspaceOne) },
      form,
    );
    expect(first).toMatchObject({ status: "success", version: 2 });
    if (first.status !== "success") {
      throw new Error("Expected hide");
    }
    const repeated = dossierMutationForm(first.dossierId, first.version);
    repeated.set("itemId", item.id);

    const result = await hideDossierItemSubmission(
      { services, resolveContext: resolveContext(workspaceOne) },
      repeated,
    );

    expect(result).toEqual({
      status: "error",
      globalError: "El elemento ya está oculto.",
    });
    await expect(
      services.dossierRepository.listVersions(
        workspaceOne.workspaceId,
        dossier.campaignCompanyId,
      ),
    ).resolves.toHaveLength(2);
  });

  it("rejects hiding an item from an older dossier id even when the version matches", async () => {
    const dossier = await generateDossier(services);
    const current = await addRecommendationSubmission(
      { services, resolveContext: resolveContext(workspaceOne) },
      (() => {
        const form = dossierMutationForm(dossier.id, dossier.version);
        form.set("statement", "Recomendación para ocultar.");
        return form;
      })(),
    );
    if (current.status !== "success") {
      throw new Error("Expected recommendation creation");
    }
    const created = await services.dossierRepository.getById(
      workspaceOne.workspaceId,
      current.dossierId,
    );
    const recommendation = created?.recommendations[0];
    if (!recommendation) {
      throw new Error("Expected recommendation");
    }
    const stale = dossierMutationForm(dossier.id, current.version);
    stale.set("itemId", recommendation.id);

    const result = await hideDossierItemSubmission(
      { services, resolveContext: resolveContext(workspaceOne) },
      stale,
    );

    expect(result).toEqual({
      status: "error",
      globalError:
        "El dossier cambió en otra operación. Actualizá la página e intentá de nuevo.",
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
