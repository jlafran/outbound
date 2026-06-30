# Diseño del pipeline de enriquecimiento para prospección

Fecha: 30 de junio de 2026  
Estado: aprobado conceptualmente; pendiente de revisión del documento

## Objetivo

Completar el núcleo de la prueba de odontología/estética con cuatro etapas encadenadas:

1. investigar el sitio oficial de cada empresa;
2. encontrar y asociar decisores reales;
3. clasificar y priorizar con evidencia diferenciada;
4. producir un borrador personalizado que pueda auditarse antes de enviarlo.

El resultado debe mejorar la calidad comercial sin agregar APIs pagas. La corrida seguirá siendo manual, persistente y limitada a doce empresas.

## Decisiones y alternativas

### Alternativa elegida: HTTP directo y Cheerio

La aplicación descargará HTML público con `fetch` y lo analizará con Cheerio. Es rápido, económico y suficiente para sitios corporativos tradicionales. No ejecutará JavaScript ni recursos secundarios.

### Alternativa postergada: navegador automático

Playwright podría renderizar sitios construidos completamente con JavaScript, pero aumenta duración, memoria, superficie de fallos y costo operativo. Los sitios que lo requieran quedarán identificados como `javascript_required` para un fallback posterior.

### Alternativa postergada: Firecrawl, Apify u otro proveedor

Reduciría mantenimiento y resolvería más bloqueos, pero agrega costo por página y dependencia externa antes de validar que la información obtenida produce mejores leads.

## Arquitectura

El servicio actual se convertirá en un pipeline explícito:

`Brave discovery → validación del sitio → crawl oficial → extracción → asociación de decisores → contactos → scoring → mensaje`

Cada etapa recibirá y devolverá datos tipados. Un fallo de crawling afectará sólo a esa empresa; la corrida continuará y guardará el motivo.

### Nuevos componentes

- `OfficialWebsiteCrawler`: descarga y selecciona páginas.
- `WebsiteResearchExtractor`: transforma HTML en contactos, personas, servicios, señales y evidencia.
- `DecisionMakerAssociator`: combina personas del sitio con resultados públicos de LinkedIn/Brave.
- `ProspectingLeadScorer`: calcula score y desglose explicable.
- `PersonalizedMessageBuilder`: crea un borrador usando únicamente evidencia guardada.

El resultado seguirá persistido dentro del snapshot JSON de `prospecting_runs`. No se necesita una migración nueva para esta entrega.

## 2. Scraping del sitio oficial

### Páginas visitadas

Por empresa se visitarán como máximo cinco páginas del mismo dominio:

1. URL encontrada por Brave;
2. inicio del dominio;
3. enlaces internos priorizados por texto o ruta:
   - `contacto`, `contact`, `turnos`;
   - `nosotros`, `quienes-somos`;
   - `equipo`, `staff`, `profesionales`, `doctores`;
   - `servicios`, `tratamientos`, `especialidades`.

Se descartan login, carrito, búsquedas, calendarios externos, archivos, feeds, URLs con fragmentos y páginas fuera del dominio.

### Límites y seguridad

- Sólo `http` y `https`.
- Rechazo de localhost, credenciales embebidas, IPs privadas/reservadas y destinos internos tras cada redirect.
- Máximo tres redirects, siempre revalidados.
- Timeout de cinco segundos por request.
- Máximo 1 MB de respuesta por página.
- Sólo contenido HTML.
- Máximo tres requests concurrentes por empresa.
- User-Agent identificable: `OutreachResearchBot/1.0`.
- Lectura y cumplimiento de reglas aplicables de `robots.txt` según RFC 9309.
- Sin cookies, login, formularios ni ejecución de JavaScript.

### Información extraída

- emails visibles y enlaces `mailto:`;
- teléfonos, `tel:`, WhatsApp y enlaces `wa.me`;
- perfiles públicos de LinkedIn e Instagram;
- nombre comercial, descripción y ubicación visible;
- personas con nombre, cargo y contexto cercano;
- servicios y tratamientos relevantes;
- formularios, reserva online, solicitud de turnos y canales de seguimiento;
- cantidad de sucursales mencionadas;
- evidencia textual breve con URL exacta.

Cada página guardará estado (`fetched`, `blocked`, `timeout`, `non_html`, `too_large`, `javascript_required`, `robots_disallowed`), URL final y datos extraídos. No se conservará el HTML completo.

## 3. Asociación de decisores

### Roles priorizados para este caso

1. dueño/a o fundador/a;
2. director/a odontológico/a o médico/a;
3. gerente general;
4. administrador/a o responsable operativo/a;
5. responsable comercial/marketing cuando la señal se relacione con captación o seguimiento.

### Evidencia de asociación

Una persona sólo se asociará automáticamente cuando acumule evidencia suficiente:

- aparece en una página del dominio oficial: señal fuerte;
- su resultado público menciona el nombre comercial exacto: señal fuerte;
- el título, snippet o URL menciona tokens distintivos de la empresa: señal media;
- el rol coincide pero la empresa no puede demostrarse: señal débil y queda sin asociar.

