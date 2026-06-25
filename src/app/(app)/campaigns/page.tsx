import Link from "next/link";

import { getAppServices } from "@/features/app/app-services";
import { resolveInternalActionContext } from "@/features/app/internal-action-context";

export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const [services, context] = await Promise.all([
    getAppServices(),
    resolveInternalActionContext(),
  ]);
  const campaigns = await services.campaignRepository.list(
    context.workspaceId,
  );

  return (
    <>
      <div className="page-heading">
        <p className="muted">Campañas</p>
        <h1>Mis campañas</h1>
        <p className="muted">
          Abrí una campaña para continuar el workflow o entrar al test de
          prospección odontología/estética.
        </p>
      </div>

      {campaigns.length === 0 ? (
        <section className="panel">
          <p>No hay campañas todavía.</p>
          <Link className="button-link" href="/offers/new">
            Crear oferta para iniciar
          </Link>
        </section>
      ) : (
        <ol className="company-list" aria-label="Campañas">
          {campaigns.map((campaign) => (
            <li key={campaign.id}>
              <strong>{campaign.name}</strong>
              <br />
              <span className="muted">
                Estado {campaign.state} · {campaign.targetDailyEmails} emails/día
                · versión {campaign.version}
              </span>
              <p className="workflow-actions">
                <Link href={`/campaigns/${campaign.id}`}>Abrir campaña</Link>
                {" · "}
                <Link href={`/campaigns/${campaign.id}/prospecting-test`}>
                  Test prospección
                </Link>
              </p>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
