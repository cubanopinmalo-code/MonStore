# Fase 0.5 — Endurecimiento y corrección del backend

Objetivo: dejar el backend estructuralmente seguro y portable, sin añadir funcionalidades de Fase 1. Todo queda versionado en migraciones nuevas; el baseline no se toca.

## A. Migraciones que crearé (en este orden)

1. `20260913_0501_auth_user_trigger.sql` — trigger de creación de usuario
2. `20260913_0502_secure_definer_functions.sql` — validación de identidad en funciones
3. `20260913_0503_function_execute_grants.sql` — permisos de ejecución (EXECUTE)
4. `20260913_0504_orders_idempotency.sql` — índice único de idempotencia
5. `20260913_0505_wallet_balance_guard.sql` — saldo no negativo + fondos retenidos
6. `20260913_0506_events_private_room.sql` — sala de evento privada
7. `20260913_0507_internal_cost_protection.sql` — coste interno no público
8. `20260913_0508_audit_log.sql` — estructura de auditoría (vacía, sin disparadores aún)

Fuera de migración, en el mismo turno: alta del administrador inicial (es dato, no esquema) y reparación del único usuario existente.

---

## 1. Autenticación

`handle_new_user()` ya es compatible con un trigger `AFTER INSERT ON auth.users FOR EACH ROW`: lee `NEW.raw_user_meta_data` (name, phone, referral_code), es `SECURITY DEFINER` con `search_path=public` y ya usa `ON CONFLICT DO NOTHING` en roles, wallets y referrals. Verificado también que ninguna otra lógica crea esos registros: ni server function ni frontend.

Cambios:
- Crear el trigger `on_auth_user_created`.
- Endurecer la función sin cambiar su comportamiento: `ON CONFLICT (id) DO NOTHING` también en `profiles`, y envolver la parte de referidos en `EXCEPTION WHEN OTHERS THEN NULL` para que un código de referido inválido nunca impida el registro.
- No se toca nada de la pantalla de registro ni del flujo visual.

Reparación de datos: el usuario existente (`5351115040`, creado el 12/09) se queda sin tocar en `auth.users`; solo se le insertan su perfil, su wallet y su rol que faltan.

## 2. Administrador inicial

Identidad: el único usuario real de la base, teléfono **+5351115040** (`6fe051cc-…`), que es tu cuenta. No se crea ningún usuario nuevo.

Procedimiento: una única inserción de datos en `user_roles` (rol `admin`) para ese id, hecha desde el backend privilegiado. No existe ni existirá ninguna vía para que un cliente se asigne rol: las policies de `user_roles` ya solo permiten lectura del propio rol y escritura de administrador, y no se modifican.

## 3. SECURITY DEFINER — regla y resultado

Regla aplicada: `IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Debes iniciar sesión.'` como primera línea, y en las administrativas `IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION …`. Se elimina por completo el patrón `IF auth.uid() IS NOT NULL AND …`, que hoy deja pasar la llamada anónima.

| Función | Ejecuta | Auth | Admin | Parámetro de identidad | Validación tras el cambio |
|---|---|---|---|---|---|
| place_wallet_order | authenticated | sí | no | `p_user` | debe ser igual a `auth.uid()` |
| request_deposit | authenticated | sí | no | `p_user` | igual a `auth.uid()` |
| request_deposit_v2 | authenticated | sí | no | `p_user` | igual a `auth.uid()` |
| claim_referral_reward | authenticated | sí | no | `p_user` | igual a `auth.uid()` |
| review_deposit | authenticated | sí | **sí** | `p_admin` | igual a `auth.uid()` **y** admin |
| refund_wallet_order | authenticated + service_role | sí | **sí** | — | admin (o llamada del backend) |
| review_withdrawal | authenticated | sí | sí | — | ya correcta, se refuerza |
| review_game_account | authenticated | sí | sí | — | ya correcta |
| release_payment_line | authenticated | sí | sí | — | ya correcta |
| request_withdrawal | authenticated | sí | no | — | ya usa `auth.uid()` |
| publish_game_account | authenticated | sí | no | — | ya correcta |
| subscribe_event / enter_event_room | authenticated | sí | no | — | ya correctas |
| set_display_currency | authenticated | sí | no | — | ya correcta |
| event_participant_counts / top_recharged_games | anon + authenticated | no | no | — | solo agregados públicos, sin cambio |
| has_role / update_updated_at_column / keep_profile_phone | interno | — | — | — | sin cambio |

Matiz importante: `place_wallet_order` y `refund_wallet_order` hoy se invocan desde el servidor con la clave de servicio (`supabaseAdmin`), donde `auth.uid()` es NULL. Para no romperlas, ambas aceptarán además la llamada explícita de `service_role` (`current_setting('role')`), que solo el backend puede usar; el cliente nunca la tiene.

