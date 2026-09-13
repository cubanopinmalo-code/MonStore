# VALIDACIÓN FINAL READ-ONLY — previa a la Fase 2

No se ejecutó ninguna escritura: ni `INSERT`, `UPDATE`, `DELETE`, `ALTER`, `DROP`, ni buckets, usuarios, RLS, variables de entorno o cambio de conexión. Ninguna contraseña fue pedida, generada ni guardada. La clave de G2Bulk sigue solo en el servidor.

## 1. Proyecto destino — ADVERTENCIA DE ACCESO (léela antes que nada)

Confirmado por diseño: **todas** las escrituras de la Fase 2 van al canónico `nklgztbukgaoycuaryzk`, y `yfimkckjhhvxkbkyxexd` queda **solo como origen de lectura**, congelado, sin una sola escritura.

Pero hay un bloqueo real que debo decirte con claridad:

> **Desde este proyecto no tengo acceso de escritura al canónico `nklgztbukgaoycuaryzk`.**

Lo que sí tengo: lectura del **código y las migraciones** del proyecto "Admin Panel MonStore" de tu espacio de trabajo, que es donde vive ese backend. De ahí salió todo el análisis del esquema canónico.

Lo que **no** tengo: conexión de base de datos al canónico. Mis herramientas de base de datos apuntan exclusivamente a `yfimkckjhhvxkbkyxexd`. No puedo consultar sus filas reales, crear tablas, funciones, políticas, buckets ni usuarios allí.

Y no voy a usar el proyecto antiguo como sustituto, tal como pediste.

**Qué falta exactamente, y las dos únicas salidas:**

- **Opción A (recomendada):** ejecutar los pasos 2 a 7 de la Fase 2 **desde el proyecto Admin Panel**, que sí tiene ese backend conectado. Yo preparo aquí el SQL exacto, tú lo abres allí y yo lo aplico desde ese proyecto. Aquí, en el Customer App, solo se hará el paso 8 (adaptar la app) y el paso 11 (cambio de conexión).
- **Opción B:** conectar el canónico a este proyecto mediante el conector de Supabase externo. Requiere que autorices esa conexión; solo entonces podría escribir en él desde aquí.

Sin una de las dos, la Fase 2 no puede arrancar. Dime cuál eliges.

## 2. Fondos y pagos — esquema final corregido

Acepto tu objeción: nada de exponer las tablas completas.

**`payment_destinations`** (tabla base): RLS activada, **sin ninguna política de lectura para `anon` ni `authenticated`**. Solo `is_admin()` lee y escribe. Ningún `GRANT` a `anon`.

**Vista `payment_destinations_public`** (`security_invoker = off`, security barrier), la única que ve el cliente, con `where is_active` y **solo** estas columnas: `id`, `channel`, `bank`, `kind`, `label`, `description`, `destination_value`, `instructions`, `requires_transaction_id`, `requires_proof`, `requires_sender_phone`, `sort_order`. Quedan **fuera**: notas internas, límites, identificadores de proveedor, marcas de conciliación, `created_by`, `created_at`, `updated_at` y cualquier campo administrativo futuro.

**`payment_methods_config`** (tabla base): mismo criterio, solo admin. **Vista `payment_methods_public`** con `label`, `payment_method`, `instructions`, `deposit_bonus_pct`, `sort_order` y `transfer_fields_public`. El `jsonb` de configuración se **parte en dos**: `transfer_fields_public` (etiquetas de los campos que el cliente debe rellenar) y `admin_config` (comisiones internas, umbrales, conciliación) que **nunca** sale de la tabla base. La comisión de retiro y la conversión no se publican: el cliente ve el importe neto ya calculado por la función del servidor, no la fórmula.

## 3. `payment_line_events` — confirmado punto por punto

- El cliente **no puede insertar**: sin `GRANT INSERT`, sin política de inserción.
- El cliente **no puede modificar ni eliminar**: sin `GRANT`, sin políticas; además trigger `deny_change()` en `BEFORE UPDATE OR DELETE` que aborta siempre, incluso para admin.
- Solo generan eventos las funciones `SECURITY DEFINER` autorizadas (`request_fund`, `release_payment_line`, `admin_approve_fund_request`, `admin_reject_fund_request`).
- Inmutabilidad garantizada por el trigger, no solo por permisos.
- Todas esas funciones llevan `SET search_path = public` fijo.
- Todas comprueban `auth.uid() IS NOT NULL`; las administrativas exigen además `is_admin()` o `has_role(auth.uid(),'admin')`, nunca `current_user` ni una comprobación hecha en el navegador.
- Lectura: solo `is_admin()`.

## 4. Orden final de ejecución y dependencias

