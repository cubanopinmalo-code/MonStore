# Fase 0.5 — Endurecimiento y corrección del backend (plan corregido v2)

Objetivo: dejar el backend estructuralmente seguro y portable. No se añade ninguna funcionalidad de Fase 1. Todo queda versionado en migraciones nuevas; el baseline no se toca.

## A. Lista final de migraciones

| # | Archivo | Contenido |
|---|---|---|
| 1 | `20260913_0501_auth_user_trigger.sql` | trigger en `auth.users` + endurecimiento acotado de `handle_new_user()` |
| 2 | `20260913_0502_definer_identity_guards.sql` | validación de identidad en funciones SECURITY DEFINER |
| 3 | `20260913_0503_function_execute_grants.sql` | REVOKE/GRANT de EXECUTE |
| 4 | `20260913_0504_orders_idempotency.sql` | índice único + inserción idempotente |
| 5 | `20260913_0505_wallet_guards.sql` | `CHECK balance >= 0` + columna `held_balance` (solo estructura) |
| 6 | `20260913_0506_events_private_room.sql` | vista pública de eventos, sala privada |
| 7 | `20260913_0507_internal_cost_protection.sql` | `g2bulk_cost` fuera del alcance del cliente |
| 8 | `20260913_0508_audit_log.sql` | estructura de auditoría (sin disparadores) |
| 9 | `20260913_0509_account_secrets_encryption.sql` | cifrado de credenciales (aditivo, no destructivo) |

Fuera de migración (datos, con las herramientas de datos): perfil + wallet + rol del usuario existente, y rol `admin` de bootstrap.

---

## B. Cambios exactos de cada migración

### 1. Trigger de registro
- `CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user()`.
- `handle_new_user()`: se añade `ON CONFLICT (id) DO NOTHING` en `profiles` (los otros tres INSERT ya lo tienen).
- **Corrección pedida (punto 1):** nada de `EXCEPTION WHEN OTHERS`. Solo el bloque de referidos queda tolerante, y únicamente ante errores esperados y concretos:
  ```
  BEGIN
    INSERT INTO public.referrals (...) VALUES (...) ON CONFLICT DO NOTHING;
  EXCEPTION
    WHEN foreign_key_violation OR unique_violation THEN
      RAISE WARNING 'Referido no aplicado para % (código inválido o duplicado)', NEW.id;
  END;
  ```
  Un código de referido inexistente ya resuelve a `ref_id = NULL` y simplemente no crea referido. Cualquier otro error (columna faltante, permiso, tipo incorrecto) **sigue propagándose y abortando el alta**, para que un fallo estructural sea visible y no quede oculto.

### 2. Guardas de identidad (SECURITY DEFINER)
Regla única: primera línea `IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Debes iniciar sesión.'`. Se elimina en todas partes el patrón `IF auth.uid() IS NOT NULL AND …`.

### 3. EXECUTE
Ver apartado D.

### 4. Idempotencia
- `CREATE UNIQUE INDEX orders_idempotency_key_uidx ON public.orders (idempotency_key) WHERE idempotency_key IS NOT NULL` (previa comprobación de duplicados; hoy la tabla está vacía).
- En `place_wallet_order`, el `SELECT` previo se sustituye por `INSERT … ON CONFLICT (idempotency_key) DO NOTHING RETURNING id`. Si no devuelve fila, se recupera la orden existente y se retorna `duplicated: true` **sin cobrar**. El cobro y el descuento de saldo pasan a ejecutarse solo cuando el INSERT creó fila, dentro de la misma transacción que ya bloquea la wallet con `FOR UPDATE`.

### 5. Wallet
- `ALTER TABLE public.wallets ADD CONSTRAINT wallets_balance_non_negative CHECK (balance >= 0)` (comprobado antes: 0 wallets).
- `ADD COLUMN held_balance numeric NOT NULL DEFAULT 0` + `CHECK (held_balance >= 0)` + `CHECK (balance >= held_balance)`.
- **Corrección pedida (punto 6):** solo estructura. `request_withdrawal` y `review_withdrawal` **no se tocan** en esta fase; el comportamiento actual de retiros queda idéntico y `held_balance` permanece en 0 para todas las wallets, existentes y nuevas.

### 6. Eventos
Detalle en el apartado E y en la sección "Eventos" más abajo.

### 7. Coste interno
`REVOKE SELECT (g2bulk_cost) ON public.products FROM anon, authenticated`.

### 8. Auditoría
Tabla `public.audit_log` (`id`, `actor_id`, `action`, `entity_type`, `entity_id`, `before jsonb`, `after jsonb`, `note`, `created_at`), RLS activado, **solo** policy de SELECT para admin, sin policies de escritura, `GRANT SELECT TO authenticated` y `GRANT ALL TO service_role`. Sin disparadores todavía.

