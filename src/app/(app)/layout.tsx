import Link from "next/link";
import type { ReactNode } from "react";

import "./dashboard.css";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <header className="app-header">
        <Link className="brand" href="/offers/new">
          Outreach
        </Link>
        <nav aria-label="Navegación principal">
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
