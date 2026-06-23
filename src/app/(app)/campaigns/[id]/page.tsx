import Link from "next/link";
import { notFound } from "next/navigation";

import { getAppServices } from "@/features/app/app-services";
import { resolveInternalActionContext } from "@/features/app/internal-action-context";

import { CampaignWorkflow } from "./campaign-workflow";

export default async function CampaignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, context] = await Promise.all([
    params,
    resolveInternalActionContext(),
  ]);
  const services = await getAppServices();
  const campaign = await services.campaignRepository.getById(
    context.workspaceId,
    id,
  );
  if (!campaign) {
    notFound();
  }
  const [recommendations, generated] = await Promise.all([
    services.nicheRecommendationProjection.get(context.workspaceId, id),
    services.campaignDryRunProjection.get(context.workspaceId, id),
  ]);

  return (
    <>
      <div className="page-heading">
        <p className="muted">
          Estado: {campaign.state} · versión {campaign.version}
        </p>
        <h1>{campaign.name}</h1>
        <p>
          {campaign.targetDailyEmails} emails diarios · datos{" "}
          {campaign.paidDataMode}
        </p>
        <p>
          Ticket objetivo:{" "}
          {campaign.targetTicketBand === "usd_15k_plus"
            ? "USD 15k+"
            : "USD 5k–15k"}
        </p>
      </div>
      <section className="workflow" aria-label="Flujo de campaña">
        {campaign.state === "discovery_ready" ? (
          <h2>Lista para discovery</h2>
        ) : null}
        <CampaignWorkflow
          campaign={campaign}
          recommendations={recommendations}
        />
      </section>
      {generated ? (
        <section aria-labelledby="generated-companies">
          <h2 id="generated-companies">Empresas generadas</h2>
          <ol aria-label="Empresas generadas" className="company-list">
            {generated.companies.map((company, index) => (
              <li key={company.campaignCompanyId}>
                <strong>{company.name}</strong>
                <br />
                <span className="muted">
                  {company.domain} · score {company.score.total}
                </span>
                {index === 0 ? (
                  <>
                    <br />
                    <Link href={`/dossiers/${generated.dossierId}`}>
                      Ver estado del dossier
                    </Link>
                  </>
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </>
  );
}
