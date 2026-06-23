# Progreso de implementación — Fase 1

Última actualización: 23 de junio de 2026

Rama: `codex/outreach-phase-1`

Worktree: `/Users/juancruzlafranconi/Documents/Outreach/.worktrees/outreach-phase-1`

## Estado

Fase 1 completa. Tareas 1–15 implementadas:

1. Scaffold y controles de calidad.
2. Workspace y auditoría.
3. Dominio de ofertas.
4. Campañas y máquina de estados.
5. Recomendación de nichos.
6. Base central de empresas y research.
7. Scoring reproducible.
8. Dataset dry-run.
9. Servicio de dossier.
10. Exportación Markdown.
11. Exportación PDF.
12. Dashboard de oferta y campaña.
13. Dashboard del dossier.
14. Autenticación y aislamiento.
15. Verificación integral.

## Estado de verificación

Las tareas funcionales y sus correcciones fueron verificadas durante la implementación. Este checkpoint no inventa ni reutiliza un conteo histórico como evidencia de release: antes de publicar, ejecutar una verificación fresca de lint, TypeScript, Vitest, smoke PDF con Chromium real, Playwright E2E y build de producción.

## Decisiones implementadas

- Next.js 15, TypeScript, PostgreSQL, Drizzle, Zod, Vitest y Playwright.
- Los secretos y artefactos generados están ignorados por Git.
- Auditoría con integridad multi-workspace, metadata JSON segura y orden monotónico.
- Creación de ofertas y eventos de auditoría dentro de una unidad de trabajo atómica.
- Repositorios de memoria serializan transacciones para evitar pérdida de datos.
- Ofertas normalizadas limitan precios, pilotos y promesas comerciales.
- Campañas usan referencias seguras a ofertas del mismo workspace.
- Máquina de estados con validación de orden e invariantes.
- Control de concurrencia optimista visible para el cliente mediante `expectedVersion`.
- Fase 1 solo permite avanzar hasta `discovery_ready`.
- Recomendaciones de nichos deterministas, con score derivado y guardrails para texto generado.
- Base central de empresas con deduplicación, aislamiento por workspace e integridad entre fuentes, evidencia, campañas y ofertas.
- Scoring de empresas reproducible y explicable.
- Dataset dry-run con tres empresas argentinas ficticias, contactos corporativos, evidencia, hipótesis, estimaciones y scores.
- Dossiers append-only con cadenas de versiones inmutables, edición con concurrencia optimista y etiquetas epistemológicas.
- Exportaciones Markdown y PDF de la versión exacta del dossier; el smoke PDF exige Chromium real.
- Dashboard autenticado con `workspaceId` y actor derivados de sesión, allowlist de emails y exactamente una membresía por usuario.
- Google OAuth obligatorio en producción; credenciales compartidas disponibles solo en desarrollo.
- El flujo fake completo vive en `OUTREACH_E2E_MODE=1`, es en memoria, está prohibido en producción y no produce efectos externos.
- El modo persistente usa PostgreSQL, pero los proveedores reales de recomendaciones, discovery y research quedan deliberadamente fuera de Fase 1.

## Commits relevantes

- `1321ef3` — scaffold y reglas de archivos.
- `c45341a` — workspace y auditoría segura.
- `f661975` — orden de auditoría y transacciones en memoria.
- `898fd1d` — dominio inicial de ofertas.
- `4913a62` — creación atómica de ofertas.
- `948f36f` — máquina de estados de campañas.
- `c1ab538` — concurrencia e invariantes de campañas.
- `266b94d` — seguridad de recomendaciones de nichos.
- `a182104` — integridad de la base central de empresas.
- `621cc3f` — scoring explicable de empresas.
- `4715832` — research dry-run determinista.
- `7f76e18` — dossiers versionados.
- `326703f` — cadenas de dossier inmutables.
- `f9fec3d` — exportación Markdown.
- `d213889` — exportación PDF.
- `245dacc` — smoke PDF obligatorio en CI.
- `9d826c5` — dashboard de oferta y campaña.
- `7450350` y `cc1c9e0` — dashboard editable del dossier.
- `c1cc070` — autenticación y aislamiento del workspace.
- `4e8d07f` y `387f86e` — endurecimiento final de autorización y sesiones.

## Próximo paso

Fase 2: integrar discovery, research y contactos reales detrás de los puertos existentes, manteniendo aislamiento por workspace, auditoría, revisión humana y límites explícitos de efectos externos.

## Verificación previa a release

1. Abrir el worktree indicado arriba.
2. Confirmar que la rama es `codex/outreach-phase-1`.
3. Ejecutar:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:pdf-smoke
pnpm test:e2e
pnpm build
git status --short
```

4. Seguir la operación y las limitaciones documentadas en
   `docs/operations/phase-1-dry-run.md`.
