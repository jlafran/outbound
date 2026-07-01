import type { ProspectingLead } from "@/features/prospecting/prospecting-types";

export function ProspectingLeadEnrichment({ lead }: { lead: ProspectingLead }) {
  if (!lead.websiteResearch) {
    return <p className="muted">Esta corrida no contiene research del sitio oficial.</p>;
  }

  const research = lead.websiteResearch;
  return (
    <div className="workflow">
      <h3>Research del sitio oficial</h3>
      <p className="muted">
        Estado: {research.status} · {research.pages.length} páginas evaluadas
      </p>
      <ul>
        {research.pages.map((page) => (
          <li key={`${page.requestedUrl}:${page.status}`}>
            {page.finalUrl ? (
              <a href={page.finalUrl} rel="noreferrer" target="_blank">
                {page.title ?? page.finalUrl}
              </a>
            ) : (
              page.requestedUrl
            )}{" "}
            · {page.status}
          </li>
        ))}
      </ul>

      <p>
        <strong>Personas publicadas:</strong>{" "}
        {research.people.length
          ? research.people
              .map(({ name, role }) => `${name} (${role})`)
              .join(" · ")
          : "No encontradas"}
      </p>
      <p>
        <strong>Servicios:</strong>{" "}
        {research.services.join(" · ") || "No identificados"}
      </p>
      <p>
        <strong>Contactos oficiales:</strong>{" "}
        {[
          ...research.contacts.emails,
          ...research.contacts.whatsapps.map((value) => `WhatsApp ${value}`),
        ].join(" · ") || "No encontrados"}
      </p>

      {lead.scoreBreakdown ? (
        <>
          <h3>Por qué tiene este score</h3>
          <p>
            {Object.entries(lead.scoreBreakdown.components)
              .map(([key, value]) => `${key}: ${value}`)
              .join(" · ")}
          </p>
          {lead.scoreBreakdown.penalties.length ? (
            <p>
              <strong>Penalizaciones:</strong>{" "}
              {lead.scoreBreakdown.penalties
                .map(({ label, value }) => `${label}: ${value}`)
                .join(" · ")}
            </p>
          ) : null}
          {lead.scoreBreakdown.reasons.length ? (
            <p className="muted">{lead.scoreBreakdown.reasons.join(" ")}</p>
          ) : null}
        </>
      ) : null}

      <h3>Contacto recomendado</h3>
      {lead.recommendedContact ? (
        <p>
          {lead.recommendedContact.name
            ? `${lead.recommendedContact.name} (${lead.recommendedContact.role}) · `
            : null}
          {lead.recommendedContact.channel}: {lead.recommendedContact.value} ·
          confianza {lead.recommendedContact.confidence}
        </p>
      ) : (
        <p className="muted">Todavía no hay un contacto suficientemente confiable.</p>
      )}

      <h3>Mensaje personalizado</h3>
      {lead.messageDraft ? (
        <div>
          <p>
            <strong>Asunto:</strong> {lead.messageDraft.subject}
          </p>
          <p>{lead.messageDraft.body}</p>
          <p className="muted">
            Evidencia:{" "}
            {lead.messageDraft.evidenceUrls.map((url, index) => (
              <span key={url}>
                {index ? " · " : null}
                <a href={url} rel="noreferrer" target="_blank">
                  {url}
                </a>
              </span>
            ))}
          </p>
          {lead.messageDraft.warnings.length ? (
            <p className="muted">{lead.messageDraft.warnings.join(" ")}</p>
          ) : null}
        </div>
      ) : (
        <p className="muted">
          No se generó: falta una señal específica respaldada por el sitio oficial.
        </p>
      )}
    </div>
  );
}
