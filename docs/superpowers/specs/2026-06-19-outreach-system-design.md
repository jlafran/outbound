# Diseño del sistema de outreach

Fecha: 19 de junio de 2026  
Estado: aprobado conceptualmente; pendiente de revisión final del documento

## 1. Objetivo

Construir una herramienta interna para un equipo de 2 a 5 personas que transforme una solución comercial documentada en reuniones calificadas realizadas por Google Meet.

La primera versión se usará internamente y quedará preparada para evolucionar a un SaaS multiempresa. El mercado inicial será Argentina, con expansión posterior a Latinoamérica. El foco estará en empresas de 50 a 250 empleados capaces de invertir:

- USD 5.000 a USD 15.000 por implementación; o
- USD 15.000 o más por implementación.

El usuario elegirá el ticket objetivo al crear cada campaña. Las primeras soluciones que se probarán serán automatizaciones y agentes de IA, y generación y automatización de leads. El sistema deberá admitir otras soluciones sin cambios estructurales.

## 2. Alcance del MVP

El MVP cubrirá el ciclo desde la carga de una solución hasta que la primera reunión con el prospecto efectivamente se realiza:

1. Carga y estructuración de la solución.
2. Recomendación y selección de nichos.
3. Descubrimiento de empresas y decisores.
4. Research equilibrado y profundo.
5. Priorización de oportunidades.
6. Obtención y verificación de contactos laborales.
7. Generación y aprobación de mensajes.
8. Envío de secuencias por email.
9. Creación de tareas manuales para LinkedIn.
10. Clasificación y gestión de respuestas.
11. Coordinación de agenda y creación del evento de Google Meet.
12. Preparación de un dossier para la reunión.
13. Registro de que la reunión ocurrió y de si fue calificada.

Quedan fuera del MVP:

- Automatización de LinkedIn.
- Guiones para llamadas.
- Generación de propuestas comerciales.
- Manejo automatizado de objeciones complejas.
- Cierre comercial posterior a la primera reunión.
- Espacios separados para clientes externos.

## 3. Criterio de éxito

La métrica principal será la cantidad de reuniones calificadas realizadas.

Una reunión será calificada cuando:

- La empresa encaje con el perfil de la campaña.
- Participe un decisor o referente con influencia real.
- Exista un problema concreto compatible con la solución.
- La empresa tenga capacidad para invertir dentro del ticket objetivo.

También se medirán respuestas, reuniones agendadas, asistencia, ventas posteriores y valor generado, pero no serán la métrica principal del MVP.

## 4. Enfoque de producto

La solución tendrá una arquitectura modular con una experiencia asistida:

- Cada etapa del proceso tendrá entradas, salidas y estados explícitos.
- Un copiloto de IA podrá recomendar y ejecutar acciones dentro de esos límites.
- Los puntos comercialmente sensibles requerirán aprobación humana.
- Los proveedores externos se conectarán mediante adaptadores intercambiables.
- La lógica estratégica, el research, el scoring, la personalización y los datos pertenecerán al producto.
- Inicialmente se comprarán las capas donde la confiabilidad operativa sea más importante que el ahorro, especialmente el envío de cold email.

Esta combinación permite validar el sistema rápidamente sin quedar atados permanentemente a Smartlead, Saleshandy, Hunter, Firecrawl, Apify u otro proveedor.

## 5. Flujo de una campaña

### 5.1 Carga de la solución

El usuario cargará un PDF, Word o texto libre y completará un formulario estructurado con:

- Descripción de la solución.
- Problemas que resuelve.
- Resultados esperados.
- Casos de éxito y evidencia disponible.
- Ticket objetivo.
- Plazos de implementación.
- Oferta o piloto permitido.
- Garantías permitidas.
- Restricciones y promesas prohibidas.
- Industrias o empresas excluidas.

El sistema extraerá una ficha normalizada. No podrá inventar condiciones que no estén en el documento o formulario.

### 5.2 Recomendación de nichos

El sistema propondrá entre 3 y 5 nichos y los ordenará según:

- Capacidad de pago.
- Magnitud económica del problema.
- Urgencia.
- Facilidad para demostrar retorno.
- Acceso probable al decisor.
- Cantidad estimada de empresas disponibles.
- Compatibilidad con la solución y sus casos de éxito.

El usuario aprobará los nichos que se probarán o podrá ingresar uno manualmente.

### 5.3 Descubrimiento de empresas

El sistema buscará empresas mediante fuentes públicas:

- Motores de búsqueda.
- Sitios corporativos.
- Directorios y cámaras empresariales.
- Noticias.
- Bolsas de empleo.
- Marketplaces.
- Perfiles laborales y redes sociales públicas.
- Reseñas y bases públicas.

