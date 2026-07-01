import Link from "next/link";
import { notFound } from "next/navigation";

import { getAppServices } from "@/features/app/app-services";
import { resolveInternalActionContext } from "@/features/app/internal-action-context";
import {
  refreshProspectingAction,
  runProspectingAction,
} from "@/features/prospecting/prospecting-actions";
import { formatEmailCandidateStatus } from "@/features/prospecting/email-candidate-labels";
import { ProspectingLeadEnrichment } from "./prospecting-lead-enrichment";

export const dynamic = "force-dynamic";

export default async function CampaignProspectingTestPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string; error?: string }>;
}) {
  const [{ id }, query, context] = await Promise.all([
    params,
    searchParams,
    resolveInternalActionContext(),
  ]);
  const services = await getAppServices();
  const campaign = await services.campaignRepository.getById(
    context.workspaceId,
    id,
  );
  if (!campaign) notFound();

  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  const reacherEndpoint = process.env.REACHER_ENDPOINT;
  const latestRun =
    await services.prospectingRepository.getLatestCompletedRun(
      context.workspaceId,
      campaign.id,
    );
  const pendingVerifications = latestRun
    ? await services.prospectingRepository.listPendingVerifications(
        context.workspaceId,
        latestRun.id,
      )
    : [];
  const result = latestRun?.resultSnapshot ?? null;
  const feedback =
    query.status === "run_complete"
      ? "Corrida guardada correctamente. Recargar esta página no vuelve a consumir búsquedas ni verificaciones."
      : query.status === "refresh_complete"
        ? "Verificaciones pendientes actualizadas sin volver a enviar los emails."
        : null;
  const error =
    query.error === "missing_brave"
      ? "Falta BRAVE_SEARCH_API_KEY en el entorno."
      : query.error === "missing_verifier"
        ? "No hay un verificador configurado para actualizar los pendientes."
        : query.error
          ? "No pudimos completar la operación. Revisá los logs antes de reintentar."
          : null;

  return (
    <>
      <div className="page-heading">
        <p className="muted">
          <Link href={`/campaigns/${campaign.id}`}>← Volver a campaña</Link>
        </p>
        <h1>Test de prospección: odontología / estética</h1>
        <p>
          Caso acotado para validar el core: empresas reales, decisores,
          WhatsApp/email visible, señales de oportunidad y descarte de ruido.
        </p>
      </div>

      <section className="workflow">
        <h2>Configuración fija de esta prueba</h2>
        <dl className="score-grid">
          <div>
            <dt>Mercado</dt>
            <dd>Argentina</dd>
          </div>
          <div>
            <dt>Oferta</dt>
            <dd>Automatización WhatsApp + seguimiento de pacientes</dd>
          </div>
          <div>
            <dt>Decisores</dt>
            <dd>Dueño/a, fundador/a, director/a odontológico/a, administración</dd>
          </div>
          <div>
            <dt>Volumen</dt>
            <dd>Hasta 12 empresas por corrida</dd>
          </div>
        </dl>
        {!apiKey ? (
          <p className="global-error" role="alert">
            Falta BRAVE_SEARCH_API_KEY en el entorno de Vercel/local.
          </p>
        ) : null}
        {feedback ? <p className="success-message">{feedback}</p> : null}
        {error ? (
          <p className="global-error" role="alert">
            {error}
          </p>
        ) : null}
        <p className="muted">
          Ejecutar una nueva corrida consume búsquedas de Brave y nuevas
          verificaciones. El resultado queda guardado y una recarga no repite
          ninguna operación externa.
        </p>
        <p className="muted">
          Verificación de email:{" "}
          {reacherEndpoint
            ? "No2Bounce/Reacher activo"
            : "sin verificador; se muestran candidatos sin verificar"}
        </p>
        {latestRun ? (
          <p className="muted">
            Última corrida guardada: {latestRun.completedAt?.toLocaleString("es-AR")} · {pendingVerifications.length} verificaciones pendientes
          </p>
        ) : null}
        <form action={runProspectingAction}>
          <input name="campaignId" type="hidden" value={campaign.id} />
          <button disabled={!apiKey} type="submit">
            Ejecutar nueva corrida
          </button>
        </form>
        {pendingVerifications.length > 0 ? (
          <form action={refreshProspectingAction}>
            <input name="campaignId" type="hidden" value={campaign.id} />
            <button disabled={!reacherEndpoint} type="submit">
              Actualizar verificaciones pendientes
            </button>
            <p className="muted">
              Esta actualización consulta los tracking IDs existentes: no
              envía nuevamente los emails ni consume otro crédito de alta.
            </p>
          </form>
        ) : null}
      </section>

      {result ? (
        <>
          <section aria-labelledby="prospecting-leads">
            <h2 id="prospecting-leads">Leads encontrados</h2>
            {result.leads.length === 0 ? (
              <p>No se encontraron leads accionables en esta corrida.</p>
            ) : (
              <ol className="company-list">
                {result.leads.map((lead) => (
                  <li key={lead.domain}>
                    <strong>{lead.companyName}</strong>
                    <br />
                    <span className="muted">
                      {lead.domain} · score {lead.score} · {lead.status}
                    </span>
                    <p>
                      <a href={lead.websiteUrl} rel="noreferrer" target="_blank">
                        Ver fuente empresa
                      </a>
                    </p>
                    <p>
                      <strong>Decisores:</strong>{" "}
                      {lead.decisionMakers.length > 0
                        ? lead.decisionMakers.map((person, index) => (
                            <span key={`${person.name}:${person.sourceUrl}`}>
                              {index > 0 ? ", " : null}
                              {person.linkedinUrl ? (
                                <a
                                  href={person.linkedinUrl}
                                  rel="noreferrer"
                                  target="_blank"
                                >
                                  {person.name}
                                </a>
                              ) : (
                                person.name
                              )}{" "}
                              ({person.role})
                            </span>
                          ))
                        : "No encontrado todavía"}
                    </p>
                    <p>
                      <strong>Contactos:</strong>{" "}
                      {[
                        ...lead.contacts.emails,
                        ...lead.contacts.whatsapps.map(
                          (phone) => `WhatsApp ${phone}`,
                        ),
                      ].join(" · ") || "No encontrado todavía"}
                    </p>
                    {lead.contacts.emailCandidates.length > 0 ? (
                      <p>
                        <strong>Emails candidatos:</strong>{" "}
                        {lead.contacts.emailCandidates
                          .map(
                            (candidate) =>
                              `${candidate.email} (${formatEmailCandidateStatus(candidate)})`,
                          )
                          .join(" · ")}
                      </p>
                    ) : null}
                    {lead.opportunitySignals.length > 0 ? (
                      <p>
                        <strong>Señal:</strong>{" "}
                        {lead.opportunitySignals.join(" ")}
                      </p>
                    ) : null}
                    <ProspectingLeadEnrichment lead={lead} />
                  </li>
                ))}
              </ol>
            )}
          </section>

          {result.unassociatedDecisionMakers.length > 0 ? (
            <section aria-labelledby="unassociated-decision-makers">
              <h2 id="unassociated-decision-makers">
                Decisores encontrados sin asociar
              </h2>
              <p className="muted">
                No son basura: son perfiles públicos que todavía no pudimos
                conectar con una empresa concreta.
              </p>
              <ol className="company-list">
                {result.unassociatedDecisionMakers.map((person) => (
                  <li key={`${person.name}:${person.sourceUrl}`}>
                    <strong>{person.name}</strong>
                    <br />
                    <span className="muted">
                      {person.role} · confianza {person.confidence}
                    </span>
                    <p>
                      <a
                        href={person.sourceUrl}
                        rel="noreferrer"
                        target="_blank"
                      >
                        Ver perfil/fuente
                      </a>
                    </p>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          <section aria-labelledby="prospecting-rejected">
            <h2 id="prospecting-rejected">Resultados descartados</h2>
            <p className="muted">
              Esto nos sirve para afinar las palabras negativas y fuentes.
            </p>
            <ol className="company-list">
              {result.rejected.slice(0, 20).map((item) => (
                <li key={`${item.domain}:${item.url}`}>
                  <strong>{item.title}</strong>
                  <br />
                  <span className="muted">
                    {item.domain} · {item.kind} · {item.reason}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </>
      ) : null}
    </>
  );
}
