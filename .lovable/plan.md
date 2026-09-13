# Plan de convergencia: Customer App → MonStore canónico

Informe de análisis. No se ejecuta ningún cambio: sin migraciones, sin copia de datos, sin tocar código, conexión, RLS, funciones, Storage ni usuarios.

## 0. Advertencia previa y hallazgo que cambia el tamaño del trabajo

1. **No tengo acceso al proyecto canónico `nklgztbukgaoycuaryzk`.** Este entorno solo puede leer la base actual (`yfimkckjhhvxkbkyxexd`). Todo lo que digo del canónico se apoya en la descripción de las migraciones 003/004 que me diste, no en una lectura directa. Antes de la Fase 2 hay que conectar ese proyecto (o pegarme su esquema) y re-verificar el mapa.
2. **El volumen real de datos vivos es mínimo.** Conteo verificado hoy:

| Tabla | Filas | Tabla | Filas |
|---|---|---|---|
| games | 386 | products | 6.193 |
| profiles | 1 | wallets | 1 |
| user_roles | 2 | user_favorite_games | 2 |
| payment_settings | 4 | payment_lines | 3 |
| payment_destinations | 5 | platform_settings | 1 |
| wallet_transactions, orders, api_transactions, deposits, withdrawals, notifications, referrals, events, event_subscriptions, game_accounts, game_account_secrets, payment_line_events, user_currency_prefs, audit_log | 0 | | |

Consecuencia: **no hay historial financiero ni comercial que preservar**. Lo único que migra de verdad es el catálogo (386 + 6.193), la configuración de pagos (13 filas) y 1 usuario administrador. Esto permite una migración mucho más barata que la planteada, sin `legacy_user_map` complejo ni reconciliación de saldos.

## 1. Mapa de migración (origen → destino → transformación → riesgo → validación)

| Origen | Filas | Destino canónico | Transformación | Riesgo | Validación |
|---|---|---|---|---|---|
| profiles | 1 | profiles | nuevo `id` de auth canónico; `username` (no existe hoy) = teléfono; conservar `referral_code`, provincia, municipio, avatar | bajo | fila existe y `referral_code` idéntico |
| user_roles | 2 | user_roles | remapear `user_id`; enum `app_role` debe coincidir | medio (enum distinto) | `has_role(uid,'admin')` = true |
| wallets | 1 | wallets | balance 0; recrear vacía, no copiar | nulo | balance canónico = balance origen |
| wallet_transactions | 0 | wallet_transactions / finance_entries | nada que copiar | nulo | conteo 0 = 0 |
| deposits | 0 | fund_requests | nada que copiar; mapear enums para el futuro | nulo | 0 = 0 |
| withdrawals | 0 | withdrawal_requests | ídem | nulo | 0 = 0 |
| payment_settings | 4 | equivalente canónico de métodos | copiar íntegro; `transfer_fields` jsonb | medio (columna faltante) | 4 métodos activos y visibles en la app |
| payment_lines | 3 | ídem | copiar; hoy son **números de ejemplo** | alto (datos falsos en producción) | confirmar contigo los reales antes de copiar |
| payment_destinations | 5 | ídem | copiar con `channel`/`kind`/`bank` | medio | 5 destinos, 1 inactivo |
| payment_line_events | 0 | ídem | — | nulo | — |
| platform_settings | 1 | settings canónico | copiar `usd_to_cup`, `usd_margin_cup`, `saldo_conversion_rate`, `listing_fee_per_day`, `allow_line_reuse`, `support_whatsapp` | alto si falta alguna columna → precios y comisiones mal | comparar valor a valor |
| orders / api_transactions | 0 | orders + order_status_history | no copiar; solo alinear flujo | nulo | — |
| games | 386 | games (+ vista games_public) | conservar `g2bulk_id`, `slug`, `image_url`, categoría, plataformas, `active` | medio (slug duplicado) | 386 = 386, sin slug repetido |
| products | 6.193 | products (+ products_public) | `delivery_method` → `topup_kind` (ver §6); conservar `g2bulk_product_id`, `g2bulk_cost`, `sale_price`, `metadata` | **alto** | 6.193 = 6.193; suma y mínimo de `sale_price` idénticos |
| events / event_subscriptions | 0 | events canónico | — | nulo | — |
| game_accounts / game_account_secrets | 0 | comercio canónico | no copiar; **replicar el cifrado** antes de admitir la primera fila | alto si se olvida | insertar prueba y comprobar que el texto plano no es legible |
| notifications | 0 | notifications | — | nulo | — |
| referrals | 0 | referrals | — | nulo | — |
| user_favorite_games | 2 | favoritos canónicos | remapear usuario y `game_id` | bajo | 2 = 2 |
| user_currency_prefs | 0 | — | — | nulo | — |
| audit_log | 0 | audit_log | — | nulo | — |

