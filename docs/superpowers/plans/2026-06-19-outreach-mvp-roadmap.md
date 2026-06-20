# Outreach MVP Delivery Roadmap

## Propósito

Dividir el MVP aprobado en entregas pequeñas que produzcan software utilizable y verificable. Cada fase tendrá su propio plan detallado antes de implementarse.

## Stack base propuesto

- Next.js App Router y TypeScript para dashboard y API.
- PostgreSQL como fuente de verdad.
- Drizzle ORM para schema, migraciones y consultas.
- Auth.js para autenticación del equipo interno.
- pg-boss para trabajos en segundo plano sobre PostgreSQL, sin incorporar Redis.
- Zod para contratos y validación.
- OpenAI Responses API detrás de un adaptador.
- Playwright para navegación, extracción y generación de PDF.
- Vitest para pruebas unitarias y de integración.
- Playwright Test para pruebas end-to-end.
- Almacenamiento S3-compatible para documentos y exportaciones.

La infraestructura se mantendrá portable. Las integraciones externas se implementarán detrás de interfaces propias.

## Fase 1: vertical de planificación en modo dry-run

Entrega:

- Dashboard interno.
- Carga y normalización de una oferta.
- Creación de campaña y selección de ticket.
- Recomendaciones de nichos simuladas mediante un proveedor intercambiable.
- Registro central de empresas, contactos, fuentes, hechos e hipótesis.
- Scoring reproducible.
- Dossier editable.
- Exportación a Markdown y PDF.
- Auditoría básica.
- Ningún envío, compra de datos o evento real.

Resultado verificable: el equipo puede crear una campaña de demostración, revisar empresas ficticias y exportar un dossier consistente.

Plan detallado: `docs/superpowers/plans/2026-06-19-outreach-phase-1-foundation.md`.

## Fase 2: descubrimiento, research y contactos reales

Entrega:

- Brave Search detrás de `SearchProvider`.
- Crawlee/Playwright detrás de `PageExtractor`.
- Cola de discovery y research.
- Research equilibrado y profundo con OpenAI.
- Finder por patrones de correo.
- Validación DNS/MX.
- Verificador open source detrás de `EmailVerifier`.
- Fallback pago detrás de `ContactEnrichmentProvider`.
- Deduplicación, vigencia, confianza, costos e idempotencia.

Resultado verificable: una campaña encuentra y clasifica empresas argentinas reales sin contactar a nadie.

## Fase 3: mensajes, aprobación y envío piloto

Entrega:

- Generación de secuencias.
- Aprobación de muestra y cola de excepciones.
- Adaptador para Smartlead o Saleshandy, elegido mediante spike comparativo.
- Dry-run y sandbox obligatorios.
- Exclusiones globales.
- Límites diarios.
- Seguimientos.
- Pausa al responder.
- Métricas de entrega y rebote.

Resultado verificable: campaña piloto de 25 a 50 prospectos sin duplicados ni violaciones de exclusión.

## Fase 4: bandeja, respuestas y agenda

Entrega:

- Sincronización de conversaciones.
- Clasificación de respuestas.
- Respuestas automáticas simples con reglas.
- Escalamiento de casos sensibles.
- Integración con Google Calendar y Meet.
- Calendly o Cal.com opcional.
- Confirmación, reprogramación, cancelación y no-show.

Resultado verificable: una respuesta positiva puede convertirse en una reunión creada y registrada.

## Fase 5: operación, observabilidad y aprendizaje

Entrega:

- Funnel completo.
- Costos reales por proveedor y campaña.
- Benchmarks por nicho, oferta y variante.
- Alertas de anomalías.
- Reintentos y dead-letter queue.
- Herramientas operativas para retomar procesos.
- Backups, retención y controles de acceso.
- Piloto gradual hasta 50–200 emails totales diarios.

Resultado verificable: el equipo puede operar campañas diariamente y conocer costo por reunión calificada.

## Decisiones que se toman justo antes de cada fase

- Proveedor de hosting y PostgreSQL.
- Smartlead contra Saleshandy.
- Proveedor fallback de enriquecimiento.
- Proveedor de almacenamiento S3-compatible.
- Calendly contra Cal.com.

Estas decisiones deben tomarse mediante pruebas pequeñas con costos, API, cobertura argentina y políticas vigentes; no por preferencia anticipada.
