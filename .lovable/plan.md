# FASE 2A — Preparación técnica (solo lectura)

Todo lo de abajo es diseño y medición. **No se ejecutó ninguna escritura**: ni `INSERT`, `UPDATE`, `DELETE`, `ALTER`, `DROP`, ni RLS, buckets, Storage, usuarios o cambio de conexión.

## Hallazgo que simplifica el trabajo: el almacén de catálogo está vacío

Medido ahora en la base actual:

| Comprobación | Resultado |
|---|---|
| Objetos en el bucket `catalog` | **0** |
| Objetos en todos los buckets | 1 (un avatar) |
| Juegos con imagen como ruta de objeto | 0 |
| Juegos con imagen como URL externa | 249 |
| Juegos sin imagen | 137 |
| Ofertas con imagen | 0 (las 6.193 heredan la del juego) |

Es decir: **no hay archivos de catálogo que copiar**. Las portadas son enlaces externos del proveedor, que viajan como texto dentro de la fila. El riesgo de "rutas que dejan de resolver" que señalé en el dry run **no existe**. Los 137 juegos sin foto son los que ya muestran portada con iniciales en la app.

## Requisito 1 — Modelo de fondos (migraciones aditivas propuestas, no ejecutadas)

El canónico solo tiene `balance_lines` + `fund_requests` con `reference` y `proof_url`. Para no perder nada del flujo actual propongo esto, todo **aditivo**:

**1.1 Columnas nuevas en `public.fund_requests`** (todas anulables o con valor por defecto):

`payment_channel text`, `payment_submethod text`, `bank text`, `destination_id uuid` → `payment_destinations(id)`, `destination_value text`, `transaction_id text`, `sender_phone text`, `bonus_pct numeric(6,2) not null default 0`, `credited_amount_cup numeric(14,2)`, `flow_status text not null default 'pendiente'`, `approval_method text not null default 'manual'`, `payment_received_at timestamptz`, `line_number smallint`, `line_phone text`, `line_assigned_at timestamptz`, `line_released_at timestamptz`, `legacy_payload jsonb not null default '{}'`.

**1.2 Tabla nueva `public.payment_destinations`** — destinos editables desde el panel: `id`, `channel` (transfermóvil, EnZona, USDT, Zelle…), `bank`, `kind`, `label`, `description`, `destination_value`, `instructions`, `requires_transaction_id`, `requires_proof`, `requires_sender_phone`, `is_active`, `sort_order`, `created_at`, `updated_at`.

**1.3 Tabla nueva `public.payment_methods_config`** — por método: etiqueta, instrucciones, bonificación de depósito, comisión de retiro, conversión de retiro, campos de transferencia (`jsonb`), activo, orden.

**1.4 Tabla nueva `public.payment_line_events`** — auditoría de líneas: `id`, `balance_line_id`, `fund_request_id`, `user_id`, `actor_id`, `action` (asignada, liberada_manual, liberada_aprobacion, liberada_rechazo), `note`, `created_at`. Inmutable con el `deny_change()` que ya existe en el canónico.

**1.5 Columnas nuevas en `public.balance_lines`**: `line_number smallint`, `allow_reuse boolean not null default false`.

**Índices:** `fund_requests(destination_id)`, `fund_requests(balance_line_id, status)` parcial para pendientes sin liberar, `payment_destinations(is_active, sort_order)`, `payment_line_events(balance_line_id, created_at desc)`.

**RLS:**
- `payment_destinations` y `payment_methods_config`: `select` para `anon` y `authenticated` **solo de filas activas**; escritura solo `is_admin()`.
- `payment_line_events`: lectura solo `is_admin()`; escritura solo `service_role` (más el trigger de inmutabilidad).
- `fund_requests`: se mantiene tal cual (lectura propia o admin, inserción propia, sin `UPDATE` para clientes).

**Funciones necesarias** (todas `security definer`, `set search_path = public`):
- `request_fund(...)` — asigna línea con `for update skip locked`, respeta la reutilización configurada, calcula bonificación e importe acreditado, congela `settings_snapshot()`, registra el evento de línea y la notificación. Equivale a `request_deposit_v2`.
- `release_payment_line(fund_request_id, reason)` — liberación manual, solo admin.
- Las aprobaciones siguen usando las canónicas `admin_approve_fund_request` / `admin_reject_fund_request`, ampliadas para liberar la línea y registrar el evento.

