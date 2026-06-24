import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { validateInternalIdentity } from "@/features/app/internal-action-context";
import { getServerAuthSession } from "@/lib/auth";

import "./dashboard.css";

export default async function AppLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await getServerAuthSession();
  if (!validateInternalIdentity(session)) {
    redirect("/auth/signin?callbackUrl=%2F");
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <Link className="brand" href="/dashboard">
          Outreach
        </Link>
        <nav aria-label="Navegación principal">
          <Link href="/dashboard">Guía</Link>
          <Link href="/offers/new">Nueva oferta</Link>
        </nav>
      </header>
      <div className="simulation-banner" role="status">
        Modo simulación: no se enviarán emails ni se comprarán datos
      </div>
      <main className="page-container">{children}</main>
    </div>
  );
}