Cada dato guardará URL de origen, fecha de consulta y nivel de confianza.

### 5.4 Research equilibrado

Cada campaña procesará inicialmente entre 100 y 250 empresas con research equilibrado:

- Actividad y propuesta de valor.
- Tamaño, ubicación y mercado.
- Señales de crecimiento o contracción.
- Vacantes, tecnologías y procesos visibles.
- Decisores probables.
- Problemas plausibles compatibles con la solución.
- Uno a tres ángulos de oportunidad.

El objetivo de esta etapa es clasificar, no producir un diagnóstico definitivo.

### 5.5 Scoring y research profundo

Las 20 a 30 empresas con mayor potencial recibirán research profundo:

- Evidencia concreta del problema.
- Procesos y experiencia del cliente observables.
- Competidores relevantes y diferencias.
- Brechas y oportunidades de mejora.
- Estimación preliminar de horas, costos o ingresos afectados.
- Solución sugerida dentro de la oferta cargada.
- Riesgos e incertidumbres.
- Ángulo de mensaje personalizado.

Las estimaciones se presentarán como hipótesis con sus supuestos. Nunca como hechos no comprobados.

### 5.6 Contactos

Solo se usarán datos laborales públicos y correos corporativos.

El proceso será:

1. Identificar uno o más decisores adecuados.
2. Obtener el dominio corporativo.
3. Detectar patrones de email conocidos.
4. Generar candidatos.
5. Validar sintaxis, dominio y registros MX.
6. Intentar verificación open source.
7. Usar un proveedor pago como fallback para casos dudosos o prioritarios.

Cada contacto guardará fuente, método, estado de verificación y confianza.

### 5.7 Mensajes y aprobación

El sistema generará:

- Email inicial.
- Dos o tres follow-ups.
- Tarea y borrador para contacto manual por LinkedIn.
- Variantes para experimentación cuando corresponda.

El mensaje deberá mostrar research real, conectar un problema con la solución y usar únicamente ofertas o condiciones preaprobadas.

Antes de enviar, el usuario aprobará una muestra representativa. Los mensajes equivalentes podrán enviarse automáticamente. Los casos con baja confianza o diferencias relevantes volverán a revisión.

### 5.8 Envío

El MVP utilizará inicialmente un proveedor especializado, probablemente Smartlead o Saleshandy, elegido después de una prueba comparativa real de:

- API y webhooks.
- Sincronización de respuestas.
- Límites y rotación.
- Pausa al responder.
- Rebotes y listas de exclusión.
- Costos al volumen previsto.
- Facilidad para migrar.

El sistema propio conservará la definición de campañas, mensajes, contactos, estados y métricas. El proveedor será solamente la infraestructura de entrega.

El volumen objetivo será configurable entre 50 y 200 emails totales diarios. Los límites por casilla y dominio serán más conservadores y se incrementarán gradualmente.

### 5.9 Respuestas

Las respuestas aparecerán tanto en Gmail u Outlook como en una bandeja unificada del dashboard.

La IA clasificará:

- Positiva.
- Pregunta simple.
- Pedido de información.
- Objeción.
- Derivación a otra persona.
- No interesado.
- No contactar.
- Fuera de oficina.
- Rebote.
- Ambigua.

La IA podrá responder preguntas simples y coordinar horarios. Deberá escalar:

- Precios no aprobados.
- Garantías.
- Descuentos.
- Compromisos de trabajo.
- Objeciones complejas.
- Mensajes ambiguos o sensibles.

### 5.10 Agenda

El prospecto podrá:

- Elegir un horario mediante Calendly o Cal.com; o
- Coordinarlo conversando por email.

El sistema consultará disponibilidad, creará el evento en Google Calendar, agregará Google Meet y registrará confirmaciones y cambios.

### 5.11 Dossier

Antes de la reunión, el sistema preparará:

- Perfil de la empresa.
- Perfil y rol del contacto.
- Historial completo de interacciones.
- Problemas detectados y evidencia.
- Competidores y brechas.
- Oportunidades relacionadas con la solución.
- Estimación preliminar de impacto económico.
- Intereses, objeciones y preguntas del prospecto.
- Fuentes y nivel de confianza.

El MVP termina cuando se registra que la reunión ocurrió. El equipo marcará si fue calificada y agregará notas.

## 6. Modelo de información

### 6.1 Entidades principales

