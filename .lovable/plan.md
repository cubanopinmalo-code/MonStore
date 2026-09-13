# DRY RUN — Convergencia Customer App → MonStore canónico

Fase 1 completada. **No se ejecutó ninguna escritura**: solo lecturas (`SELECT`) en la base actual y lectura del código y las migraciones del Panel Admin. Cero `INSERT`, `UPDATE`, `DELETE`, `ALTER`, `DROP`, cambios de RLS, Storage, usuarios o conexión.

## 0. Acceso al canónico: resuelto

Pude leer el proyecto **Admin Panel MonStore** desde el espacio de trabajo, con su `config.toml` apuntando a `nklgztbukgaoycuaryzk` y sus 10 migraciones + el esquema base. La comparación de abajo es contra ese esquema real, no contra una suposición. Aviso honesto: comparo contra **el esquema declarado en sus migraciones**; si alguien aplicó algo a mano en ese proyecto, no lo veo.

## 1. Comparación de esquema: origen vs canónico

Son **dos modelos de datos distintos**, no dos versiones del mismo. El canónico es más estricto (histórico inmutable, saldo solo por `wallet_apply`, pedidos con máquina de estados) y usa otros nombres, otros enums y otras unidades. La convergencia es una **traducción**, no una copia.

| Origen (actual) | Destino canónico | Estado |
|---|---|---|
| profiles | profiles | parcial — faltan columnas |
| user_roles | user_roles | compatible |
| wallets | wallets | renombrado (`balance`→`balance_cup`, `held_balance`→`held_cup`) |
| wallet_transactions | wallet_transactions | tipo de movimiento con enum distinto |
| deposits | fund_requests | **muchas columnas sin destino** |
| withdrawals | withdrawal_requests | renombrado + enum distinto |
| payment_settings / payment_destinations / payment_line_events | — | **no existe equivalente** |
| payment_lines | balance_lines | parcial |
| platform_settings | settings (clave/valor) | parcial — `settings.value` es numérico |
| orders | orders + order_status_history | modelo nuevo (0 filas, sin copia) |
| api_transactions | columnas `provider_*` de orders | sin tabla propia |
| games | games | renombrado + restricciones nuevas |
| products | products | renombrado + **unidad de costo distinta** |
| events / event_subscriptions | events / event_rooms / event_participants / event_results | modelo distinto (0 filas) |
| game_accounts | account_listings | parcial |
| game_account_secrets | account_credentials | **cifrado distinto** (AES-GCM en backend vs PGP en base) |
| notifications | notifications | renombrado (`message`→`body`, `type`→`category`) |
| referrals | referrals | renombrado, compatible |
| user_favorite_games | — | **no existe** |
| user_currency_prefs | — | **no existe** |
| audit_log | audit_log | forma distinta (0 filas) |

## 2. Incompatibilidades concretas (tipos, enums, unidades)

1. **Costo del proveedor: USD vs CUP.** Hoy `products.g2bulk_cost` está **en USD**. En el canónico `cost_cup` y `provider_cost_cup` son **CUP**. Convertir sin más perdería el dato original. Propuesta: guardar el USD íntegro en `provider_metadata.cost_usd` y calcular `cost_cup` con la configuración comercial. `price_cup` se copia sin tocar (requisito A3).
2. **`payment_method`**: origen `wallet, saldo_movil, tarjeta_cup, usdt, zelle`; canónico `saldo, tarjeta, monedero, usdt, zelle`. Mapa: `saldo_movil→saldo`, `tarjeta_cup→tarjeta`, transfermóvil/EnZona→`monedero`, `usdt→usdt`, `zelle→zelle`. `wallet` no tiene destino (y no se usa en solicitudes).
3. **`request_status`**: `pendiente/aprobado/rechazado` → `pending/approved/rejected` (el canónico añade `in_review`, `cancelled`).
4. **Movimientos de wallet**: hoy `type` es texto libre (`compra, deposito, reembolso, retiro, premio, publicacion, evento`); el canónico usa el enum `wallet_tx_type` (`purchase, deposit, refund, withdrawal_*, prize, adjustment, event_fee`). `publicacion` no tiene equivalente → `adjustment` con nota. Además el canónico **no guarda `balance_before`** (solo `balance_after`).
5. **`settings.value` es `numeric`**: `support_whatsapp` (texto) **no cabe**. Necesita una columna de texto o una tabla aparte. `allow_line_reuse` (booleano) cabe como 0/1.
6. **`games.slug`** exige el patrón `^[a-z0-9][a-z0-9-]*$`. Verificado en origen: **los 386 slugs cumplen**, sin duplicados.
7. **`products.sku` es único** y `products.fields` debe pasar el validador de esquema. Propuesta: `sku = 'g2bulk:' || g2bulk_product_id` (verificado: 0 duplicados, 0 vacíos).
8. **`products.region`** es obligatorio en el canónico y no existe en origen → `global` por defecto.
9. **`games.platforms[]`** (comercio de cuentas) no tiene columna destino → `internal_notes` o `fields`.
10. **`profiles`**: provincia y municipio **no existen** en el canónico. `name` → `full_name`, `avatar` → `avatar_url`, `referred_by` → tabla `referrals`.
11. **Credenciales del comercio**: el canónico cifra en el backend (AES-256-GCM, `ciphertext` texto) y **no** con el trigger PGP actual. Nuestro cifrado no se migra: se adopta el suyo.

