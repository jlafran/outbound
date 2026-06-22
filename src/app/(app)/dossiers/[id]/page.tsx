import { notFound } from "next/navigation";

import { getAppServices } from "@/features/app/app-services";
import { resolveInternalActionContext } from "@/features/app/internal-action-context";

export default async function DossierStatusPage({
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
    <>
      <div className="page-heading">
        <h1>Dossier disponible</h1>
        <p>ID: {dossier.id}</p>
        <p>Estado: generado</p>
        <p>Versión: {dossier.version}</p>
      </div>
      <p className="muted">
        La visualización y edición del dossier se incorporarán en una etapa
        posterior.
      </p>
    </>
  );
}
