# Guía operativa del dry-run de Fase 1

Esta guía cubre el arranque autenticado con PostgreSQL y la demostración completa, determinista y sin efectos externos. La demostración E2E guarda datos en memoria: reiniciar el proceso o ejecutar el reset E2E elimina esos datos.

## 1. Preparar base de datos y primera cuenta

1. Copiar `.env.example` a `.env.local`, completar `DATABASE_URL`, generar un `AUTH_SECRET` de al menos 32 caracteres y definir `ALLOWED_EMAILS`.
2. Aplicar las migraciones existentes:

```bash
pnpm db:migrate
```

3. Crear el primer workspace, usuario y membresía con `psql`. Sustituir el email del ejemplo y usar el mismo valor, normalizado en minúsculas, en `ALLOWED_EMAILS`.

```sql
BEGIN;

INSERT INTO workspaces (id, name)
VALUES ('workspace-main', 'Outreach principal')
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name;

INSERT INTO users (id, email, name)
VALUES ('user-admin', 'admin@example.com', 'Administrador')
ON CONFLICT (email) DO UPDATE
SET name = EXCLUDED.name;

DO $$
DECLARE
  selected_user_id text;
  membership_count integer;
BEGIN
  SELECT id INTO STRICT selected_user_id
  FROM users
  WHERE lower(btrim(email)) = 'admin@example.com';

  SELECT count(*) INTO membership_count
  FROM workspace_members
  WHERE user_id = selected_user_id
    AND workspace_id <> 'workspace-main';

  IF membership_count <> 0 THEN
    RAISE EXCEPTION
      'El usuario ya pertenece a otro workspace; no se modificó ninguna membresía';
  END IF;

  INSERT INTO workspace_members (workspace_id, user_id, role)
  VALUES ('workspace-main', selected_user_id, 'owner')
  ON CONFLICT (workspace_id, user_id) DO UPDATE
  SET role = EXCLUDED.role;
END
$$;

COMMIT;
```

La autenticación de Fase 1 exige exactamente una membresía por usuario. La clave primaria impide duplicar la misma pareja workspace/usuario, pero la aplicación también rechaza a un usuario que pertenezca a dos workspaces porque todavía no existe un selector de workspace.

Verificar el resultado sin exponer secretos:

```sql
SELECT u.id, u.email, wm.workspace_id, wm.role
FROM users AS u
JOIN workspace_members AS wm ON wm.user_id = u.id
WHERE lower(btrim(u.email)) = 'admin@example.com';
```

## 2. Configurar autenticación

### Producción: Google OAuth

Configurar:

```dotenv
NODE_ENV=production
DATABASE_URL=postgresql://...
AUTH_SECRET=una-cadena-aleatoria-de-32-caracteres-o-mas
APP_URL=https://outreach.example.com
NEXTAUTH_URL=https://outreach.example.com
ALLOWED_EMAILS=admin@example.com
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

En Google Cloud, registrar el origen HTTPS de la aplicación y la URI de redirección:

```text
https://outreach.example.com/api/auth/callback/google
```

`APP_URL` y `NEXTAUTH_URL` deben compartir exactamente el mismo origen. El email de Google debe estar en `ALLOWED_EMAILS`, existir en `users` y tener exactamente una membresía. No configurar `DEV_AUTH_PASSWORD` ni `OUTREACH_E2E_MODE` en producción.

### Desarrollo: credencial interna

Configurar un email permitido y una contraseña local de al menos 12 caracteres:

```dotenv
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/outreach
AUTH_SECRET=una-cadena-local-de-32-caracteres-o-mas
APP_URL=http://localhost:3000
NEXTAUTH_URL=http://localhost:3000
ALLOWED_EMAILS=admin@example.com
DEV_AUTH_PASSWORD=una-clave-local-larga
```

Ejecutar `pnpm dev`, abrir `/auth/signin` e ingresar con ese email y la contraseña compartida. La contraseña no se almacena en la base de datos: se lee del entorno. No imprimirla en logs, copiarla a tickets, guardarla en el repositorio ni reutilizar una credencial real.

## 3. Ejecutar el flujo completo simulado

El flujo completo de Fase 1 utiliza los proveedores fake deterministas y las proyecciones en memoria. Iniciarlo únicamente en desarrollo:

```bash
OUTREACH_E2E_MODE=1 pnpm dev
```

Este modo usa la identidad fija `user-e2e`/`workspace-e2e`, omite el login normal y no usa las tablas persistentes para el flujo. La aplicación lanza un error si se intenta activar E2E con `NODE_ENV=production`.

1. Abrir `http://localhost:3000/offers/new`.
2. Confirmar el banner permanente: **“Modo simulación: no se enviarán emails ni se comprarán datos”**.
3. Completar “Nueva oferta”: nombre, documento de solución, problemas, resultados esperados, ticket objetivo, piloto permitido y promesas prohibidas. Elegir **Guardar oferta**.
4. Revisar la oferta normalizada y elegir **Crear campaña**.
5. Cargar nombre, por ejemplo `Dry-run Argentina`, `50` emails diarios y una política de datos. Elegir **Guardar campaña**. El número es un objetivo simulado: no crea envíos.
6. En la campaña, elegir **Recomendar nichos**. Revisar las tres recomendaciones fake y sus scores.
7. Elegir **Pasar a revisión**, seleccionar uno o más nichos y elegir **Aprobar nichos**. La campaña avanza a `discovery_ready` y muestra **Lista para discovery**.
8. Elegir **Generar datos dry-run**. Se crean exactamente tres empresas argentinas ficticias, ordenadas por score, sin consultas ni compras externas.
9. En la primera empresa, elegir **Ver estado del dossier**.
10. Revisar la versión y las etiquetas epistemológicas. **Editar elemento**, **Ocultar** o **Editar recomendaciones** crea una nueva versión inmutable; no modifica la versión anterior.
11. Elegir **Exportar Markdown** y **Exportar PDF**. Ambos enlaces exportan la versión de dossier actualmente abierta. El PDF requiere Chromium local.