### 9. Cifrado de credenciales
Detalle completo en el apartado F. Migración aditiva: añade columnas cifradas y funciones; **no borra nada**.

---

## C. Funciones SECURITY DEFINER afectadas

**Corrección pedida (punto 2):** cada función tiene **un solo** mecanismo de autorización. No se mezclan.

### Grupo 1 — Usuario autenticado (`auth.uid()`). EXECUTE: `authenticated`.
| Función | Parámetro de identidad | Validación |
|---|---|---|
| `place_wallet_order` | `p_user` | `auth.uid()` no nulo **y** `p_user = auth.uid()` |
| `request_deposit` | `p_user` | igual |
| `request_deposit_v2` | `p_user` | igual |
| `claim_referral_reward` | `p_user` | igual |
| `request_withdrawal` | — | ya usa `auth.uid()`; se refuerza el nulo |
| `publish_game_account` | — | ya correcta |
| `subscribe_event`, `enter_event_room` | — | ya correctas |
| `set_display_currency` | — | ya correcta |

### Grupo 2 — Administrador autenticado (`has_role(auth.uid(),'admin')`). EXECUTE: `authenticated`. **Sin service_role.**
`review_deposit`, `review_withdrawal`, `review_game_account`, `release_payment_line`.

`review_deposit` deja de recibir `p_admin` como fuente de verdad: el parámetro se conserva por compatibilidad de firma, pero se ignora y se usa `auth.uid()`. Se exige `has_role(auth.uid(),'admin')`. **Se corrige la inconsistencia que señalaste: no se le concede EXECUTE a `service_role`.** Es una acción humana del panel, no una acción de backend.

### Grupo 3 — Backend interno (`service_role`). EXECUTE: `service_role` únicamente.
Solo dos funciones, ambas invocadas hoy por el servidor tras haber validado ya al usuario:
- `place_wallet_order`: **cambia de grupo**. Hoy `src/lib/orders.functions.ts` la llama con `supabaseAdmin` después de `requireSupabaseAuth`. Para no mezclar mecanismos, la función queda en el Grupo 1 (exige `auth.uid()`), y **el código del servidor pasa a llamarla con `context.supabase`** (el cliente autenticado del usuario) en lugar de `supabaseAdmin`. Así hay un único mecanismo y desaparece la necesidad de service_role.
- `refund_wallet_order`: es una acción de compensación que el servidor ejecuta automáticamente cuando el proveedor falla, sin que haya un admin presente. Queda **exclusivamente** en el Grupo 3: validación `IF current_user <> 'service_role' THEN RAISE EXCEPTION`, `REVOKE FROM PUBLIC, anon, authenticated`, `GRANT TO service_role`. El reembolso manual del administrador seguirá pasando por la server function `refundOrder`, que ya comprueba admin antes de invocarla. Un cliente nunca posee la clave de servicio, así que no existe vía de acceso.

### Grupo 4 — Lectura pública agregada. EXECUTE: `anon`, `authenticated`.
`event_participant_counts`, `top_recharged_games`. Sin datos sensibles.

### Grupo 5 — Internas de trigger. EXECUTE revocado de PUBLIC.
`handle_new_user`, `keep_profile_phone`, `update_updated_at_column`, `has_role`.

---

## D. GRANT/REVOKE finales

**Funciones**
- `REVOKE EXECUTE ON FUNCTION … FROM PUBLIC, anon` en todas salvo el Grupo 4.
- `GRANT EXECUTE TO authenticated` en Grupos 1 y 2.
- `GRANT EXECUTE TO service_role` únicamente en `refund_wallet_order`.
- `has_role`: `GRANT EXECUTE TO authenticated` (lo usan las policies), revocado de `anon`.

**Tablas (etapa 1, la única de esta fase)**
- `REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM anon`. Sin efecto funcional: `anon` no tiene ninguna policy de escritura.
- `REVOKE ALL ON public.game_account_secrets FROM anon`; `authenticated` conserva solo `INSERT` (lo necesita el vendedor al publicar) y pierde `SELECT`.
- `REVOKE SELECT (g2bulk_cost) ON public.products FROM anon, authenticated`.
- `GRANT SELECT ON public.events_public TO anon, authenticated`; `REVOKE SELECT ON public.events FROM anon, authenticated`.

**Etapa 2 (fase posterior, no ahora):** recortar `DELETE` a `authenticated` y limitar el `SELECT` de `anon` a las tablas estrictamente públicas, previo inventario pantalla por pantalla.

---

## E. Cambios de frontend/servidor (mínimos e imprescindibles)

