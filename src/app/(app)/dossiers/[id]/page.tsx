import { notFound } from "next/navigation";

import { getAppServices } from "@/features/app/app-services";
import { resolveInternalActionContext } from "@/features/app/internal-action-context";
import type {
  Dossier,
  DossierItem,
} from "@/features/dossiers/dossier-schema";

import {
  DossierItemControls,
  RecommendationEditor,
} from "./dossier-editor";

const epistemicLabels: Record<DossierItem["kind"], string> = {
  confirmed_by_prospect: "Confirmado por el prospecto",
  researched_fact: "Hecho investigado",
  hypothesis: "Hipótesis",
  estimate: "Estimación",
  recommendation: "Recomendación",
};

const confidenceLabels: Record<DossierItem["confidence"], string> = {
  low: "baja",
  medium: "media",
  high: "alta",
};

type DossierCategory =
  | "confirmedNeeds"
  | "researchedFacts"
  | "hypotheses"
  | "estimates"
  | "competitors"
  | "recommendations";

function safeSourceUrl(sourceUrl: string | undefined) {
  if (!sourceUrl) return null;
  try {
    const url = new URL(sourceUrl);
    return url.protocol === "http:" || url.protocol === "https:"
      ? sourceUrl
      : null;
  } catch {
    return null;
  }
}

function DossierItems({
  category,
  dossier,
  emptyText,
}: {
  category: DossierCategory;
  dossier: Dossier;
  emptyText: string;
}) {
  const items = dossier[category];
  if (items.length === 0) {
    return <p className="muted">{emptyText}</p>;
  }
  return (
    <div className="dossier-item-list">
      {items.map((item) => {
        const sourceUrl = safeSourceUrl(item.sourceUrl);
        return (
          <article
            aria-label={item.statement}
            className={`dossier-item${item.hidden ? " is-hidden" : ""}`}
            key={item.id}
          >
            <div className="dossier-item-heading">
              <p className="epistemic-label">{epistemicLabels[item.kind]}</p>
              {item.hidden ? <span className="hidden-marker">Oculto</span> : null}
            </div>
            <p>{item.statement}</p>
            <dl className="item-metadata">
              <div>
                <dt>Confianza</dt>
                <dd>Confianza: {confidenceLabels[item.confidence]}</dd>
              </div>
              {sourceUrl ? (
                <div>
                  <dt>Fuente</dt>
                  <dd>
                    <a
                      href={sourceUrl}
                      rel="noreferrer noopener"
                      target="_blank"
                    >
                      Fuente
                    </a>
                  </dd>
                </div>
              ) : null}
            </dl>
            <div className="assumptions">
              <h3>Supuestos</h3>
              {item.assumptions.length ? (
                <ul>
                  {item.assumptions.map((assumption) => (
                    <li key={assumption}>{assumption}</li>
                  ))}
                </ul>
              ) : (
                <p className="muted">Sin supuestos registrados.</p>
              )}
            </div>
            <DossierItemControls
              category={category}
              dossierId={dossier.id}
              item={item}
              version={dossier.version}
            />
          </article>
        );
      })}
    </div>
  );
}

export default async function DossierPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, context] = await Promise.all([
    params,
    resolveInternalActionContext(),
  ]);
  const services = await getAppServices();
  const dossier = await services.dossierRepository.getById(
    context.workspaceId,
    id,
  );
  if (!dossier) {
    notFound();
  }

  return (
    <div className="dossier-page">
      <div className="page-heading">
        <h1>Dossier</h1>
        <div className="dossier-version-row">
          <p className="version-badge">Versión {dossier.version}</p>
          <p className="muted">
            Creado el{" "}
            {new Intl.DateTimeFormat("es-AR", {
              dateStyle: "long",
            }).format(dossier.createdAt)}
          </p>
        </div>
        <div className="workflow-actions">
          <a
            className="button-link"
            href={`/api/dossiers/${dossier.id}/markdown`}
          >
            Exportar Markdown
          </a>
          <a
            className="button-link secondary-link"
            href={`/api/dossiers/${dossier.id}/pdf`}
          >
            Abrir PDF / imprimible
          </a>
        </div>
      </div>

      <section className="card dossier-section" aria-labelledby="summary">
        <h2 id="summary">Resumen ejecutivo</h2>
        <p>{dossier.executiveSummary || "Sin resumen ejecutivo."}</p>
      </section>

      <section className="card dossier-section" aria-labelledby="company">
        <h2 id="company">Empresa y modelo de negocio</h2>
        <h3>Descripción de la empresa</h3>
        <p>{dossier.companyOverview || "Sin descripción disponible."}</p>
        <h3>Modelo de negocio</h3>
        <p>{dossier.businessModel || "Sin modelo de negocio registrado."}</p>
      </section>

      <section className="card dossier-section" aria-labelledby="contacts">
        <h2 id="contacts">Contactos</h2>
        {dossier.contacts.length ? (
          <ul className="contact-list">
            {dossier.contacts.map((contact) => (
              <li key={`${contact.name}-${contact.role}`}>
                <strong>{contact.name}</strong> — {contact.role}
                {contact.corporateEmail ? (
                  <>
                    {" "}
                    · <a href={`mailto:${contact.corporateEmail}`}>
                      {contact.corporateEmail}
                    </a>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">Sin contactos registrados.</p>
        )}
      </section>

      <section className="card dossier-section" aria-labelledby="conversation">
        <h2 id="conversation">Conversación</h2>
        <p>
          {dossier.conversationSummary ||
            "Todavía no hay una conversación registrada."}
        </p>
      </section>

      <section className="card dossier-section" aria-labelledby="needs">
        <h2 id="needs">Necesidades confirmadas</h2>
        <DossierItems
          category="confirmedNeeds"
          dossier={dossier}
          emptyText="No hay necesidades confirmadas."
        />
      </section>

      <section className="card dossier-section" aria-labelledby="facts">
        <h2 id="facts">Hechos investigados</h2>
        <DossierItems
          category="researchedFacts"
          dossier={dossier}
          emptyText="No hay hechos investigados."
        />
      </section>

      <section className="card dossier-section" aria-labelledby="hypotheses">
        <h2 id="hypotheses">Hipótesis</h2>
        <DossierItems
          category="hypotheses"
          dossier={dossier}
          emptyText="No hay hipótesis."
        />
      </section>

      <section className="card dossier-section" aria-labelledby="estimates">
        <h2 id="estimates">Estimaciones</h2>
        <DossierItems
          category="estimates"
          dossier={dossier}
          emptyText="No hay estimaciones."
        />
      </section>

      <section className="card dossier-section" aria-labelledby="competitors">
        <h2 id="competitors">Competidores</h2>
        <DossierItems
          category="competitors"
          dossier={dossier}
          emptyText="No hay competidores registrados."
        />
      </section>

      <section className="card dossier-section" aria-labelledby="recommendations">
        <h2 id="recommendations">Recomendaciones</h2>
        <DossierItems
          category="recommendations"
          dossier={dossier}
          emptyText="No hay recomendaciones."
        />
        <RecommendationEditor
          dossierId={dossier.id}
          version={dossier.version}
        />
      </section>

      <section className="card dossier-section" aria-labelledby="questions">
        <h2 id="questions">Preguntas pendientes</h2>
        {dossier.pendingQuestions.length ? (
          <ul>
            {dossier.pendingQuestions.map((question) => (
              <li key={question}>{question}</li>
            ))}
          </ul>
        ) : (
          <p className="muted">No hay preguntas pendientes.</p>
        )}
      </section>
    </div>
  );
}