## Requisito 2 — Configuración comercial

El canónico ya tiene `settings` (clave/valor numérico, RLS de solo-admin, `settings_snapshot()`). Propongo:

| Clave | Valor inicial | Unidad | Significado |
|---|---|---|---|
| `usd_base_cost_cup` | 1000 | CUP | costo base por USD |
| `profit_per_usd` | 150 | CUP | ganancia por USD (ya existe, hoy en 0) |
| `listing_fee_per_day` | 150 | CUP | publicación de cuenta por día |
| `mobile_balance_value` | 2.8 | CUP | conversión de saldo móvil (ya existe) |
| `allow_line_reuse` | 0 | 0/1 | reutilización de líneas |

`settings.value` es numérico, así que el **WhatsApp de soporte no cabe**: propongo añadir `settings.text_value text` (aditivo, anulable) para valores de texto.

Precio comercial: `price_cup = cost_usd × (usd_base_cost_cup + profit_per_usd)` = 1.150 CUP por USD hoy. Al cambiar a 1.200 + 200, todo cálculo posterior usa 1.400 sin tocar código.

**Separación de capas en `products`** (el canónico ya trae casi todo tras la migración 004):

| Capa | Columna | Quién escribe |
|---|---|---|
| Costo técnico del proveedor (USD) | `provider_metadata.cost_usd` | solo sincronización |
| Costo convertido a CUP | `provider_cost_cup` / `cost_cup` | solo sincronización |
| Precio comercial | `price_cup`, descuentos, fechas | solo administrador |
| Presentación | `is_active`, `is_featured`, `sort_order` | solo administrador |

La protección **ya está implementada** en el canónico: el trigger `products_guard_commercial` rechaza cualquier cambio de precio, descuento, fechas, activo, destacado u orden cuando la sesión está marcada como sincronización, y `sync_product_provider_data` (solo admin) escribe únicamente las columnas técnicas. Nuestro sincronizador actual, que sí pisa el precio, se reescribe para llamar a esa función.

## Requisito 3 — Snapshot financiero del pedido

Verificado en la tabla `orders` canónica: ya conserva de forma inmutable `game_name`, `product_name`, `unit_price_cup`, `total_cup`, `unit_cost_cup`, `total_cost_cup`, `quantity` y `settings_snapshot`, con `order_status_history` a prueba de cambios y una restricción que exige coherencia entre unitario, cantidad y total. Cambiar el producto después **no altera el pedido**.

Falta una sola cosa: el **costo del proveedor en USD**. Propuesta aditiva: `orders.provider_cost_usd numeric(14,4)` y `orders.provider_total_cost_usd numeric(14,4)`, rellenadas por `create_order` desde `provider_metadata.cost_usd`.

## Requisito 4 — Autenticación (documentado, sin tocar nada)

- **Usuario a migrar:** uno solo, teléfono 5351115040, correo interno `5351115040@telefono.monstore.cu`, con perfil, wallet (0 CUP) y roles admin + user.
- **Teléfono:** el canónico lo guarda en `profiles.phone` con índice único y con un trigger que impide que el propio usuario lo cambie. Se copia idéntico; el correo interno se deriva igual que hoy, así que el método de acceso no cambia.
- **Código de referido:** el canónico lo genera solo con un trigger al insertar el perfil. Para conservar el actual hay que **escribirlo explícitamente después del alta** (es un `UPDATE` de admin, permitido por su guarda). Si no se hace, los enlaces ya compartidos dejan de funcionar.
- **Roles:** su enum incluye `admin`, `moderator`, `user`; se insertan las dos filas mediante `admin_grant_role`.
- **Sin duplicados:** `profiles.phone` es único, `profiles.legacy_id` es único y `legacy_user_map` lleva índice único sobre el identificador antiguo. Una segunda pasada de la migración no crea un segundo usuario.
- **Login tras el cambio:** idéntico para el cliente (teléfono + contraseña). La contraseña es nueva, la defines tú al crear el usuario.
- **Sesión actual:** se pierde — el token pertenece al proyecto viejo. Con un solo usuario, basta volver a entrar. Conviene mostrar un aviso en pantalla el día del cambio.
- **Primer inicio de sesión en el canónico:** creas el usuario con contraseña temporal, entras, verificas que ves el panel (rol admin) y cambias la contraseña.
- **Recuperación de cuenta (posterior):** hoy no existe en ninguno de los dos. Propuesta para después de la convergencia: código de un solo uso por WhatsApp al teléfono registrado, validado en el servidor, con límite de intentos. No entra en esta migración.