1. `src/lib/orders.functions.ts`: `place_wallet_order` se invoca con `context.supabase` en vez de `supabaseAdmin` (ver Grupo 3). El resto de la función no cambia.
2. `src/lib/catalog.functions.ts` → `listProductsAdmin`: hoy hace `context.supabase.from("products").select("*")` con el rol `authenticated`, así que al revocar la columna `g2bulk_cost` fallaría. Pasa a leer con `supabaseAdmin` **después** de `requireAdmin(context)`. Mismo patrón en `saveProduct` si lee esa columna.
3. `src/hooks/useEvents.ts`: la consulta pública deja de pedir `room_id` y `room_password` y pasa a leer `events_public`.
4. `src/routes/_authenticated/app/eventos/$id.tsx`: las credenciales de sala vienen solo del resultado de `enter_event_room()`; se elimina el respaldo `event.room_password`.
5. `src/routes/_authenticated/admin/eventos.tsx`: sigue leyendo `events` directamente (es admin), sin cambios.
6. Regeneración de los tipos del backend tras las migraciones.

Ningún cambio en pantallas de autenticación, wallet, comercio ni recargas.

---

## F. Estrategia de cifrado de credenciales

**Verificado en esta base (no asumido):** `pgsodium` **NO está instalado** (disponible pero no activo). Sí están activas: `pgcrypto 1.3` (esquema `extensions`) y `supabase_vault 0.3.1` (esquema `vault`).

Diseño con lo realmente disponible:

- **Clave maestra:** un secreto generado aleatoriamente y guardado en **Vault** (`vault.create_secret`), no en ninguna tabla de `public`. Vault guarda los secretos cifrados y solo son legibles a través de `vault.decrypted_secrets`, cuyo acceso está restringido al propietario de la base; `anon` y `authenticated` no tienen ningún permiso sobre el esquema `vault`.
- **Cifrado:** `extensions.pgp_sym_encrypt(texto, clave)` / `pgp_sym_decrypt` de pgcrypto, con la clave leída desde Vault **dentro** de la función, nunca pasada como parámetro.
- **Columnas nuevas (aditivas):** `account_email_enc bytea`, `account_password_enc bytea`, `admin_access_notes_enc bytea`. Las columnas en claro **se conservan** en esta fase.
- **Funciones:**
  - `store_account_secret(...)`: SECURITY DEFINER, exige `auth.uid()` y que quien llama sea el vendedor de esa publicación. Cifra y escribe. No devuelve nada del contenido.
  - `read_account_secret(p_account uuid)`: SECURITY DEFINER, exige `has_role(auth.uid(),'admin')`. Devuelve el texto descifrado solo al administrador.
  - Ambas con `search_path` fijado y `REVOKE … FROM PUBLIC, anon`.
- **Garantías:** la clave nunca está en una tabla de `public`, nunca se envía al frontend (no hay ninguna server function que la lea ni la devuelva), nunca se imprime (ni `RAISE` ni retorno la incluyen), el vendedor no puede descifrar (no tiene permiso de EXECUTE sobre `read_account_secret`, que además exige admin), y solo el backend/administrador autorizado descifra.
- **Migración de lo existente:** un `UPDATE` de backfill cifra las filas actuales en las columnas nuevas dentro de la misma migración. Las columnas en claro **no se borran**. El borrado será una migración posterior, separada y explícita, únicamente después de verificar que el descifrado funciona y que el panel lee por la vía nueva. Hoy, además, la tabla no tiene filas reales que perder.
- **Alternativa si Vault diera problemas:** guardar la clave como secreto de entorno del backend y cifrar/descifrar en la capa de servidor en lugar de en SQL. Lo comprobaré antes de escribir la migración y te lo diré si cambia.

---

## G. Estrategia service_role / backend

**Confirmado por inspección directa:**
- `.env` expone al navegador únicamente `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` y `VITE_SUPABASE_PROJECT_ID`. **No existe ninguna variable `VITE_` con la clave de servicio.**
- La única referencia a `SUPABASE_SERVICE_ROLE_KEY` en todo el código fuente está en `src/integrations/supabase/client.server.ts`, leída con `process.env` (solo servidor) y con importación dinámica dentro de los manejadores, de modo que no entra en el paquete del navegador.
- No aparece en ningún archivo de frontend, ni en `localStorage`, ni en `sessionStorage`, ni en ninguna respuesta enviada al cliente. Ninguna server function la devuelve ni la registra.
- `admin/productos.tsx` **no** usa la clave: llama a `listProductsAdmin`, una server function. El acceso a `g2bulk_cost` pasará a hacerse ahí, en el servidor, tras validar el rol admin — exactamente como pides.

Reparto final: `service_role` solo para `refund_wallet_order` y para lecturas administrativas del servidor. Todo lo demás va por `auth.uid()`.

---

## Eventos — confirmaciones pedidas (punto 5)