- **Workspace:** equipo interno, configuración y permisos.
- **Usuario:** miembro del equipo y rol.
- **Oferta:** documento, ficha normalizada y restricciones.
- **Campaña:** oferta, nichos, ticket, volumen, presupuesto y estado.
- **Nicho:** definición, hipótesis y score económico.
- **Empresa:** perfil central reutilizable.
- **Contacto:** persona, cargo y datos laborales.
- **Fuente:** URL, fecha, tipo y confianza.
- **Señal:** hecho observado sobre una empresa.
- **Hipótesis:** interpretación derivada de señales.
- **Research:** análisis equilibrado o profundo.
- **Oportunidad:** problema compatible con una oferta.
- **Mensaje:** contenido, variante, aprobación y canal.
- **Secuencia:** pasos, tiempos y reglas.
- **Conversación:** hilo sincronizado y clasificación.
- **Reunión:** agenda, enlace, asistencia y calificación.
- **Experimento:** combinación de nicho, oferta, mensaje, fuente y proveedor.
- **Costo:** consumo atribuido a una campaña, empresa o reunión.
- **Exclusión:** no contactar, unsubscribe, rechazo u otra restricción.

### 6.2 Base central reutilizable

Empresas, contactos, señales y research pertenecerán a una base central, no a una sola campaña.

Cuando una empresa no encaje con una oferta, se guardarán:

- Motivo del descarte.
- Problemas observados.
- Ofertas alternativas compatibles.
- Capacidad de pago estimada.
- Fuentes y fecha de actualización.
- Restricciones de contacto.

Al cargar una nueva oferta, el sistema buscará primero oportunidades en la base existente. Antes de reutilizar información sensible al tiempo, comprobará su vigencia.

### 6.3 Estados del lead en una campaña

El estado principal seguirá esta secuencia:

`descubierto → investigado → calificado → contacto_encontrado → aprobado → contactado → respondió → reunión_agendada → reunión_realizada`

También existirán estados terminales o laterales:

- Descartado para esta oferta.
- Sin contacto confiable.
- No interesado.
- No contactar.
- Reunión cancelada.
- Reunión no asistida.
- Error que requiere revisión.

Los cambios de estado serán auditables.

## 7. Arquitectura lógica

### 7.1 Aplicación

- Dashboard web guiado.
- API de aplicación.
- PostgreSQL como fuente de verdad.
- Almacenamiento de documentos y artefactos.
- Workers y colas para tareas largas.
- Scheduler para seguimientos y actualizaciones.
- Registro estructurado de eventos y costos.

### 7.2 Módulos

- Ingesta y normalización de ofertas.
- Recomendación de nichos.
- Descubrimiento.
- Scraping y extracción.
- Research.
- Scoring.
- Contact finder.
- Verificación.
- Generación de mensajes.
- Aprobaciones.
- Adaptador de envío.
- Sincronización de conversaciones.
- Clasificación de respuestas.
- Agenda.
- Dossier.
- Analítica y experimentos.

Cada módulo tendrá una interfaz definida para poder reemplazar su implementación sin afectar a los consumidores.

### 7.3 Proveedores iniciales

La selección definitiva se hará mediante pruebas pequeñas antes de desarrollar cada integración.

- **IA:** OpenAI.
- **Búsqueda:** Brave Search API; SearXNG podrá evaluarse como alternativa.
- **Scraping normal:** Crawlee y Playwright.
- **Scraping fallback:** Apify o Firecrawl Cloud.
- **Extracción self-hosted:** Firecrawl podrá evaluarse para páginas compatibles.
- **Verificación:** Reacher u otra librería open source.
- **Enriquecimiento fallback:** Hunter, Snov, FullEnrich u otro proveedor con cobertura comprobada en Argentina.
- **Envío:** Smartlead o Saleshandy inicialmente.
- **Correo:** Google Workspace y, posteriormente, Outlook.
- **Agenda:** Google Calendar y Meet; Calendly o Cal.com opcional.

Resend, AWS SES y proveedores transaccionales similares no se usarán para cold outreach cuando sus políticas lo prohíban.

## 8. Reglas operativas

- No contactar simultáneamente a la misma persona desde campañas distintas.
- No enviar si existe una exclusión global.
- Un unsubscribe o pedido de no contacto bloquea todos los envíos futuros.
- Detener follow-ups cuando existe una respuesta.
- No repetir un envío después de un timeout sin comprobar su estado.
- No volver a comprar un dato que ya está vigente y disponible.
- Aplicar idempotencia a envíos, compras de datos y creación de reuniones.
- Limitar reintentos y enviar fallos persistentes a revisión.
- Pausar campañas ante rebotes, quejas o anomalías.
- Mantener límites por campaña, dominio, casilla y proveedor.
- Registrar cada acción automática y su motivo.
- Permitir intervención y corrección humana.