Fuera de `OUTREACH_E2E_MODE=1`, ofertas y campañas usan PostgreSQL y autenticación real, pero Fase 1 no configura proveedores reales de recomendación, discovery o research. Por diseño, el flujo persistente se detiene antes de esos efectos.

## 4. Inspeccionar auditoría

La auditoría persistente debe consultarse en modo solo lectura, siempre filtrada por workspace y ordenada por `sequence`:

```sql
BEGIN READ ONLY;

\set workspace_id 'workspace-main'

SELECT
  sequence,
  created_at,
  actor_id,
  action,
  entity_id,
  metadata
FROM audit_events
WHERE workspace_id = :'workspace_id'
ORDER BY sequence ASC;

COMMIT;
```

No ejecutar la consulta sin `workspace_id`. El dry-run E2E en memoria no escribe eventos en PostgreSQL; esta consulta corresponde al modo persistente autenticado.

## 5. Verificaciones obligatorias

Antes de una entrega, ejecutar verificación fresca:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:pdf-smoke
pnpm test:e2e
pnpm build
```

Instalar Chromium si falta:

```bash
pnpm exec playwright install chromium
```

El smoke PDF con Chromium real es obligatorio: los tests con navegador simulado no demuestran que el binario pueda generar un PDF válido.

## 6. Solución de problemas

### No aparece un proveedor de login

- Producción solo muestra Google cuando existen `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`.
- Desarrollo solo muestra credenciales cuando `DEV_AUTH_PASSWORD` tiene al menos 12 caracteres.
- `AUTH_SECRET` debe tener al menos 32 caracteres.
- En producción, `NEXTAUTH_URL` debe existir, usar HTTPS y compartir origen con `APP_URL`.

### El login es rechazado

- Normalizar el email en minúsculas y agregarlo a `ALLOWED_EMAILS`.
- Confirmar que existe en `users`.
- Confirmar que tiene exactamente una fila total en `workspace_members`.
- Las sesiones revalidan periódicamente la autorización; quitar el email permitido o la membresía invalida el acceso.

### Conflicto de versión o datos obsoletos

Campañas y dossiers usan control de concurrencia optimista. Si aparece un error de versión desactualizada, recargar la página y repetir la acción sobre la versión actual. No editar directamente versiones históricas del dossier: son append-only.

### Falla el PDF

Ejecutar `pnpm exec playwright install chromium` y luego `pnpm test:pdf-smoke`. Revisar permisos y dependencias del sistema del proceso que lanza Chromium. No considerar el despliegue listo si el smoke real falla.

### Falla una migración

- Confirmar que `DATABASE_URL` apunta a la base correcta y que el usuario tiene permisos DDL.
- Revisar qué migraciones existen en `drizzle/` y el estado de la base antes de reintentar.
- No usar `pnpm db:generate` para “arreglar” una instalación: ese comando crea migraciones nuevas desde cambios de schema.
- Restaurar una copia en un entorno aislado para diagnosticar migraciones parcialmente aplicadas.

## 7. Rollback y copias de seguridad

Tomar un backup verificable de PostgreSQL antes de migrar o cambiar datos de bootstrap. Las migraciones no incluyen un rollback automático y los dossiers son append-only por diseño. No borrar filas, editar archivos de migración ya aplicados ni ejecutar SQL correctivo directamente en producción sin ensayarlo sobre una restauración.

Para rollback de aplicación, desplegar un artefacto anterior compatible con el esquema actual. Si el rollback también requiere base de datos, preferir restaurar una copia validada durante una ventana de mantenimiento; una reversión manual puede romper cadenas de dossier, auditoría o integridad entre workspaces.

## Garantía de Fase 1

Fase 1 no envía emails, no compra datos y no llama proveedores reales de discovery, research o contactos. Las únicas comunicaciones del flujo son entre el navegador, la aplicación local y, en modo persistente, PostgreSQL. El PDF lanza Chromium local. `OUTREACH_E2E_MODE=1` existe exclusivamente para desarrollo y tests y nunca debe llegar a producción.
