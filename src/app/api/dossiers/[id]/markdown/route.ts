import { createMarkdownDossierHandler } from "@/features/dossiers/dossier-markdown";
import { resolveInternalRequestContext } from "@/features/app/internal-action-context";

export async function GET(
  request: Request,
  context: { params: Promise<{ id?: string }> },
) {
  const isE2E =
    process.env.OUTREACH_E2E_MODE === "1" &&
    process.env.NODE_ENV !== "production";
  const markdownDossierHandler = createMarkdownDossierHandler({
    ...(isE2E
      ? await (async () => {
          const [
            { createMemoryAuditRepository },
            { getAppServices },
          ] = await Promise.all([
            import("@/features/audit/audit-repository"),
            import("@/features/app/app-services"),
          ]);
          const { dossierRepository } = await getAppServices();
          return {
            dossierRepository,
            auditRepository: createMemoryAuditRepository(),
          };
        })()
      : await (async () => {
          const [
            { db },
            { createDrizzleAuditRepository },
            {
              createDrizzleDossierPersistenceExecutor,
              createDrizzleDossierRepository,
            },
          ] = await Promise.all([
            import("@/db/client"),
            import("@/features/audit/audit-repository"),
            import("@/features/dossiers/dossier-repository"),
          ]);
          return {
            dossierRepository: createDrizzleDossierRepository(
              createDrizzleDossierPersistenceExecutor(db),
            ),
            auditRepository: createDrizzleAuditRepository(db),
          };
        })()),
    resolveRequestContext: resolveInternalRequestContext,
  });

  return markdownDossierHandler(request, context);
}
