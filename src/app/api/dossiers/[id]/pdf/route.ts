import type { NextRequest } from "next/server";

import { createPdfDossierHandler } from "@/features/dossiers/dossier-pdf";

export async function GET(
  request: Request,
  context: { params: Promise<{ id?: string }> },
) {
  const [
    { db },
    { createDrizzleAuditRepository },
    {
      createDrizzleDossierPersistenceExecutor,
      createDrizzleDossierRepository,
    },
    { env },
    { getToken },
  ] = await Promise.all([
    import("@/db/client"),
    import("@/features/audit/audit-repository"),
    import("@/features/dossiers/dossier-repository"),
    import("@/lib/env"),
    import("next-auth/jwt"),
  ]);

  const pdfDossierHandler = createPdfDossierHandler({
    dossierRepository: createDrizzleDossierRepository(
      createDrizzleDossierPersistenceExecutor(db),
    ),
    auditRepository: createDrizzleAuditRepository(db),
    async resolveRequestContext(routeRequest) {
      const token = await getToken({
        req: routeRequest as NextRequest,
        secret: env.AUTH_SECRET,
      });

      return token &&
        typeof token.sub === "string" &&
        token.sub.length > 0 &&
        typeof token.workspaceId === "string" &&
        token.workspaceId.length > 0
        ? {
            workspaceId: token.workspaceId,
            actorId: token.sub,
          }
        : null;
    },
  });

  return pdfDossierHandler(request, context);
}
