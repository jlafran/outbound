import { notFound } from "next/navigation";

import { getAppServices } from "@/features/app/app-services";
import { resolveInternalActionContext } from "@/features/app/internal-action-context";

import { CampaignForm } from "./campaign-form";

export default async function NewCampaignPage({
  searchParams,
}: {
  searchParams: Promise<{ offerId?: string | string[] }>;
}) {
  const value = (await searchParams).offerId;
  const offerId = typeof value === "string" ? value : "";
  const context = await resolveInternalActionContext();
  const services = await getAppServices();
  const offer = await services.offerRepository.getById(
    context.workspaceId,
    offerId,
  );
  if (!offer) {
    notFound();
  }

  return (
    <>
      <div className="page-heading">
        <h1>Nueva campaña</h1>
        <p className="muted">
          Definí el límite diario y la política de datos para el dry-run.
        </p>
      </div>
      <CampaignForm
        defaultTargetTicketBand={offer.ticketBand}
        offerId={offerId}
      />
    </>
  );
}
