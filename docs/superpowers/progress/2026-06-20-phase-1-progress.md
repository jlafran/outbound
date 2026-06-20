# Progreso de implementación — Fase 1

Última actualización: 20 de junio de 2026  
Rama: `codex/outreach-phase-1`  
Worktree: `/Users/juancruzlafranconi/Documents/Outreach/.worktrees/outreach-phase-1`

## Estado

Completadas y aprobadas:

1. Scaffold y controles de calidad.
2. Workspace y auditoría.
3. Dominio de ofertas.
4. Campañas y máquina de estados.
5. Recomendación de nichos.
6. Base central de empresas y research.
7. Scoring reproducible.
8. Dataset dry-run.

Pendientes:

9. Servicio de dossier.
10. Exportación Markdown.
11. Exportación PDF.
12. Dashboard de oferta y campaña.
13. Dashboard del dossier.
14. Autenticación y aislamiento.
15. Verificación integral.

## Línea base verificada

- 160 pruebas automatizadas pasan.
- ESLint pasa.
- TypeScript pasa.
- Build de producción pasa.
- Drizzle schema check pasa.
- Worktree limpio antes de este documento.

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

## Próximo paso

Implementar la Tarea 9: servicio de dossier versionado. Debe separar necesidades confirmadas, hechos investigados, hipótesis, estimaciones y recomendaciones, y preparar el modelo común que luego exportarán Markdown y PDF.

## Cómo retomar

1. Abrir el worktree indicado arriba.
2. Confirmar que la rama es `codex/outreach-phase-1`.
3. Ejecutar:

```bash
pnpm test
pnpm typecheck
git status --short
```

4. Continuar desde la Tarea 9 del plan:
   `docs/superpowers/plans/2026-06-19-outreach-phase-1-foundation.md`.
