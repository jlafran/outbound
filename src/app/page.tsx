import Link from "next/link";
import { redirect } from "next/navigation";

import { validateInternalIdentity } from "@/features/app/internal-action-context";
import { getServerAuthSession } from "@/lib/auth";

export default async function HomePage() {
  const session = await getServerAuthSession();
  if (validateInternalIdentity(session)) {
    redirect("/dashboard");
  }

  return (
    <main style={{ margin: "4rem auto", maxWidth: "42rem", padding: "0 1rem" }}>
      <h1>Outreach</h1>
      <p>
        Sistema interno para preparar campañas de outreach B2B. Entrá con tu
        cuenta autorizada para ver la guía y crear campañas.
      </p>
      <p>
        <Link href="/auth/signin?callbackUrl=%2Fdashboard">Ingresar</Link>
      </p>
    </main>
  );
}