## 3. Mapeo exacto y conteos esperados (antes → después)

| Tabla origen | Filas | Destino | Filas esperadas | Nota |
|---|---|---|---|---|
| games | 386 | games | 386 | `g2bulk_id`→`provider_game_id`, `provider='g2bulk'`, `active`→`is_active`, `id` antiguo en `legacy_id` |
| products | 6.193 | products | 6.193 | `sale_price`→`price_cup` **sin recálculo**; `delivery_method`→`topup_kind`; USD a `provider_metadata` |
| profiles | 1 | profiles | 1 | provincia/municipio pendientes de destino |
| user_roles | 2 | user_roles | 2 | admin + user |
| wallets | 1 | wallets | 1 | saldo 0 = 0 |
| user_favorite_games | 2 | — | 2 en riesgo | sin tabla destino |
| platform_settings | 1 fila / 6 valores | settings | 6 claves | ver §7 |
| payment_settings | 4 | — | 0 | sin destino; el flujo de fondos depende de esto |
| payment_lines | 3 | balance_lines | **0 (excluidas)** | datos de ejemplo, no se migran (A7) |
| payment_destinations | 5 | — | **0 (excluidas)** | ídem |
| wallet_transactions, deposits, withdrawals, orders, api_transactions, notifications, referrals, events, event_subscriptions, game_accounts, game_account_secrets, payment_line_events, user_currency_prefs, audit_log | 0 | correspondiente | 0 | nada que copiar |

Total a escribir en la migración real: **6.582 filas** (386 + 6.193 + 3) más 6 claves de configuración.

## 4. Diagnóstico completo del catálogo (ejecutado, solo lectura)

| Comprobación | Resultado |
|---|---|
| Juegos / ofertas | 386 / 6.193 |
| Ofertas sin método de entrega | 0 |
| Ofertas sin `g2bulk_product_id` | 0 |
| `g2bulk_product_id` duplicados | 0 |
| Precio 0 o negativo | 0 |
| Precio por debajo del costo | 0 |
| Costo 0 | 0 |
| Slugs de juego duplicados | 0 |
| Slugs que no cumplen el patrón canónico | 0 |
| Juegos sin `g2bulk_id` | 4 |
| Juegos sin ninguna oferta | 8 |
| Juegos duplicados por nombre | 7 pares |

**Clasificación propuesta (sin aplicar):** 5.070 → `via_id`; 1.123 → `codigo`; 0 → `via_cuenta`. Respaldo: las 1.123 tienen todas identificador de producto del proveedor, es decir son automáticas. El enum canónico ya admite `codigo` (migración 004) y los pedidos aceptan `via_id` y `codigo`.

**7 pares duplicados por nombre** — dos filas distintas del proveedor, no un error de datos:

| Nombre | Identificadores del proveedor | Recomendación |
|---|---|---|
| EAFC 24 | `fifa_futcoins_pc` / `fifa_futcoins_console` | migrar ambos y **renombrar** a "EAFC 24 PC" y "EAFC 24 Console" |
| Honor of Kings | `category:171` / `hok` | migrar ambos; comparar ofertas y desactivar el más pobre |
| Magic Chess Gogo | `magic_chess_gogo` / `magic_chest_gogo` | el segundo es una errata del proveedor; migrar ambos y desactivar el duplicado tras comparar ofertas |
| Valorant Indonesia | `category:155` / `valorant_id` | migrar ambos; desactivar el de categoría |
| Valorant Malaysia | `category:152` / `valorant_my` | ídem |
| Valorant Philippines | `category:157` / `valorant_ph` | ídem |
| Yalla Ludo | `yalla_ludo` / `category:7` | ídem |

En todos los casos: **migrar los dos, no fusionar durante la copia** (fusionar podría perder ofertas). La limpieza se hace después desde el panel, con datos a la vista.

**4 juegos internos sin proveedor** (creados a mano para el comercio de cuentas, 0 ofertas): Free Fire, Call of Duty, DLS26, Neo Monster → migrar con `provider = null`, excluidos de la sincronización.