1. Respaldo completo de ambos proyectos.
2. Validación del esquema canónico (inventario real de tablas, funciones y políticas antes de tocar).
3. Migraciones estructurales aditivas: fondos, vistas públicas, configuración, `orders.provider_cost_usd`/`provider_total_cost_usd`, `legacy_user_map`, favoritos, preferencia de moneda, provincia/municipio, plataformas por juego, `settings.text_value`.
4. Auth y usuario administrativo (contraseña temporal, definida por ti fuera del proyecto).
5. Configuración: claves de precios y métodos de pago.
6. Storage: los cuatro buckets privados + el único avatar.
7. Catálogo: juegos y después ofertas.
8. Datos auxiliares: roles, favoritos, preferencia de moneda, referidos, notificaciones.
9. Adaptación del Customer App, todavía sin cambiar la conexión.
10. Pruebas completas en un entorno apuntando al canónico.
11. Validación de conteos y sumas.
12. Cambio de conexión.
13. Pruebas en producción.
14. Rollback disponible 30 días.

**Por qué Auth va antes que catálogo (cambio respecto a mi orden anterior):** en el canónico varias tablas llevan `created_by` con clave foránea a `auth.users` y valor por defecto `auth.uid()`. Si se insertan juegos, productos o ajustes sin que exista el usuario administrador, ese campo queda nulo o falla la clave foránea, y la auditoría del panel nace vacía. El encadenamiento real es: `auth.users` → `profiles` (`id` referencia `auth.users`, `phone` único) → `user_roles` (`user_id` → `auth.users`, y `is_admin()` depende de esta fila) → `wallets` (`user_id` único) → `settings` (sus triggers exigen `is_admin()`, así que **sin el rol admin las claves de precio no se pueden escribir**) → `games` → `products` (`game_id` → `games`, más `sku` único) → `orders` (`user_id`, `product_id`, `game_id`) → `order_status_history` (`order_id`) → `fund_requests` (`user_id`, `destination_id`, `balance_line_id`) → `payment_line_events` (`fund_request_id`, `balance_line_id`). Storage va antes que catálogo por si alguna fila futura referencia una ruta.

## 5. Catálogo — valores de referencia confirmados

Juegos 386 · Ofertas 6.193 · `via_id` 5.070 · `codigo` 1.123 · `via_cuenta` 0 · suma `price_cup` 293.721.871,45 CUP · suma costo proveedor 255.413,65 USD · mínimo 5,75 CUP · máximo 17.595.000,00 CUP · 378 juegos con ofertas. Los precios se **copian tal cual**, sin recalcular. Cualquier desviación tras la migración detiene el proceso.

## 6. Precios — arquitectura confirmada

`provider_metadata.cost_usd` (costo técnico, USD, sin pérdida de precisión) → `provider_cost_cup`/`cost_cup` (convertido) → `price_cup` (comercial) → ganancia = diferencia. Configuración `usd_base_cost_cup = 1000` y `profit_per_usd = 150` → 1.150 CUP por USD, editables desde el panel.

Confirmado en el código canónico: el trigger `products_guard_commercial` aborta cualquier cambio de `price_cup`, `discount_price_cup`, fechas de promoción, `is_active`, `is_featured` y `sort_order` cuando la sesión está marcada como sincronización (`monstore.sync = 'on'`), que es exactamente el modo en que corre `sync_product_provider_data`. Esa función solo escribe columnas técnicas. G2Bulk no tiene otra vía de entrada.

## 7. Pedidos — confirmado

`orders` sumará `provider_cost_usd` y `provider_total_cost_usd`, congelados al crear el pedido junto con `game_name`, `product_name`, `unit_price_cup`, `total_cup`, `unit_cost_cup`, `total_cost_cup`, `quantity` y `settings_snapshot`. `create_order` es idempotente por clave de cliente; `pay_order` por estado (solo avanza desde pendiente de pago); `wallet_apply` por clave única (`order-pay:<id>`); la llamada a G2Bulk usa clave derivada del `order_code`. `place_wallet_order` **no se migra y no coexistirá**: en el canónico no existe, y su `EXECUTE` queda revocado en el proyecto antiguo el día del cambio.

## 8. Auth — documentado, sin ejecutar

Usuario a migrar: uno, teléfono 5351115040, correo interno derivado del teléfono, roles admin y user. `auth.users.id` = `profiles.id` (1:1). Teléfono conservado en `profiles.phone` (único, con trigger que impide que el cliente lo cambie). `referral_code`: el canónico lo genera solo; hay que sobrescribirlo con el actual mediante una operación de admin, o los enlaces ya compartidos dejan de funcionar. Roles vía `admin_grant_role`. `legacy_user_map` (`legacy_user_id` único) más `profiles.phone` y `profiles.legacy_id` únicos hacen imposible el duplicado y permiten repetir la migración sin efecto. Contraseña: **temporal, la introduces tú directamente en el panel de autenticación del canónico y la cambias al primer inicio de sesión**; no la pido, no la genero y no queda en el código ni en la base. Recuperación de cuenta: diseño posterior, código de un solo uso por WhatsApp verificado en servidor.

## 9. Storage — confirmado