La confianza será:

- `high`: sitio oficial y rol explícito, o dos señales fuertes independientes;
- `medium`: una señal fuerte o combinación de señales medias sin contradicción;
- `low`: coincidencia probable pero no suficiente para contacto automático.

Se deduplicará por nombre normalizado y URL pública. No se inferirán nombres a partir de emails genéricos.

## Contactos y costo de verificación

Los candidatos se ordenarán para evitar gastar créditos sin necesidad:

1. email personal publicado en el sitio oficial;
2. email laboral publicado junto al decisor;
3. patrones generados para el decisor con confianza `high` o `medium`.

Se verificará secuencialmente hasta encontrar un email `valid`, con un máximo de tres altas de No2Bounce por empresa. Los restantes quedarán `unverified`. Los emails genéricos se mostrarán como canal de empresa, pero no se presentarán como contacto humano.

## 4. Clasificación y scoring

El score será explicable y distinto por empresa. Cada lead guardará componentes y penalizaciones:

- Validación como empresa real del nicho: 0–20.
- Compatibilidad con la oferta: 0–15.
- Decisor asociado: 0–20.
- Canal directo utilizable: 0–15.
- Email verificado: 0–15.
- Señal concreta de oportunidad: 0–10.
- Calidad y diversidad de fuentes: 0–5.
- Penalizaciones por directorio, contenido editorial, ambigüedad o contradicción: 0 a −40.

Reglas de estado:

- `actionable`: score mínimo 75, empresa validada, decisor `high`/`medium` y canal utilizable;
- `review`: score mínimo 50 o falta una pieza crítica recuperable;
- `discarded`: score menor a 50, empresa no validada o evidencia contradictoria.

El score no aumentará por repetir la misma señal en varias páginas.

## 5. Mensaje personalizado

La primera versión usará un constructor determinista, no un LLM. Esto permite evaluar si el research es bueno antes de agregar costo y variabilidad de IA.

Cada lead accionable o en revisión tendrá:

- asunto;
- saludo al decisor cuando esté confirmado;
- observación específica respaldada por URL;
- hipótesis de problema expresada como hipótesis, no como hecho;
- conexión con la oferta fija del test: automatización de WhatsApp y seguimiento de pacientes;
- propuesta de diagnóstico/piloto sin prometer resultados no autorizados;
- CTA breve;
- evidencia utilizada, confianza y advertencias.

Ejemplo de estructura, no texto fijo:

> Vi que ofrecen turnos por WhatsApp y tratamientos de estética dental. En clínicas con varios canales, el seguimiento de consultas suele requerir bastante trabajo manual. Podemos revisar sin costo dónde se pierden conversaciones y mostrarte una automatización pequeña; sólo avanzamos si encontramos un impacto medible. ¿Tiene sentido verlo 15 minutos?

La primera oración debe ser un hecho verificable. La segunda debe usar lenguaje de hipótesis (`suele`, `podría`, `queremos validar`). Si no existe evidencia específica, no se genera mensaje y el lead queda en revisión.

## Interfaz

Cada tarjeta mostrará:

- páginas investigadas y estado del crawl;
- datos extraídos del sitio oficial;
- decisores con fuente y confianza;
- desglose del score;
- email/canal recomendado;
- mensaje y evidencia utilizada;
- motivo preciso cuando falte una pieza.

La interfaz no enviará mensajes. Sólo permitirá revisar el resultado persistido de la corrida.

## Errores y observabilidad

- Los errores de una empresa no cancelan las demás.
- Se registran dominio, etapa, código de error y duración; nunca contenido sensible ni tokens.
- `timeout`, bloqueo, robots y contenido JavaScript se distinguen entre sí.
- No se reintenta automáticamente más de una vez y sólo para fallos transitorios.
- Una página no oficial nunca puede elevar la confianza del sitio oficial por sí sola.

## Criterios de aceptación

En fixtures y pruebas controladas, el sistema debe demostrar:

1. visita sólo páginas permitidas y prioritarias del dominio;
2. bloquea destinos privados y redirects inseguros;
3. respeta límites, contenido y `robots.txt`;
4. extrae emails, teléfonos, WhatsApp, personas, roles, servicios y evidencia con URL;
5. asocia correctamente un decisor del sitio y evita asociar un homónimo sin empresa demostrable;
6. produce scores distintos y un desglose reproducible;
7. no marca `actionable` sin empresa, decisor y canal;
8. genera un mensaje únicamente cuando existe evidencia específica;
9. limita las verificaciones nuevas de No2Bounce a tres por empresa y se detiene tras un email válido;
10. persiste todo en la corrida y recargar no repite ninguna llamada externa;
11. mantiene verdes tests, lint, typecheck y build.

## Orden de implementación

1. Tipos y crawler seguro.
2. Extracción estructurada.
3. Integración en el servicio dental.
4. Asociación de decisores.
5. Scoring explicable.
6. Mensaje basado en evidencia.
7. Interfaz, pruebas completas y despliegue.