**4 juegos del proveedor sin ofertas**: League of Legends Instant, One Punch Man World, RF Online NEXT, Valorant → migrar y resincronizar; si siguen vacíos, `is_active = false`.

## 5. Storage

El canónico **no define ningún bucket** en sus migraciones: hay que crear los cuatro (`avatars`, `catalog`, `deposit-proofs`, `listings`) como privados con las mismas políticas antes de copiar catálogo. Las portadas se guardan como **ruta de objeto**, no URL, y se firman a 1 hora desde el servidor; si se copian los objetos **conservando la ruta exacta**, ninguna fila necesita reescritura. Hoy no hay avatares, comprobantes ni fotos de publicaciones (0 filas), así que solo migra el contenido de `catalog`.

## 6. Usuario y autenticación

Un solo usuario: `5351115040@telefono.monstore.cu`, con perfil, wallet y roles admin+user. No se copian contraseñas. Estrategia: crear el usuario en el canónico (su `handle_new_user` ya crea perfil, wallet y rol `user` automáticamente), anotar la equivalencia en `legacy_user_map` y volcar las columnas propias. Diferencias a tener en cuenta: el canónico usa `profiles.phone` único, genera su propio `referral_code` con trigger (hay que **forzar el actual** para no romper enlaces compartidos) y bloquea que el usuario cambie teléfono, estado o código. Duplicados imposibles: `phone` es único y `legacy_id` también.

## 7. Configuración de precios

El canónico ya trae `settings` clave/valor administrable con RLS de solo-admin y `settings_snapshot()` que congela los valores en cada operación — exactamente lo que pediste en A1 y A4. Claves existentes: `usdt_value`, `mobile_balance_value`, `profit_per_usd` (=ganancia por USD), `withdrawal_commission_pct`, `account_trade_commission_pct`.

**Falta la clave del costo base por USD.** Propuesta: añadir `usd_base_cost_cup = 1000` y fijar `profit_per_usd = 150` → 1.150 CUP por USD, todo editable desde el panel. Faltan también `listing_fee_per_day` y un lugar de texto para el WhatsApp de soporte.

Protección comercial (A2): **ya resuelta en el canónico**. El trigger `products_guard_commercial` impide que la sincronización toque precio, descuento, fechas, activo, destacado y orden, y `sync_product_provider_data` (solo admin) escribe únicamente costo, disponibilidad, identificadores y metadatos técnicos. Nuestro sincronizador actual, que sí pisa precio, debe reescribirse para llamar a esa función.

## 8. Pedidos y riesgo de doble cobro

El canónico ya implementa lo que pediste: `create_order` (sin cobrar, idempotente por clave) → `pay_order` (cobra por `wallet_apply`, no vuelve a cobrar si ya está pagado) → `admin_set_order_status` → `admin_refund_order`, con `order_status_history` inmutable, guarda de transiciones y bloqueo duro para que `via_cuenta` nunca genere pedido. **Snapshot congelado ya presente**: `game_name`, `product_name`, `unit_price_cup`, `total_cup`, `unit_cost_cup`, `total_cost_cup`, `quantity`, `settings_snapshot`. Único añadido recomendado: guardar también el costo en USD del proveedor dentro del snapshot.

Riesgos de doble cobro detectados:
1. **Convivencia de modelos**: si `place_wallet_order` siguiera accesible tras el cambio, un mismo pedido podría cobrarse dos veces. Mitigación: no migrar esa función; el canónico ni la tiene.
2. **Reintento de pago**: cubierto — `pay_order` es idempotente por estado y `wallet_apply` por clave (`order-pay:<id>`).
3. **Doble entrega del proveedor**: la clave de idempotencia hacia G2Bulk debe derivarse del `order_code` canónico, no de un UUID nuevo por intento.

## 9. Funciones y RPC: compatibilidad

| Actual | Canónica | Acción |
|---|---|---|
| place_wallet_order | create_order + pay_order | reemplazar |
| refund_wallet_order | admin_refund_order | reemplazar |
| request_deposit_v2 | insert en fund_requests | **adaptar con pérdida** (ver §10) |
| review_deposit | admin_approve/reject_fund_request | reemplazar |
| request_withdrawal | create_withdrawal_request | reemplazar |
| review_withdrawal | admin_complete/reject_withdrawal | reemplazar |
| release_payment_line | — | sin equivalente: **hay que crearlo o perder la gestión de líneas** |
| claim_referral_reward | — | sin equivalente: crear sobre `wallet_apply` + `referrals` |
| publish_game_account / review_game_account | account_listings + funciones de admin | adaptar |
| subscribe_event / enter_event_room | event_participants / get_event_room | reemplazar |
| read_account_credentials | backend con AES-GCM | reemplazar |
| top_recharged_games / event_participant_counts / set_display_currency | — | sin equivalente: recrear |
| has_role / handle_new_user / update_updated_at_column | iguales | conservar las canónicas |

