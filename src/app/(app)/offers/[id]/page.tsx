import Link from "next/link";
import { notFound } from "next/navigation";

import { getAppServices } from "@/features/app/app-services";
import { resolveInternalActionContext } from "@/features/app/internal-action-context";

export default async function OfferPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, context] = await Promise.all([
    params,
    resolveInternalActionContext(),
  ]);
  const services = await getAppServices();
  const offer = await services.offerRepository.getById(
    context.workspaceId,
    id,
  );
  if (!offer) {
    notFound();
  }

  return (
    <>
      <div className="page-heading">
        <p className="muted">Oferta normalizada · versión {offer.version}</p>
        <h1>{offer.name}</h1>
      </div>
      <div className="detail-grid">
        <section className="card">
          <h2>Problemas</h2>
          <ul>
            {offer.problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </section>
        <section className="card">
          <h2>Resultados esperados</h2>
          <ul>
            {offer.expectedResults.map((result) => (
              <li key={result}>{result}</li>
            ))}
          </ul>
        </section>
        <section className="card">
          <h2>Condiciones</h2>
          <p>
            <strong>Ticket:</strong>{" "}
            {offer.ticketBand === "usd_15k_plus"
              ? "USD 15k+"
              : "USD 5k–15k"}
          </p>
          <p>
            <strong>Piloto:</strong> {offer.allowedPilot}
          </p>
        </section>
        <section className="card">
          <h2>Promesas prohibidas</h2>
          {offer.prohibitedClaims.length ? (
            <ul>
              {offer.prohibitedClaims.map((claim) => (
                <li key={claim}>{claim}</li>
              ))}
            </ul>
          ) : (
            <p className="muted">Sin promesas adicionales.</p>
          )}
        </section>
      </div>
      <p>
        <Link
          className="button-link"
          href={`/campaigns/new?offerId=${encodeURIComponent(offer.id)}`}
        >
          Crear campaña
        </Link>
      </p>
    </>
  );
}