## Requisito 5 — Storage

- Objetos actuales en `catalog`: **0**. Rutas a copiar: **ninguna**.
- Filas que dependen de rutas de objeto: **0** en `games` y **0** en `products`.
- 249 juegos apuntan a URLs externas del proveedor (se copian como texto, siguen funcionando); 137 no tienen imagen y usan la portada con iniciales de la app.
- Único objeto en todo el almacén: 1 avatar de perfil, en el bucket `avatars`.

Conclusión: **no hay migración de Storage que hacer**. Sí hay que crear los cuatro buckets privados en el canónico (`avatars`, `catalog`, `deposit-proofs`, `listings`) antes de que la app vuelva a subir archivos, y copiar ese único avatar. Nada de esto se ejecuta ahora.

## Requisito 6 — Reporte de catálogo (cifras a cuadrar tras la migración)

| Medida | Valor actual |
|---|---|
| Juegos | 386 |
| Ofertas | 6.193 |
| Ofertas `via_id` | 5.070 |
| Ofertas `codigo` (hoy marcadas `via_cuenta`) | 1.123 |
| Ofertas `via_cuenta` reales | 0 |
| Suma de `price_cup` | 293.721.871,45 CUP |
| Precio mínimo | 5,75 CUP |
| Precio máximo | 17.595.000,00 CUP |
| Suma de costo del proveedor | 255.413,65 USD |
| Costo mínimo / máximo | 0,0100 / 15.300,0000 USD |
| Juegos con al menos una oferta | 378 |
| Media de ofertas por juego | 16,4 |
| Máximo de ofertas en un juego | 547 (Legend of the Neverland NAEU) |

Los cinco juegos con más ofertas: Legend of the Neverland NAEU (547), Legend of the Phoenix (355), lds login (157), Solo Leveling Arise (146), Mobile Legends Exclusive (127). Tras la migración, **cada una de estas cifras debe coincidir exactamente**; cualquier diferencia detiene el proceso y dispara el rollback.

Comprobación aritmética de coherencia: 255.413,65 USD × 1.150 = 293.725.697,50 CUP frente a los 293.721.871,45 actuales — una diferencia del 0,0013 %, atribuible al redondeo a dos decimales por oferta. Confirma que los precios actuales sí salen de la base 1.150, y que **no hace falta recalcular nada**.

## Requisito 7 — Duplicados: propuesta de nombre y estado (sin aplicar)

| Nombre actual | Identificadores | Propuesta de nombre | Propuesta de estado |
|---|---|---|---|
| EAFC 24 (×2) | `fifa_futcoins_pc` / `fifa_futcoins_console` | "EAFC 24 PC" y "EAFC 24 Consola" | ambos activos |
| Honor of Kings (×2) | `hok` / `category:171` | conservar el de `hok`; el otro "Honor of Kings (catálogo)" | revisar y desactivar el de menor catálogo |
| Magic Chess Gogo (×2) | `magic_chess_gogo` / `magic_chest_gogo` | conservar el correcto; el segundo sin renombrar | desactivar el de la errata tras comparar ofertas |
| Valorant Indonesia (×2) | `valorant_id` / `category:155` | conservar el de juego | desactivar el de categoría |
| Valorant Malaysia (×2) | `valorant_my` / `category:152` | ídem | ídem |
| Valorant Philippines (×2) | `valorant_ph` / `category:157` | ídem | ídem |
| Yalla Ludo (×2) | `yalla_ludo` / `category:7` | ídem | ídem |

Se migran los 14 tal cual, sin fusionar, sin renombrar y sin desactivar. La decisión se toma después, desde el panel.

## Requisito 8 — Seguridad de lo nuevo

| Tabla nueva | Lectura | Escritura | RLS |
|---|---|---|---|
| payment_destinations | anon + authenticated (solo activas) | solo `is_admin()` | activada |
| payment_methods_config | anon + authenticated (solo activas) | solo `is_admin()` | activada |
| payment_line_events | solo `is_admin()` | solo `service_role` + inmutable | activada |
| legacy_user_map | nadie salvo `service_role` | `service_role` | activada, sin políticas |
| Columnas nuevas de fund_requests | heredan la política existente (propia o admin) | sin `UPDATE` para clientes | — |

