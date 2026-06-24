import Link from "next/link";

const steps = [
  {
    title: "1. Crear oferta",
    body: "Cargá qué vendés, qué problemas resuelve, resultados esperados, ticket objetivo, piloto permitido y promesas prohibidas.",
  },
  {
    title: "2. Crear campaña",
    body: "Desde la oferta guardada, creá una campaña con emails diarios, ticket objetivo y modo de datos.",
  },
  {
    title: "3. Recomendar nichos",
    body: "La app propone nichos iniciales. Esta parte todavía es guiada/simulada; Brave se usa después para buscar empresas.",
  },
  {
    title: "4. Aprobar nichos",
    body: "Revisá los nichos sugeridos, seleccioná los que querés probar y aprobá la campaña.",
  },
  {
    title: "5. Generar datos dry-run",
    body: "Con la campaña en discovery_ready, generá empresas. En campañas nuevas, esta etapa usa Brave si la API key está activa.",
  },
  {
    title: "6. Revisar dossiers",
    body: "Abrí cada dossier para ver investigación, problemas detectados, recomendaciones y exportación Markdown/imprimible.",
  },
];

export default function DashboardPage() {
  return (
    <>
      <div className="page-heading">
        <p className="muted">Guía rápida</p>
        <h1>Cómo usar Outreach</h1>
        <p className="muted">
          Usá una campaña nueva para probar Brave. Las campañas viejas pueden
          tener resultados simulados ya guardados.
        </p>
      </div>

      <section className="panel dashboard-actions" aria-label="Acciones rápidas">
        <Link className="button-link" href="/offers/new">
          Crear nueva oferta
        </Link>
      </section>

      <section className="dashboard-section">
        <h2>Flujo recomendado</h2>
        <div className="card-grid">
          {steps.map((step) => (
            <article className="card" key={step.title}>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="dashboard-section panel">
        <h2>Rutas útiles</h2>
        <ul className="route-list">
          <li>
            <Link href="/offers/new">/offers/new</Link> — crear una oferta.
          </li>
          <li>
            <code>/offers/[id]</code> — ver una oferta ya creada.
          </li>
          <li>
            <code>/campaigns/new?offerId=ID</code> — crear campaña desde una
            oferta.
          </li>
          <li>
            <code>/campaigns/[id]</code> — avanzar el workflow de campaña.
          </li>
          <li>
            <code>/dossiers/[id]</code> — ver investigación de un prospecto.
          </li>
        </ul>
      </section>
    </>
  );
}