Columnas sin equivalente (no se borran): se conservan en una tabla `legacy_payload jsonb` por entidad, o como columna `metadata` cuando exista.

## 2. Usuarios y autenticación

Hay **un solo usuario real** (`5351115040@telefono.monstore.cu`, admin+user). No se copian contraseñas y no hace falta un mapa masivo.

Estrategia:
1. Crear el usuario en el canónico por el mismo camino que usa la app (teléfono → correo interno `<telefono>@telefono.monstore.cu`), con contraseña nueva definida por ti.
2. Tabla puente `legacy_user_map (legacy_user_id uuid, legacy_email text, new_user_id uuid, migrated_at)` — aunque tenga una fila, es lo que garantiza que perfil, wallet, favoritos y cualquier dato futuro se reasignen por clave y no a mano.
3. Anti-duplicados: índice único sobre `legacy_user_id` y sobre `legacy_email`; toda inserción de datos dependientes hace `join` contra el mapa y falla si no encuentra correspondencia (nunca inserta con `user_id` nulo).
4. El trigger de alta (`handle_new_user`) debe existir en el canónico **antes** de crear el usuario, o se quedará sin perfil/wallet/rol (ya nos pasó en esta base).
5. Pendiente aparte: hoy no existe recuperación de acceso. Recomiendo añadirla en el canónico antes de abrir a clientes.

## 3. Wallet

Campo a campo: `balance`, `held_balance`, `currency`, `status`, `created_at`, `updated_at`. Con 1 wallet en 0 CUP, se **recrea vacía**; no hay saldo que reconciliar.

Lo importante no es el dato sino la semántica: el modelo actual escribe saldo y movimiento dentro de la misma función (`place_wallet_order`, `review_deposit`…), mientras el canónico lo centraliza en `wallet_apply` + `finance_entries`. Regla de convergencia: **ninguna función vuelve a hacer `UPDATE wallets SET balance`**; todo pasa por `wallet_apply`, que escribe saldo y asiento en la misma transacción y conserva `balance_before`/`balance_after`. Las restricciones de no-negativo y de cobertura de `held_balance` deben replicarse en el canónico.

## 4. Depósitos y retiros

`deposits` → `fund_requests`, `withdrawals` → `withdrawal_requests`. Campos que deben sobrevivir aunque el canónico no los tenga con el mismo nombre: método, canal/submétodo, banco, destino y su valor, línea asignada (id, número, teléfono, asignada/liberada), ID de transacción, número de origen, URL del comprobante, importe, bonificación, importe acreditado, estado, `flow_status`, `approval_method`, motivo de rechazo, revisor, y todas las marcas de tiempo.

Sin equivalente directo → columna `legacy_payload jsonb` con el registro original completo. Nada se descarta.

La configuración de pagos (13 filas) sí se copia. **Bloqueante:** las 3 líneas y varios destinos contienen datos de ejemplo; hay que sustituirlos por los reales antes de copiar, no después.

## 5. Catálogo

Es el 99,9 % del volumen. Compatibilidad a revisar contra el canónico:

- `games`: `g2bulk_id`, `name`, `slug` (único), `image_url` (puede ser ruta del bucket `catalog` o URL externa), `description`, `category`, `platforms[]`, `active`.
- `products`: `game_id`, `g2bulk_product_id`, `name`, `description`, `image_url`, `g2bulk_cost`, `sale_price`, `currency`, `delivery_method`→`topup_kind`, `active`, `available`, `metadata` (incluye `fields` requeridos por juego), `last_synced_at`.
- Faltan hoy y aparecen en el canónico: precio promocional, fechas de promoción, destacado, orden de aparición, región explícita a nivel de oferta. Se rellenan con valores neutros (sin promoción, no destacado, orden por nombre), nunca con el precio de venta.
- Las imágenes son rutas del bucket privado firmado a 1 h: si el bucket cambia de proyecto, **las rutas dejan de resolver**. Ver §12.

Validación: 386/6.193, suma de `sale_price`, mínimo (5,75 CUP), y 10 ofertas al azar comparadas una a una.

## 6. Clasificación de productos