## 4. EXECUTE de funciones

- `REVOKE EXECUTE … FROM PUBLIC, anon` en las 16 funciones sensibles.
- `GRANT EXECUTE … TO authenticated` en las de usuario y administrador.
- `GRANT EXECUTE … TO service_role` en `place_wallet_order`, `refund_wallet_order`, `review_deposit`, `review_withdrawal`, `release_payment_line` (las que el backend necesita).
- Se mantiene `anon` solo en `event_participant_counts` y `top_recharged_games`.
- `handle_new_user`, `keep_profile_phone`, `update_updated_at_column`: revocadas de PUBLIC (se ejecutan como triggers, no necesitan permiso).

## 5. Idempotencia de órdenes

`CREATE UNIQUE INDEX CONCURRENTLY`-equivalente (índice único parcial, `WHERE idempotency_key IS NOT NULL`) sobre `orders.idempotency_key`. Comprobaré antes que no haya duplicados (hoy la tabla tiene 0 filas).

Además, en `place_wallet_order` el `SELECT` previo se sustituye por `INSERT … ON CONFLICT (idempotency_key) DO NOTHING RETURNING id`: si no devuelve fila, la orden ya existía y se devuelve la anterior sin cobrar. Con eso dos llamadas simultáneas no pueden cobrar dos veces, incluso en el mismo milisegundo.

## 6. Protección del saldo

Antes de aplicar comprobaré que no haya wallets con saldo negativo (hoy hay 0 wallets, así que es seguro). Añadiré `CHECK (balance >= 0)` en `wallets`. No rompe nada: todas las funciones ya impiden dejar el saldo por debajo de cero; el CHECK es la red de seguridad de último recurso.

## 7. Fondos retenidos (held balance)

Solo estructura, sin flujo:
- Nueva columna `wallets.held_balance numeric NOT NULL DEFAULT 0` con `CHECK (held_balance >= 0)`.
- `CHECK (balance >= held_balance)` para que lo retenido nunca supere el saldo.
- Los retiros futuros funcionarán así: al solicitar, se mueve el importe de disponible a retenido en la misma transacción; al rechazar, se libera; al completar, se descuenta definitivamente. La atomicidad la da el `FOR UPDATE` sobre la wallet que ya usan las funciones.
- En esta fase **no** se cambia `request_withdrawal` ni `review_withdrawal`: siguen operando solo sobre `balance`, y `held_balance` queda en 0. Es aditivo y no rompe la app actual.

## 8. Credenciales de cuentas

Diseño, sin migración destructiva ahora:
- Hoy `game_account_secrets` ya está fuera del alcance del cliente: lectura exclusiva de administrador, el vendedor solo puede insertar, y ninguna función devuelve esas columnas. Eso se mantiene.
- Refuerzo inmediato en esta fase: `REVOKE ALL … FROM anon` sobre esa tabla y quitar el `SELECT` de `authenticated` (queda solo vía policy de admin), de forma que ni un error futuro de policy la exponga.
- Cifrado: se hará con `pgsodium`/Vault mediante dos funciones `SECURITY DEFINER` (`store_account_secret`, `read_account_secret` restringida a admin) que cifran al escribir y descifran solo al leer con rol admin. Las columnas en claro se **conservan** hasta que el cifrado esté verificado; el borrado de las columnas antiguas será una migración posterior y aparte, nunca en el mismo paso.
- Las credenciales no se escriben en logs: ninguna función las imprime ni las devuelve en su JSON de retorno, y así se mantendrá.

## 9. Eventos — sala privada

- La policy `events_public_read` (`qual: true`, incluye anónimos) se reemplaza por una que excluye las credenciales: se crea la vista `public.events_public` con los campos públicos (nombre, juego, región, tipo, fecha, precio, premio, cupos, estado, progreso) y sin `room_id` ni `room_password`.
- El `SELECT` directo sobre `events` pasa a ser solo de administrador.
- Las credenciales se siguen entregando únicamente por `enter_event_room()`, que ya cobra y valida la ventana de acceso.
- Ajuste de código acompañante (mínimo, obligatorio para no romper la app): `src/hooks/useEvents.ts` deja de pedir `room_id`/`room_password` en la consulta pública y los toma del resultado de `enter_event_room`; `src/routes/_authenticated/app/eventos/$id.tsx` usa solo esa fuente. El panel de administración sigue igual.

## 10. Coste G2Bulk

- `REVOKE SELECT (g2bulk_cost) … FROM anon, authenticated` sobre `products`: el cliente deja de ver tu coste y tu margen; sigue recibiendo nombre, imagen, `sale_price`, moneda y disponibilidad.
- El panel de administración y la sincronización usan la clave de servicio, así que no se ven afectados. Verificado: los únicos consumidores de `g2bulk_cost` son `catalog.functions.ts` (servidor) y `admin/productos.tsx` (admin).

