import Link from "next/link";
import { notFound } from "next/navigation";

import { getAppServices } from "@/features/app/app-services";
import { resolveInternalActionContext } from "@/features/app/internal-action-context";
import { DentalAestheticsProspectingService } from "@/features/prospecting/dental-prospecting-service";
import { BraveSearchClient } from "@/features/research/brave-search-client";

export const dynamic = "force-dynamic";

export default async function CampaignProspectingTestPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ run?: string }>;
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
  const shouldRun = query.run === "1";
  const result =
    shouldRun && apiKey
      ? await new DentalAestheticsProspectingService({
          searchClient: new BraveSearchClient({ apiKey }),
          maxCompanies: 12,
        }).run()
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
        <p className="muted">
          Ejecutar la prueba consume búsquedas de Brave. No guarda datos todavía:
          sirve para afinar calidad antes de persistir y escalar.
        </p>
        <Link
          aria-disabled={!apiKey}
          className="button-link"
          href={`/campaigns/${campaign.id}/prospecting-test?run=1`}
        >
          Ejecutar prueba con Brave
        </Link>
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
                        ? lead.decisionMakers
                            .map((person) => `${person.name} (${person.role})`)
                            .join(", ")
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
                    {lead.opportunitySignals.length > 0 ? (
                      <p>
                        <strong>Señal:</strong>{" "}
                        {lead.opportunitySignals.join(" ")}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </section>

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