Propuesta: 5.070 `via_id` → `topup_kind='via_id'`; 1.123 `via_cuenta` → `topup_kind='codigo'`; `via_cuenta` real = 0 (se crea después, a mano, para las ofertas por WhatsApp).

Consulta de verificación (documentada, **no ejecutada como migración**):

```sql
select p.id, p.name, g.name as juego, p.delivery_method,
       p.g2bulk_product_id, g.g2bulk_id, p.sale_price, p.g2bulk_cost,
       case
         when p.delivery_method is null then 'sin_metodo'
         when coalesce(p.g2bulk_product_id,'') = '' then 'sin_product_id'
         when coalesce(g.g2bulk_id,'') = '' then 'juego_sin_g2bulk_id'
         when p.sale_price <= 0 or p.sale_price < p.g2bulk_cost then 'precio_inconsistente'
         when count(*) over (partition by p.game_id, lower(p.name)) > 1 then 'duplicado'
         else 'ok'
       end as diagnostico
from products p join games g on g.id = p.game_id
order by diagnostico, juego, p.name;
```

Resultado esperado según lo ya medido: 0 sin `g2bulk_product_id`, 0 huérfanos de juego; quedan por cuantificar duplicados por nombre y precios por debajo del coste. Ninguna reclasificación se aplica hasta revisar esa lista contigo.

## 7. Precios

Separación estricta:

- **Técnico (lo escribe G2Bulk):** `g2bulk_cost`, disponibilidad técnica, identificadores del proveedor, `last_synced_at`, campos requeridos.
- **Comercial (solo MonStore):** `sale_price`, precio promocional, fechas de promoción, `active`, destacado, orden.

Hoy la sincronización **sí pisa** `sale_price` y `available` en cada corrida. Corrección propuesta: el sincronizador hace `UPDATE` únicamente de las columnas técnicas; el precio comercial solo se calcula (coste USD × factor `usd_to_cup + usd_margin_cup` = 1150) cuando la oferta es **nueva**. Protección adicional en base de datos: trigger que rechace que el rol de sincronización modifique columnas comerciales.

Preservación durante la migración: `sale_price` se copia tal cual, y se compara suma y mínimo antes/después. Nunca se recalcula durante la copia.

## 8. Pedidos

Actual: `place_wallet_order` crea y cobra en un solo paso, con idempotencia por `idempotency_key` (índice parcial + `ON CONFLICT ... DO NOTHING`); `refund_wallet_order` solo `service_role`; `api_transactions` guarda petición/respuesta del proveedor.

Canónico: `create_order` → `pay_order` → procesamiento → G2Bulk → entrega, con `order_status_history`, `cancel_order`, `admin_set_order_status`, `admin_refund_order`.

Diseño de reemplazo:
1. `create_order` deja el pedido en `pendiente` sin tocar wallet; la clave de idempotencia se conserva en la creación, no en el cobro.
2. `pay_order` cobra vía `wallet_apply` y escribe historial; si ya está pagado, no vuelve a cobrar (idempotente por estado, no solo por clave).
3. Procesamiento y llamada al proveedor quedan en el servidor, con registro en `api_transactions`; fallo → `admin_refund_order`.
4. Regla dura: `topup_kind='via_cuenta'` no puede crear pedido ni mover wallet — comprobación dentro de `create_order` y restricción en la tabla.
5. Riesgo a vigilar: doble cobro si conviven ambos modelos. Mitigación: al activar el flujo nuevo se revoca `EXECUTE` de `place_wallet_order`.

## 9. G2Bulk

`src/lib/g2bulk.server.ts` es el único punto de contacto; la clave se lee de `process.env.G2BULK_API_KEY` dentro del servidor y viaja en la cabecera `X-API-Key`. **Se conserva íntegro** — no depende del proyecto de base de datos.

Se adapta: dónde escribe (tablas canónicas), la restricción de columnas técnicas de §7, y el punto de creación de pedidos (§8). La clave no se mueve al frontend ni a ninguna tabla legible.

## 10. Eventos

0 filas: no hay copia. Solo hay que verificar que el canónico tenga el equivalente de `events` con `room_id`/`room_password` **fuera del alcance público** (hoy resuelto con la vista `events_public`), la ventana de entrada en minutos, mínimos/máximos de participantes, precio de entrada, estado y banner; y que `event_subscriptions` mantenga la unicidad por evento+usuario y por identificador de cuenta.

## 11. Cuentas y credenciales