## 11. GRANTs — plan por etapas (sin ejecutar el recorte completo todavía)

Etapa 1 (esta fase, bajo riesgo): `REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER … FROM anon` en las 25 tablas. Hoy `anon` no tiene ninguna policy de escritura, así que no puede escribir: revocar el GRANT no cambia ningún comportamiento y elimina la red de seguridad ausente.

Etapa 2 (fase posterior, tras inventario de dependencias): `REVOKE DELETE FROM authenticated` y dejar `SELECT` en `anon` solo en `games`, `products`, `game_accounts`, `platform_settings` y la vista pública de eventos. Requiere repasar cada pantalla antes, por eso no entra aquí.

## 12. Auditoría

Se crea únicamente la estructura, sin disparadores todavía:
- Tabla `public.audit_log`: `id`, `actor_id`, `action`, `entity_type`, `entity_id`, `before jsonb`, `after jsonb`, `note`, `created_at`.
- RLS activado: lectura solo de administrador; **ninguna** policy de INSERT/UPDATE/DELETE, de modo que solo las funciones `SECURITY DEFINER` puedan escribir y nadie pueda alterar el histórico.
- GRANTs mínimos: `SELECT` a `authenticated` (filtrado por la policy de admin) y `ALL` a `service_role`.
- Los registros de cambios de rol, configuración, aprobaciones y acciones administrativas se conectarán en la Fase 1.

## 13. Migraciones

Ocho archivos nuevos con los nombres del apartado A. `00000000000000_monstore_baseline_schema.sql` queda intacto como referencia histórica.

## 14. Datos existentes

Confirmado antes de tocar nada: 1 usuario en `auth.users`, 0 perfiles, 0 wallets, 0 roles, 0 órdenes, 0 wallets con saldo. No hay nada que perder y ninguna migración de esta fase borra datos, columnas ni usuarios. El único cambio de datos es añadir el perfil, la wallet y el rol que le faltan a tu cuenta.

---

## G. Riesgos de cada cambio

| Cambio | Riesgo | Mitigación |
|---|---|---|
| Trigger de registro | que un error en la función bloquee el alta de usuarios | `ON CONFLICT DO NOTHING` en todo y referidos en bloque tolerante a errores |
| Validación en funciones | romper las llamadas del servidor donde no hay sesión | se admite explícitamente `service_role` en las dos funciones que el backend invoca |
| REVOKE de EXECUTE | dejar sin permiso alguna función usada por el cliente | inventario función por función ya hecho; se prueba compra, depósito y publicación |
| Índice único de idempotencia | fallo si hubiese claves repetidas | se comprueba antes; hoy hay 0 órdenes |
| CHECK de saldo | fallo si hubiese saldo negativo | se comprueba antes; hoy hay 0 wallets |
| `held_balance` | ninguno: columna nueva con valor por defecto | aditiva, nadie la lee todavía |
| Sala de evento privada | pantalla de evento que espera esos campos | se ajustan las dos pantallas en el mismo paso |
| Coste oculto | panel de productos sin coste | el panel usa clave de servicio, no le afecta |
| REVOKE a anon | ninguno funcional | `anon` no tiene policies de escritura |

## H. Verificación

Tras aplicar: registro de un usuario de prueba comprobando que aparecen perfil, wallet y rol; intento de llamada anónima a `review_deposit` y `refund_wallet_order` (debe fallar); dos llamadas simultáneas de compra con la misma clave (debe crear una sola orden); intento de fijar saldo negativo (debe fallar); lectura de `events` y de `products.g2bulk_cost` desde el cliente (no debe devolver credenciales ni coste); recorrido por el navegador de recargas, wallet, comercio y eventos; y compilación limpia.

## I. Reversión

Cada migración lleva su bloque de reversión documentado en el propio archivo: el trigger se elimina con un `DROP TRIGGER`; las funciones se restauran con su definición actual, que ya está íntegra en el baseline; el índice y los CHECK se eliminan con `DROP`; las columnas nuevas (`held_balance`, `audit_log`) se eliminan sin afectar nada porque nadie las lee; los GRANTs se restauran reaplicando el bloque del baseline. Al ser todos cambios aditivos o de permisos, ninguno destruye datos, así que revertir es siempre posible.

## J. Qué NO modificaré

Flujo visual y pantallas de autenticación; lógica de negocio de compras, depósitos, retiros, eventos, comercio y referidos; el baseline; datos de catálogo, precios ni configuración de pagos; usuarios existentes; Realtime; integración G2Bulk; notificaciones; y las policies que la auditoría marcó como correctas (`user_roles`, `game_account_secrets`, `payment_line_events`, `wallet_transactions`, favoritos y preferencias).
