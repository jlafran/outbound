import { CampaignForm } from "./campaign-form";

export default async function NewCampaignPage({
  searchParams,
}: {
  searchParams: Promise<{ offerId?: string | string[] }>;
}) {
  const value = (await searchParams).offerId;
  const offerId = typeof value === "string" ? value : "";

  return (
    <>
      <div className="page-heading">
        <h1>Nueva campaña</h1>
        <p className="muted">
          Definí el límite diario y la política de datos para el dry-run.
        </p>
      </div>
      <CampaignForm offerId={offerId} />
    </>
  );
}