0 objetos en `catalog`, 1 avatar en total, 0 filas de `games`/`products` dependiendo de rutas de objeto. **No hay archivos de catálogo que migrar.** Las 249 portadas son URLs externas y se copian **como texto**, sin descargar ni duplicar; 137 juegos sin foto siguen con la portada de iniciales. Los cuatro buckets (`avatars`, `catalog`, `deposit-proofs`, `listings`) se crearán **privados**, con acceso por URL firmada generada en el servidor.

## 10. Matriz de seguridad final

| Tabla | Lect. anon | Lect. auth | Lect. admin | Escr. cliente | Escr. admin | Escr. service_role |
|---|---|---|---|---|---|---|
| profiles | no | propia | sí | propia (parcial) | sí | sí |
| wallets | no | propia | sí | **no** | vía función | sí |
| wallet_transactions | no | propias | sí | **no** | **no (inmutable)** | insert vía función |
| fund_requests | no | propias | sí | solo insert | vía función | sí |
| withdrawal_requests | no | propias | sí | solo insert | vía función | sí |
| payment_destinations | **no** (solo vista) | **no** (solo vista) | sí | no | sí | sí |
| payment_methods_config | **no** (solo vista) | **no** (solo vista) | sí | no | sí | sí |
| payment_line_events | no | no | sí | no | **no (inmutable)** | insert vía función |
| games | vista pública | vista pública | sí | no | sí | sí |
| products | vista pública sin costo | vista pública sin costo | sí | no | sí (comercial) | técnico vía función |
| orders | no | propios | sí | vía función | vía función | sí |
| order_status_history | no | propios | sí | **no** | **no (inmutable)** | insert vía trigger |
| account_listings | aprobadas | aprobadas + propias | sí | propias vía función | sí | sí |
| account_credentials | **no** | **no** | **no directo** | no | no | sí, con registro de acceso |
| events | vista pública sin sala | vista pública sin sala | sí | no | sí | sí |
| event_participants | no | propios | sí | vía función | sí | sí |
| event_rooms | **no** | solo inscrito y pagado, vía función | sí | no | sí | sí |
| event_results | sí | sí | sí | no | sí | sí |
| notifications | no | propias | sí | marcar leída | sí | sí |
| referrals | no | propios | sí | no | vía función | sí |
| audit_log | no | no | sí | **no** | **no** | insert vía función |
| finance_entries | no | **no** | sí | **no** | vía función | sí |

Confirmado además: las credenciales de cuentas nunca son públicas y cada lectura queda registrada; el costo de G2Bulk no aparece en ninguna vista pública; los asientos financieros no son legibles por clientes; `audit_log`, `order_status_history` y `wallet_transactions` son inmutables por trigger, no solo por permisos; toda función `SECURITY DEFINER` lleva `SET search_path = public`; todas las comprobaciones de autorización ocurren en el servidor; el frontend no decide ningún permiso.

## 11. Rollback — confirmado

Cada fila migrada lleva `legacy_id` (o su entrada en `legacy_user_map`). El origen permanece intacto: la migración solo lee de él. El proyecto antiguo queda congelado y sin borrar 30 días. La conexión se revierte devolviendo las variables de entorno y `config.toml`. La migración parcial se detecta comparando conteos y sumas tras cada bloque. Deshacer = borrar exclusivamente las filas con `legacy_id` no nulo; **ningún dato preexistente del canónico se toca**, y todas las inserciones usan `on conflict do nothing`.

## 12. Migraciones exactas a ejecutar (10)

1. `payment_destinations` + `payment_methods_config` + vistas públicas + RLS.
2. Columnas nuevas de `fund_requests` y `balance_lines`.
3. `payment_line_events` + trigger de inmutabilidad + RLS.
4. `request_fund`, `release_payment_line`, ampliación de las funciones de aprobación y rechazo.
5. `orders.provider_cost_usd` y `provider_total_cost_usd` + ajuste de `create_order`.
6. `settings.text_value` + claves iniciales de precios.
7. `legacy_user_map` + `legacy_id` donde falte.
8. `user_favorite_games` + `user_currency_prefs`.
9. `profiles.province`/`municipality` + `games.platforms`.
10. Índices y `GRANT` finales.

## 13. Pruebas obligatorias antes del cambio de conexión

Alta y acceso por teléfono · lectura del catálogo sin costos visibles · compra por ID con verificación fallida y correcta · compra de código con error del proveedor y reembolso · reintento con la misma clave de idempotencia (no debe duplicar cobro ni entrega) · depósito con y sin comprobante, con asignación y liberación de línea · aprobación y rechazo de depósito · retiro aprobado y rechazado · intento de leer datos de otro usuario (debe fallar) · intento de escribir precio desde la sincronización (debe abortar) · publicación de cuenta y lectura de credenciales solo por admin · cuadre final de las cifras del §5.

---

**Me detengo aquí. Nada fue modificado.** Necesito de ti: la elección entre la Opción A y la Opción B del §1. Sin acceso de escritura al canónico, la Fase 2 no puede comenzar.