0 filas, pero la mecánica debe replicarse antes de abrir el comercio: esquema `private` sin permisos para anon/authenticated, clave maestra en `private.crypto_keys`, trigger que cifra con PGP al insertar/actualizar, y `read_account_credentials` como único camino de lectura, restringido a administradores.

Accesos: el vendedor ve su publicación pero **no** sus propias credenciales cifradas; el administrador las ve bajo demanda; después de la venta, la entrega se hace fuera de la tabla pública. Las fotos van al bucket privado `listings` con URL firmada.

## 12. Storage

| Bucket | Contenido | Lectura | Escritura | Borrado | Público |
|---|---|---|---|---|---|
| avatars | fotos de perfil | dueño (firmada) | dueño | dueño | no |
| catalog | portadas de juegos y ofertas | cualquiera vía URL firmada 1 h generada en servidor | solo servidor/admin | admin | no |
| deposit-proofs | capturas de pago | dueño y admin | dueño | admin | no |
| listings | fotos de cuentas en venta | firmada | vendedor | vendedor/admin | no |

Los cuatro deben crearse en el canónico con las mismas políticas **antes** de copiar catálogo, y los objetos copiarse conservando **exactamente la misma ruta**; así las columnas `image_url`/`avatar`/`images[]` siguen siendo válidas sin reescribir ni una fila. Si la ruta cambiara, haría falta un paso de reescritura masiva (evitable, y por eso lo evitamos).

## 13. Referidos

0 filas. Se conserva el modelo: `referrer_user_id`, `referred_user_id`, `status`, `reward_amount`, `created_at`, `reward_claimed_at`, y el código vive en `profiles.referral_code` (debe copiarse **idéntico**, o los enlaces ya compartidos dejan de funcionar). `claim_referral_reward` se adapta para acreditar vía `wallet_apply` en lugar de escribir la wallet directamente; mantiene el bloqueo de 10 referidos, la marca `reward_claimed_at` y la notificación.

## 14. Notificaciones

0 filas. Solo estructura: `user_id` remapeado por `legacy_user_map`, `title`, `message`, `type`, `read`, `created_at`. Regla: ninguna notificación se inserta con usuario sin correspondencia en el mapa.

## 15. Funciones y RPC

| Función actual | Canónica | Acción | Motivo |
|---|---|---|---|
| place_wallet_order | create_order + pay_order | reemplazar | separa creación de cobro; evita doble cargo |
| refund_wallet_order | admin_refund_order | reemplazar | el canónico registra historial y asiento |
| request_deposit_v2 | fund_requests | adaptar | conserva líneas, destinos y comprobante |
| review_deposit | aprobación de fund_requests | adaptar | acreditar vía wallet_apply |
| request_withdrawal | withdrawal_requests | adaptar | retención por held_balance |
| review_withdrawal | aprobación de withdrawal_requests | adaptar | devolución vía wallet_apply |
| release_payment_line | — | conservar | no tiene equivalente; lógica de líneas propia |
| claim_referral_reward | — | adaptar | acreditar vía wallet_apply |
| has_role | has_role | conservar | idéntica |
| handle_new_user | — | conservar | imprescindible antes de crear usuarios |
| read_account_credentials / encrypt_account_credentials | — | conservar | seguridad del comercio |
| publish_game_account, review_game_account | — | adaptar | cobro por wallet_apply |
| subscribe_event, enter_event_room | — | adaptar | ídem |
| top_recharged_games, event_participant_counts | — | conservar | solo lectura agregada |
| set_display_currency, keep_profile_phone, update_updated_at_column | — | conservar | utilidades |

## 16. RLS y seguridad

Revisión de la base actual y qué exigir en el canónico:

1. **Wallet:** no debe existir `UPDATE` directo para `authenticated`; solo funciones. Verificar en el canónico.
2. **Pedidos:** el cliente lee los suyos; no puede cambiar estado ni importe.
3. **Credenciales:** `game_account_secrets` sin lectura para nadie salvo la función definer.
4. **Coste del proveedor:** `g2bulk_cost` revocado a anon/authenticated (ya hecho aquí); replicar, y confirmar que `products_public` no lo expone.
5. **Datos de otros usuarios:** `wallet_transactions`, `notifications`, `referrals` se consultan hoy sin filtro explícito en el cliente y dependen solo de RLS. Recomiendo añadir el filtro por usuario también en la consulta, como defensa en profundidad.
6. **SECURITY DEFINER:** todas deben fijar `search_path`, usar `auth.uid()`/`auth.role()` (nunca `current_user`) y tener `EXECUTE` concedido solo al rol que corresponda; `refund_wallet_order` únicamente a `service_role`.
7. **RPC desde el navegador:** retiros y revisiones se invocan hoy desde el cliente. Propuesta: moverlos a funciones de servidor.

