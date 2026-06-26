# Diseño de corridas persistentes de prospección

Fecha: 26 de junio de 2026  
Estado: aprobado conceptualmente; pendiente de revisión del documento

## Objetivo

Convertir la prueba de prospección dental en un flujo persistente: una corrida debe quedar guardada, sobrevivir recargas y permitir actualizar verificaciones pendientes de No2Bounce sin repetir búsquedas de Brave ni consumir un nuevo crédito por email.

## Alternativas consideradas

1. **Guardar sólo el resultado completo como JSON.** Es la opción más rápida y reproduce exactamente la pantalla, pero no permite consultar ni actualizar emails individuales con seguridad.
2. **Normalizar desde ahora empresas, personas, fuentes y emails en tablas definitivas.** Es flexible, pero obliga a consolidar prematuramente el modelo de datos mientras todavía estamos afinando la calidad del algoritmo.
3. **Snapshot de corrida más verificaciones normalizadas.** Guarda el resultado completo y separa únicamente el estado mutable de cada email. Es la opción elegida porque evita duplicar llamadas pagas, mantiene trazabilidad y no congela todavía el modelo final de leads.

## Alcance

Esta entrega incluye:

- Crear una corrida persistente por ejecución manual.
- Guardar el snapshot completo devuelto por el servicio dental.
- Guardar cada email candidato, estado, proveedor y `trackingId`.
- Mostrar automáticamente la última corrida al abrir o recargar la página.
- Actualizar emails `pending` mediante `trackingId`, usando sólo el endpoint de consulta de No2Bounce.
- Reflejar los estados actualizados tanto en los registros individuales como en el snapshot mostrado.
- Evitar una nueva ejecución de Brave o un nuevo POST a No2Bounce al recargar o actualizar pendientes.
- Aislar todos los datos por `workspaceId` y `campaignId`.

Quedan para las siguientes entregas:

- Scraping de páginas oficiales de cada empresa.
- Asociación más robusta entre decisor y empresa.
- Clasificación y scoring mejorados.
- Mensajes personalizados.
- Generalización fuera del caso odontología/estética.

## Modelo de datos

### `prospecting_runs`

- `id`: identificador estable de la corrida.
- `workspace_id`: aislamiento del equipo.
- `campaign_id`: campaña que originó la corrida.
- `profile`: perfil utilizado, inicialmente `dental_aesthetics_ar`.
- `status`: `running`, `completed` o `failed`.
- `result_snapshot`: resultado JSON completo cuando termina.
- `error_message`: error seguro y no sensible si falla.
- `started_at`, `completed_at`, `created_at`, `updated_at`.

Índices: última corrida por workspace/campaña y clave única compuesta workspace/id. La relación con campaña usa workspace + campaign para impedir cruces entre espacios.

### `prospecting_email_verifications`

- `id`: identificador estable.
- `workspace_id`, `campaign_id`, `run_id`.
- `lead_domain`: empresa a la que pertenece el candidato.
- `email`: email candidato normalizado.
- `source`: `pattern`, `public`, `hunter` o `reacher`.
- `provider`: inicialmente `no2bounce` o `reacher`.
- `status`: `unverified`, `valid`, `risky`, `invalid`, `pending` o `unknown`.
- `provider_tracking_id`: identificador de consulta; nunca contiene la API key.
- `checked_at`, `created_at`, `updated_at`.

Habrá una fila por corrida, dominio y email. El índice de pendientes permitirá refrescar sólo lo necesario.

Las tablas estarán en `public` con RLS habilitado y sin políticas públicas. La aplicación accede exclusivamente mediante la conexión Postgres del servidor; no se expondrán claves ni escrituras al navegador.

## Componentes

### Adaptador de verificación

El resultado de `verify(email)` incluirá el `trackingId` cuando el proveedor lo entregue. Se agregará `refresh(trackingId)` para consultar un trabajo existente sin enviar nuevamente el email. Para proveedores síncronos, `refresh` no será necesario.

### Repositorio de prospección

Tendrá operaciones explícitas para:

- iniciar una corrida;
- completar o marcar como fallida una corrida;
- obtener la última corrida de una campaña;
- persistir verificaciones extraídas del resultado;
- listar verificaciones pendientes;
- actualizar un estado y sincronizarlo dentro del snapshot.

La sincronización del snapshot se hará en una única transacción para que la interfaz nunca muestre dos estados contradictorios.

### Servicio de aplicación

Orquestará dos acciones:

1. **Ejecutar prospección:** crea `running`, ejecuta Brave y No2Bounce, persiste el resultado y finaliza `completed`; ante error marca `failed` y devuelve un mensaje seguro.
2. **Actualizar pendientes:** carga los `trackingId`, consulta No2Bounce sin POST y actualiza los estados. Un error parcial no borra datos ni cambia otros emails.

### Interfaz

La página mostrará la última corrida incluso sin `?run=1`, incluyendo fecha y estado. Tendrá:

- `Ejecutar nueva corrida`, con advertencia de que consume búsquedas y verificaciones nuevas.
- `Actualizar verificaciones pendientes`, visible sólo cuando existan pendientes con `trackingId`.
- Conteo de pendientes y mensaje de resultado.

Las acciones serán formularios/server actions protegidos por el contexto de usuario existente. Después de cada acción se redirigirá a una URL limpia, evitando que recargar repita una operación costosa.

## Errores y seguridad

- Nunca se guardan ni registran tokens de Brave o No2Bounce.
- Los logs identifican emails sólo con hash, como en el código actual.
- Una corrida fallida queda registrada para diagnóstico y no reemplaza la última corrida completa utilizable.
- Un tracking inexistente o vencido pasa a `unknown`; no dispara automáticamente un nuevo POST pago.
- Todas las lecturas y escrituras exigen `workspaceId` más los identificadores de campaña/corrida.

## Pruebas y criterio de aceptación

Se implementará con TDD y debe demostrar:

1. No2Bounce devuelve y conserva el `trackingId` cuando queda `pending`.
2. `refresh(trackingId)` hace únicamente GET y mapea el estado final.
3. El repositorio recupera la última corrida de la campaña correcta y aísla workspaces.
4. Actualizar una verificación cambia su fila y el candidato correspondiente dentro del snapshot.
5. Abrir o recargar la página no llama a Brave ni hace POST a No2Bounce.
6. La migración aplica correctamente sobre Postgres/Supabase y las tablas tienen RLS e índices esperados.
7. Typecheck, lint, build y las suites relevantes terminan correctamente.