## 9. Privacidad y cumplimiento

- Usar únicamente datos laborales públicos y correos corporativos.
- Guardar la fuente de cada dato.
- Aplicar minimización de datos.
- Facilitar exclusión inmediata.
- No utilizar datos personales innecesarios.
- Separar hechos, hipótesis y estimaciones.
- Revisar legislación y políticas aplicables antes del piloto.
- No automatizar LinkedIn en el MVP.
- No utilizar proveedores cuyo uso aceptable contradiga la campaña.

## 10. Métricas

### 10.1 Funnel

El dashboard mostrará:

- Empresas descubiertas.
- Empresas investigadas.
- Empresas calificadas.
- Contactos encontrados.
- Contactos verificados.
- Prospectos únicos contactados.
- Emails enviados.
- Emails entregados.
- Rebotes.
- Respuestas.
- Respuestas positivas.
- Reuniones agendadas.
- Reuniones realizadas.
- Reuniones calificadas.

### 10.2 Costos

Se registrará:

- Costo por búsqueda.
- Costo por página procesada.
- Costo por empresa investigada.
- Costo por contacto encontrado.
- Costo por contacto verificado.
- Costo por prospecto contactado.
- Costo por respuesta positiva.
- Costo por reunión agendada.
- Costo por reunión realizada.
- Costo por reunión calificada.

Los costos se podrán comparar por proveedor, nicho, oferta, fuente y campaña.

### 10.3 Hipótesis inicial

Por cada 1.000 prospectos únicos:

- 970 entregados.
- 60 respuestas.
- 20 respuestas positivas.
- 12 reuniones agendadas.
- 9 reuniones realizadas.
- 6 reuniones calificadas.

Estos números son una hipótesis de planificación, no una garantía. El sistema construirá benchmarks propios y mostrará intervalos basados en datos reales.

No se usará la tasa de apertura como métrica principal.

## 11. Calidad y manejo de errores

### 11.1 Confianza

Cada dato o conclusión tendrá:

- Fuente.
- Fecha.
- Confianza.
- Tipo: hecho, hipótesis o estimación.

Los datos de baja confianza no habilitarán automáticamente mensajes específicos que dependan de ellos.

### 11.2 Fallos

- Reintentos con backoff para fallos transitorios.
- Dead-letter queue para fallos persistentes.
- Claves de idempotencia para efectos externos.
- Registro del último estado confirmado por proveedor.
- Alertas cuando el costo o error supera un umbral.
- Capacidad de retomar un proceso desde la etapa fallida.

## 12. Pruebas y validación

### 12.1 Pruebas automatizadas

- Unitarias para scoring, transiciones, deduplicación y exclusiones.
- Integración para adaptadores externos.
- Contratos para normalizar respuestas de proveedores.
- Idempotencia de envíos, compras de datos y reuniones.
- Seguridad de permisos.

### 12.2 Simulación

El sistema tendrá un modo dry-run que ejecute el flujo completo sin:

- Comprar datos pagos.
- Enviar emails.
- Crear eventos reales.

El modo mostrará acciones, mensajes, costos estimados y decisiones.

### 12.3 Piloto

1. Comparar proveedores con muestras pequeñas de empresas argentinas.
2. Preparar dominios y casillas.
3. Ejecutar una campaña de 25 a 50 prospectos.
4. Revisar precisión, costos, entregabilidad y respuestas.
5. Corregir el sistema.
6. Incrementar gradualmente hasta 50–200 emails totales diarios.

## 13. Criterios de aceptación del MVP

El MVP estará listo para uso interno cuando:

- Una oferta pueda cargarse y normalizarse.
- El sistema recomiende nichos con explicación.
- Descubra y deduplique empresas.
- Complete research equilibrado y profundo con fuentes.
- Identifique y verifique contactos.
- Genere mensajes basados en evidencia.
- Permita aprobar una muestra.
- Envíe una secuencia mediante un adaptador especializado.
- Sincronice y clasifique respuestas.
- Escale casos sensibles.
- Coordine una reunión con Google Meet.
- Genere el dossier.
- Registre asistencia y calificación.
- Mida costos y funnel.
- Evite envíos duplicados y respete exclusiones globales.

## 14. Evolución posterior

Después de validar reuniones calificadas:

1. Reemplazar componentes pagos donde el ahorro justifique el mantenimiento.
2. Automatizar más respuestas con evidencia real.
3. Incorporar Outlook.
4. Agregar propuestas y segunda reunión.
5. Evaluar automatización segura de LinkedIn.
6. Crear workspaces separados para clientes.
7. Convertir el producto interno en SaaS.