Reglas transversales: toda función nueva será `security definer` con `set search_path = public`, comprobará `auth.uid() is not null`, y usará `is_admin()` / `has_role()` para lo administrativo — nunca `current_user` ni una comprobación en el navegador. Los cuatro buckets nacen privados, con URLs firmadas generadas en el servidor. Las credenciales de cuentas quedan sin acceso para `anon` y `authenticated`, alcanzables solo con clave de servicio y registradas en el log de accesos. El costo del proveedor no aparece en `products_public`. El precio comercial queda protegido por `products_guard_commercial`. Contra el doble cobro: `create_order` es idempotente por clave, `pay_order` por estado y `wallet_apply` por clave (`order-pay:<id>`), y `place_wallet_order` no se migra. Contra la doble entrega a G2Bulk: la clave de idempotencia hacia el proveedor se deriva del `order_code`, con `provider_attempts` y `provider_last_attempt_at` como tope de reintentos.

## Requisito 9 — Rollback real

- **Respaldo:** antes de la primera escritura, exportación completa del canónico (es pequeño) y export de las tablas del origen. El proyecto actual **no se toca en ningún momento**: la migración solo lee de él.
- **Identificar cada fila migrada:** el canónico tiene `legacy_id` en `games`, `products`, `profiles`, `wallets`, `wallet_transactions`, `fund_requests`, `withdrawal_requests`, `orders`, `referrals` y `account_listings`. Se escribe el identificador antiguo en todas. Deshacer = borrar las filas con `legacy_id` no nulo.
- **Evitar duplicados:** inserciones con `on conflict (legacy_id) do nothing`; `sku`, `slug` y `phone` son únicos. Repetir la migración es inofensivo.
- **Revertir la conexión:** devolver las dos variables de entorno y `config.toml` al proyecto actual. Es el paso más rápido y el que se usa ante cualquier problema grave.
- **30 días:** el proyecto actual queda congelado, sin escrituras, y no se borra hasta que tú lo digas.
- **Detectar migración parcial:** tras cada bloque, comparación de conteos y sumas contra la tabla del §6; si algo no cuadra, el proceso se detiene y no continúa al bloque siguiente.
- **Si falla Storage:** no bloquea nada (0 objetos de catálogo). Se reintenta el avatar aparte.
- **Si falla Auth:** se borra el usuario creado y su fila en `legacy_user_map`, y se reintenta; el catálogo ya migrado no se toca.
- **Si falla el catálogo:** borrar productos y juegos con `legacy_id` no nulo y repetir. Como la app sigue apuntando al proyecto viejo, el cliente no ve nada.
- **Si falla la integración de pedidos:** se detecta en pruebas, antes del cambio de conexión; no hay pedidos históricos en riesgo.

## Requisito 10 — Orden exacto de ejecución (Fase 2, pendiente de tu autorización)

1. Respaldo de ambos proyectos.
2. Migraciones aditivas en el canónico: fondos (§1), configuración (§2), snapshot USD del pedido (§3), `legacy_user_map`, favoritos, preferencia de moneda, provincia/municipio, plataformas por juego.
3. Validación del esquema: cada tabla, columna, índice, política y función esperada existe.
4. Storage: crear los cuatro buckets privados con sus políticas (sin objetos que copiar salvo 1 avatar).
5. Catálogo: 386 juegos, luego 6.193 ofertas, con `legacy_id`, `sku`, `topup_kind` y `price_cup` idéntico.
6. Usuario y autenticación: crear el usuario, forzar su código de referido, roles, perfil y wallet.
7. Configuración: claves de precios y métodos; **destinos y líneas de pago quedan vacíos** para que los cargues tú.
8. Adaptación del Customer App contra el canónico (sin cambiar todavía la conexión de producción).
9. Pruebas funcionales completas.
10. Validación cruzada de las cifras del §6.
11. Cambio de conexión.
12. Pruebas en producción: entrar, ver catálogo, crear y pagar un pedido de prueba, reembolsarlo.
13. Rollback disponible 30 días.

## Lo que necesito de ti para empezar la Fase 2

1. Autorización para las migraciones aditivas del canónico (paso 2) — son solo altas de tablas y columnas, sin borrar nada.
2. La contraseña inicial del usuario administrador en el canónico (o confirmación de que uses una temporal y la cambies al entrar).
3. Confirmación de los valores: 1.000 + 150 CUP por USD.

Me detengo aquí. Nada fue modificado.