`public.events_public` se define con `security_invoker = false` y una lista **explícita** de columnas: `id, name, game_id, event_type, prize, region, min_participants, max_participants, event_date, event_time, entry_price, currency, status, room_activated_at, entry_window_minutes, description, banner_url, created_at, finished_at`.

- No contiene `room_id` ni `room_password`, y al ser lista explícita no puede filtrarlas por ninguna consulta alternativa.
- `GRANT SELECT` únicamente; sin INSERT/UPDATE/DELETE, así que no abre ninguna vía de modificación (las vistas simples serían actualizables por defecto: se bloquea con `WITH (security_barrier)` y sin grants de escritura).
- `SELECT` directo sobre `events` queda revocado para `anon` y `authenticated`; solo admin y `service_role`.
- `enter_event_room()` queda como **única** vía de entrega de `room_id`/`room_password` al participante, y solo tras validar inscripción, sala activa, ventana de 15 minutos y cobro.

---

## H. Pruebas de verificación

1. Usuario nuevo → se crean perfil, wallet y rol `user`; referido aplicado si el código era válido, y con código inválido el alta **igual** se completa.
2. Anónimo llamando `review_deposit`, `refund_wallet_order`, `place_wallet_order`, `request_deposit_v2`, `claim_referral_reward` → rechazo en todos.
3. Usuario normal llamando funciones administrativas → rechazo.
4. `service_role` → ejecuta `refund_wallet_order` y nada más de lo administrativo.
5. Admin autenticado → aprueba un depósito de prueba y revisa un retiro correctamente.
6. Navegador leyendo `products` → no recibe `g2bulk_cost`.
7. Navegador leyendo `events` / `events_public` → no recibe `room_id` ni `room_password`; sí los recibe tras `enter_event_room` válido.
8. Credenciales de cuentas → invisibles para el vendedor, para cliente no autorizado y ausentes de logs; descifrado correcto solo para admin.
9. Dos compras simultáneas con la misma clave de idempotencia → una sola orden y un solo cobro.
10. Intento de dejar saldo negativo → rechazado por el CHECK.
11. `held_balance` = 0 en wallets existentes y nuevas.
12. Recorrido por navegador de recargas, wallet, comercio, eventos y panel; y compilación limpia.

---

## I. Riesgos

| Cambio | Riesgo | Mitigación |
|---|---|---|
| Trigger de registro | un fallo real bloquea las altas | tolerancia limitada a `foreign_key_violation`/`unique_violation` en referidos; el resto se propaga y se ve |
| Guardas de identidad | romper la llamada del servidor a `place_wallet_order` | se cambia esa llamada a `context.supabase` en el mismo paso y se prueba una compra completa |
| REVOKE de EXECUTE | quedarse sin permiso en alguna función usada | inventario función por función ya hecho; pruebas 2-5 |
| Índice de idempotencia | claves repetidas previas | comprobado: 0 órdenes |
| CHECK de saldo | saldos negativos previos | comprobado: 0 wallets |
| `held_balance` | ninguno | columna aditiva con valor por defecto; nadie la lee |
| Vista de eventos | pantallas que esperaban los campos | se ajustan las dos pantallas en el mismo paso |
| Coste oculto | panel de productos sin coste | `listProductsAdmin` pasa a leer en servidor con rol privilegiado |
| Cifrado | clave mal ubicada o pérdida de acceso | columnas en claro se conservan; nada destructivo hasta verificar |

## J. Rollback

**Advertencia expresa (punto 7):** el baseline refleja el estado **vulnerable** anterior. Revertir cualquiera de las migraciones 2, 3, 6, 7 o 9 **reintroduce las vulnerabilidades de la auditoría** (llamadas anónimas a funciones de dinero, contraseña de sala pública, coste interno visible). No es una operación rutinaria: debe ser una decisión consciente, puntual y acompañada de la corrección del motivo por el que se revierte.

Reversión segura por migración:
- Trigger: `DROP TRIGGER on_auth_user_created` — sin riesgo de seguridad, pero vuelve a romper el alta de usuarios.
- Índice, CHECK, columna `held_balance`, tabla `audit_log`, columnas cifradas: `DROP` limpio, sin pérdida de datos, sin impacto de seguridad.
- Funciones y permisos: cada archivo incluye su bloque de reversión comentado con la advertencia anterior escrita en el propio SQL.
- Ninguna migración de esta fase borra datos, columnas existentes ni usuarios, así que en todos los casos la reversión es posible sin pérdida.

## Qué NO modificaré

Flujo y pantallas de autenticación; lógica de retiros (`request_withdrawal`, `review_withdrawal`); finanzas, fondos, solicitudes de cuentas, eventos y configuración completos; Realtime; integración G2Bulk; notificaciones masivas; el archivo baseline; datos de catálogo, precios ni configuración de pagos; usuarios existentes; y las policies que la auditoría marcó como correctas.