## 10. Datos que podrían perderse (lista completa)

Ninguno se pierde hoy por volumen (0 filas), pero **la estructura sí se perdería** y con ella funciones visibles de la app:

1. **Flujo de agregar fondos completo**: `payment_settings`, `payment_destinations`, `payment_line_events` y las columnas de `deposits` (canal, submétodo, banco, destino, ID de transacción, número de origen, bonificación, importe acreditado, estado de flujo, método de aprobación, asignación y liberación de línea). El canónico solo tiene `balance_lines` + `reference` + `proof_url`. **Es la mayor brecha del proyecto**: sin ampliar el canónico, la pantalla de fondos actual no se puede reproducir.
2. Provincia y municipio del perfil.
3. Favoritos (`user_favorite_games`) y preferencia de moneda (`user_currency_prefs`).
4. `balance_before` de los movimientos.
5. Estado y moneda de la wallet (`status='activa'`, `currency`).
6. Plataformas de acceso por juego (comercio de cuentas).
7. WhatsApp de soporte y tarifa de publicación (no caben en `settings` numérico).
8. `api_transactions` como tabla propia (el canónico guarda la respuesta del proveedor dentro del pedido).

Todo esto requiere **migraciones aditivas en el canónico** (columnas y 3–4 tablas nuevas). No se tocan ahora; van en el paso 1 de la migración real, con tu aprobación.

## 11. Seguridad observada en el canónico

Mejor que la actual en casi todo: histórico inmutable (`deny_change`), saldo solo por `wallet_apply` con guarda de compuerta, `fund_requests` sin `UPDATE` para clientes, credenciales sin acceso para `anon`/`authenticated`, costo del producto fuera de las vistas públicas, pedidos de solo lectura para el cliente. Dos puntos a verificar al migrar: que los buckets nuevos nazcan privados, y que el rol de sincronización actúe siempre con `monstore.sync = 'on'` para que la guarda comercial se active.

## 12. Plan de migración real (para aprobar, no ejecutado)

1. **Ampliar el canónico** (aditivo): claves de precios (`usd_base_cost_cup`, `profit_per_usd`, tarifa de publicación, texto de soporte), columnas de `fund_requests` para el flujo cubano, tablas de destinos de pago y eventos de línea, favoritos, preferencia de moneda, provincia/municipio, plataformas por juego, `legacy_user_map`.
2. **Crear los 4 buckets** privados con sus políticas.
3. **Copiar Storage** (`catalog`) conservando rutas exactas.
4. **Copiar catálogo**: 386 juegos → 6.193 ofertas, con `legacy_id`, `sku`, `topup_kind` acordado y `price_cup` **idéntico**.
5. **Validar catálogo**: conteos, suma y mínimo de precios, 10 muestras, referencias del proveedor.
6. **Crear el usuario** y volcar perfil, roles, wallet (0) y favoritos vía `legacy_user_map`.
7. **Cargar configuración de precios** y dejar los datos de pago vacíos para que los cargues tú.
8. **Adaptar el Customer App**: vistas `games_public`/`products_public`, `create_order`+`pay_order`, funciones de fondos y retiros canónicas, sincronizador por `sync_product_provider_data`, pantalla `via_cuenta` por WhatsApp, y conectar la compra real (hoy sigue simulada).
9. **Pruebas integrales** contra el canónico sin cambiar la conexión de producción.
10. **Cambio de conexión** (`.env` + `config.toml`), con aviso de que hay que volver a iniciar sesión.
11. **Pruebas en producción**: entrar, ver catálogo, crear y pagar un pedido de prueba, reembolsarlo.
12. **Rollback**: revertir las dos variables de conexión al proyecto actual, que queda intacto y congelado 30 días. El canónico conserva `legacy_id` en cada fila, así que una segunda pasada nunca duplica.

## 13. Lo que necesito de ti para la Fase 2

1. Aprobación de la clasificación 5.070 `via_id` / 1.123 `codigo` / 0 `via_cuenta`.
2. Decisión sobre los 7 pares duplicados (mi recomendación: migrar todos, renombrar EAFC 24, revisar el resto después).
3. Autorización para las **migraciones aditivas** del §10 en el canónico — sin ellas se pierde el flujo de agregar fondos.
4. Confirmación de los valores iniciales: costo base 1.000 CUP y ganancia 150 CUP por USD.

Me detengo aquí. Nada fue modificado.