Ninguna de estas correcciones se aplica ahora.

## 17. Dry run

**Fase 1 (sin escritura).** Script de solo lectura que: extrae el esquema de ambos proyectos y los compara columna a columna; simula cada transformación en memoria; emite conteos origen/destino esperados; lista productos ambiguos (§6), slugs duplicados, precios bajo coste, filas sin correspondencia de usuario, columnas sin destino y objetos de Storage sin equivalente. Salida: un informe de diferencias que apruebas o rechazas. Cero `INSERT`/`UPDATE` en el canónico.

**Fase 2 (real), solo tras aprobar.** Respaldo completo del canónico y volcado del origen; copia por lotes en orden de dependencias; conteos antes/después por tabla; verificación de saldos (suma de wallets y de movimientos); verificación del usuario (login real); verificación de catálogo (386/6.193, suma y mínimo de precios, 10 muestras); verificación de referencias G2Bulk (ningún `g2bulk_product_id` perdido o duplicado).

## 18. Cambio de conexión

Momento exacto: **después** de la migración de datos, de la adaptación del código y de las pruebas integrales contra el canónico; **antes** de anunciar nada a clientes. Con 1 usuario y 0 pedidos, la ventana ideal es inmediata tras validar el dry run y la copia.

Cómo evitar cada fallo:
- *Pérdida de sesión:* inevitable — el token pertenece al proyecto viejo. Se asume: hay un solo usuario y se vuelve a entrar. Se avisa en pantalla.
- *Pérdida de saldo:* verificar saldo 0 = 0 antes del corte y congelar operaciones financieras durante la ventana.
- *Catálogo vacío:* no cambiar conexión hasta que el conteo en el canónico sea 386/6.193 y una pantalla de recargas real cargue contra él.
- *Pedidos rotos:* el flujo nuevo ya probado; `place_wallet_order` revocado.
- *Funciones inexistentes:* inventario previo: cada `supabase.rpc()` del código debe existir en el canónico con la misma firma. Lista cerrada antes del corte.
- *Errores de autenticación:* `handle_new_user` y su trigger creados de antemano; método de acceso por teléfono idéntico; rol admin comprobado.
- *Rollback:* basta revertir las variables de conexión al proyecto viejo, que queda intacto y en solo lectura durante 30 días.

## 19. Orden recomendado

1. Conectar/leer el canónico y verificar este mapa contra su esquema real.
2. Preparar el canónico: buckets, `private.crypto_keys` y cifrado, `handle_new_user` + trigger, GRANTs, RLS.
3. Confirmar los datos reales de pago (líneas, tarjetas, USDT, Zelle) — bloqueante.
4. Ejecutar la consulta de diagnóstico del catálogo y acordar la reclasificación.
5. Crear `legacy_user_map` y el usuario administrador en el canónico.
6. Dry run completo y revisión conjunta del informe de diferencias.
7. Copiar Storage con rutas idénticas, luego catálogo, luego configuración, luego usuario y sus dependencias.
8. Validación (conteos, saldos, precios, referencias G2Bulk).
9. Adaptar el Customer App: RPC canónicas, vistas públicas, flujo de pedidos en dos pasos, ofertas `via_cuenta` por WhatsApp, compra real (hoy sigue simulada en la pantalla de recargas).
10. Pruebas integrales contra el canónico desde una copia de la app.
11. Cambio de conexión y pruebas en producción.
12. Rollback disponible 30 días; el proyecto viejo queda congelado, no se borra.

---

# Anexo A — Enmiendas aprobadas (revisión del 13/09)

Incorporo tus 8 puntos. Sustituyen a lo dicho arriba donde haya diferencia.

**A1. Precios comerciales administrables.** La base de precios deja de estar en el código y vive en la configuración comercial de la base de datos, editable solo por administradores: `costo_base_cup_por_usd` (1.000) y `ganancia_cup_por_usd` (150) → 1.150 CUP por USD. Fórmula única: `precio_venta_CUP = costo_G2Bulk_USD × (costo_base + ganancia)`. Cambiar a 1.200 + 200 hace que todo cálculo posterior use 1.400 automáticamente, sin tocar código. El panel tendrá esos dos campos, con registro en auditoría de quién los cambia y cuándo.

**A2. G2Bulk no controla el precio.** La sincronización solo escribe: costo USD, disponibilidad técnica, identificadores, datos técnicos, campos requeridos, `last_synced_at`. Queda prohibida — por permisos de columna y por trigger, no solo por convención — de tocar precio de venta, margen, promoción, fechas de promoción, activo comercial, destacado y orden.

**A3. Precios durante la migración.** Se copia `sale_price` tal cual, sin recálculo. Verificación obligatoria antes/después: número de filas, suma total y precio mínimo idénticos. Ninguna recalculación masiva sin tu autorización explícita; la configuración nueva rige solo para cálculos y altas futuras.

**A4. Pedido con precio congelado.** Cada pedido guardará un snapshot inmutable: costo G2Bulk en USD, su equivalente en CUP, ganancia aplicada, precio de venta CUP, cantidad, producto, nombre del juego y la configuración comercial usada (los dos valores y su fecha). Cambiar la configuración después no altera ningún pedido histórico.

**A5. Diagnóstico del catálogo — resultados reales (solo lectura, ya ejecutado):**

| Comprobación | Resultado |
|---|---|
| Juegos | 386 |
| Ofertas | 6.193 |
| Ofertas sin método de entrega | 0 |
| Ofertas sin `g2bulk_product_id` | 0 |
| `g2bulk_product_id` duplicados | 0 |
| Ofertas con precio 0 o negativo | 0 |
| Ofertas con precio por debajo del costo | 0 |
| Ofertas con costo 0 | 0 |
| Slugs de juego duplicados | 0 |
| Juegos sin `g2bulk_id` | **4** |
| Juegos sin ninguna oferta | **8** |
| Juegos duplicados por nombre | **7 pares** |

Detalle de lo que hay que decidir antes de migrar:

- **4 juegos sin identificador del proveedor y sin ofertas:** Free Fire, Call of Duty, DLS26, Neo Monster. Son los 5 juegos del comercio de cuentas (creados a mano), no del proveedor. Propuesta: migrarlos marcados como juegos internos, no sincronizables.
- **4 juegos del proveedor sin ofertas:** League of Legends Instant, One Punch Man World, RF Online NEXT, Valorant. Propuesta: migrar y resincronizar; si siguen vacíos, desactivar.
- **7 juegos duplicados por nombre** (dos filas con el mismo nombre y distinto identificador del proveedor): EAFC 24 (PC / Console), Honor of Kings, Magic Chess Gogo, Valorant Indonesia, Valorant Malaysia, Valorant Philippines, Yalla Ludo. No son un error de datos: son entradas distintas del proveedor (categoría vs juego, o plataforma). Efecto visible: el cliente ve el mismo juego dos veces. Propuesta: **no fusionar durante la migración** (riesgo de perder ofertas); migrar tal cual y resolver después renombrando o desactivando el duplicado desde el panel. Decisión tuya.
- No hay ofertas duplicadas reales: las repeticiones de nombre que aparecían salen de esos juegos duplicados, no de ofertas repetidas dentro de un mismo juego.

**A6. Clasificación (propuesta, no ejecutada).** 5.070 → `via_id`; 1.123 → `codigo`; 0 → `via_cuenta`. El diagnóstico la respalda: las 1.123 tienen todas `g2bulk_product_id`, es decir son automáticas del proveedor, no atención manual. Queda pendiente de tu validación.

**A7. Datos de pago.** Las 3 líneas y los destinos de ejemplo **quedan fuera de la migración**. La estructura sí se prepara; las filas reales las cargas tú desde el panel. Esto no bloquea el resto.

**A8. Próximo paso autorizado: dry run de solo lectura.** Alcance exacto: comparar esquema origen vs canónico (tablas, columnas, tipos, dependencias), simular transformaciones, conteos origen/destino esperados, duplicados, inconsistencias de precios, referencias G2Bulk, Storage, usuario y dependencias, configuración de precios, columnas sin destino y datos en riesgo de pérdida. Sin `INSERT`, `UPDATE`, `DELETE`, `ALTER`, `DROP`, sin cambio de conexión y sin tocar RLS.

**Bloqueo actual del dry run:** este entorno **no tiene acceso al proyecto `nklgztbukgaoycuaryzk`**. La mitad de "origen" ya está hecha (arriba); la mitad de "canónico" es imposible hasta que me des acceso de lectura a ese proyecto o me pases el volcado de su esquema (`pg_dump --schema-only`). Dime cuál de las dos vías prefieres y entrego el dry run completo.

Nada se ha ejecutado más allá de consultas de lectura. Espero tu aprobación.

