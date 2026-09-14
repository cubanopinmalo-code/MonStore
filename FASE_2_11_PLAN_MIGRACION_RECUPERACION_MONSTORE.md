# FASE 2.11 — Plan de migración y recuperación de MonStore

Fecha: 14/09/2026. Alcance: **solo lectura**. No se migró, copió, creó, modificó ni eliminó ninguna
tabla, política, función, permiso, dato, precio, archivo, usuario ni configuración. No se cambió la
conexión de la aplicación ni ninguna variable. No se conectó G2Bulk ni zdSMS. No se tocó el proyecto
antiguo. Ninguna operación de Git.

---

## 1. Estado del backend antiguo

### 1.1 Backends identificados

| | A — Antiguo | B — Canónico | C — Interno de Lovable |
| --- | --- | --- | --- |
| Project ID | `yfimkckjhhvxkbkyxexd` | `nklgztbukgaoycuaryzk` | `tvzbcqxgfoqvxzpjqwus` |
| URL | `https://yfimkckjhhvxkbkyxexd.supabase.co` | `https://nklgztbukgaoycuaryzk.supabase.co` | `https://tvzbcqxgfoqvxzpjqwus.supabase.co` |
| Uso | backend histórico (Fases 2.5–2.9.0.1) | destino definitivo | creado por la transferencia |
| Conectado al navegador | no | **no** | **sí** |
| Conectado al servidor | no | **no** | **sí** |
| Contiene datos | presuntamente sí (no verificable) | mínimos (1 usuario, 9 ajustes, 5 auditorías) | vacío |
| Auth | presuntamente sí | sí (1 usuario admin) | sí (0 usuarios) |
| Storage | presuntamente sí | 4 buckets, todos privados | buckets del código |
| Funciones/RPC | presuntamente sí | parcial (§2 del canónico) | las del repositorio |
| Configuración | presuntamente sí | sí (tabla `settings`) | por defecto |

No se detectó ningún otro backend ni servicio externo activo. zdSMS y G2Bulk siguen desconectados.

### 1.2 Accesibilidad real del antiguo

El dominio del antiguo **responde a nivel de red** (respuesta en ~0,10 s), pero **no existe ninguna
credencial suya** en este proyecto: los cinco secretos configurados pertenecen al canónico. Sin clave
publicable ni clave de servicio del antiguo no es posible leer una sola fila, ni enumerar tablas,
usuarios, buckets o funciones.

**Consecuencia:** el inventario del antiguo solicitado en los puntos 2, 5, 7–12 de esta fase **no pudo
ejecutarse**. Lo que sigue es lo que los informes de fases anteriores documentan, marcado como
*no verificado en esta fase*.

## 2. Estado del backend canónico (verificado)

37 objetos expuestos. Existen: `profiles`, `user_roles`, `wallets`, `wallet_transactions`,
`fund_requests`, `withdrawal_requests`, `finance_entries`, `games`, `products`, `orders`,
`order_status_history`, `events`, `event_participants`, `event_rooms`, `event_results`,
`event_notification_log`, `account_listings`, `account_credentials`, `account_sales`,
`credential_access_log`, `notifications`, `notification_campaigns`, `referrals`,
`user_favorite_games`, `user_currency_prefs`, `settings`, `audit_log`, `balance_lines`,
`blocked_users`, `payment_destinations`, `payment_methods_config`, `payment_line_events`,
**`legacy_user_map`**, y las vistas públicas `games_public`, `products_public`,
`payment_destinations_public`, `payment_methods_public`.

Contenido: 1 usuario (administrador, teléfono 5351115040), 1 perfil, 1 rol `admin`, 1 wallet,
9 ajustes, 5 registros de auditoría. **Todo lo demás está a 0.** Buckets: `avatars`, `catalog`,
`deposit-proofs`, `listings` — los cuatro privados. RLS activo; la clave publicable solo lee las
vistas públicas. Función `is_admin()` presente y ejecutable.

**Faltan, respecto a lo que el código de la aplicación usa hoy:** tablas `deposits`, `withdrawals`,
`platform_settings`, `payment_lines`, `payment_methods`, `otp_limits`, `otp_test_challenges`; y las
funciones `has_role`, `place_wallet_order`, `request_deposit`, `request_deposit_v2`,
`request_withdrawal`, `review_deposit`, `review_withdrawal`, `publish_game_account`,
`read_account_credentials`, `subscribe_event`, `enter_event_room`, `claim_referral_reward`,
`set_display_currency`, `event_participant_counts`, `top_recharged_games`, `wallet_apply`.

## 3. Inventario de datos antiguos

No verificable en esta fase (§1.2). Según informes previos el antiguo albergaba: 6.193 ofertas
(5.070 `via_id`, 1.123 `codigo`, 0 `via_cuenta`), suma de precios 293.721.871,45 CUP, juegos
asociados, perfiles/roles/wallets del piloto, y los buckets de avatares, catálogo, comprobantes y
publicaciones. **Cantidades exactas de usuarios, movimientos, órdenes, eventos y archivos:
desconocidas.**

## 4. Comparación de estructuras (antiguo/código ↔ canónico)

| Código actual | Canónico | Estado | Acción posterior |
| --- | --- | --- | --- |
| `profiles(name, phone, referral_code, referred_by, status, province, municipality)` | `profiles(full_name, phone, username, referral_code, status, province, municipality, is_blocked, legacy_id)` | EXISTE PERO DIFERENTE | renombrar `name→full_name`; no hay `referred_by` (la relación vive en `referrals`) |
| `user_roles(role app_role)` | `user_roles` | COINCIDE | verificar enum y crear `has_role` |
| `wallets(balance, held_balance, currency, status)` | `wallets(balance_cup, held_cup, legacy_id)` | REQUIERE TRANSFORMACIÓN | mapear importes; estado pasa a `blocked_users` |
| `wallet_transactions` | `wallet_transactions` + `finance_entries` | REQUIERE TRANSFORMACIÓN | movimiento del cliente vs. asiento financiero de la plataforma |
| `deposits` | `fund_requests` | REQUIERE TRANSFORMACIÓN | `credited_amount→amount_cup`, líneas → `balance_lines`, comprobante → `proof_url` |
| `withdrawals` | `withdrawal_requests` | REQUIERE TRANSFORMACIÓN | comisión/neto ya existen con otro nombre |
| `payment_lines` | `balance_lines` | REQUIERE RECONSTRUCCIÓN | líneas 1/2/3 se redefinen en el canónico |
| `payment_settings` / `payment_destinations` | `payment_methods_config` / `payment_destinations` | EXISTE PERO DIFERENTE | reconfigurar desde el panel, no migrar |
| `platform_settings` (fila única) | `settings` (clave/valor, 9 filas) | REQUIERE TRANSFORMACIÓN | convertir cada campo en una clave |
| `games` | `games(+provider, provider_game_id, legacy_id, is_active, sort_order)` | REQUIERE TRANSFORMACIÓN | `active→is_active`, `g2bulk_id→provider_game_id` |
| `products` | `products(+price_cup, discount_*, is_featured, sort_order, cost_cup, provider_cost_cup, provider_metadata, available, legacy_id)` | REQUIERE TRANSFORMACIÓN | `sale_price→price_cup`, `g2bulk_cost→provider_cost_cup`, `delivery_method→topup_kind` |
| `orders` | `orders(order_code, total_cup, provider_*, settings_snapshot, idempotency_key, legacy_id)` | REQUIERE TRANSFORMACIÓN | conservar código e idempotencia |
| — | `order_status_history` | EXISTE SOLO EN CANÓNICO | el código debe empezar a escribirlo |
| `event_subscriptions` | `event_participants` (+`event_rooms`, `event_results`) | REQUIERE TRANSFORMACIÓN | sala y resultados salen de `events` |
| `game_accounts` / `game_account_secrets` | `account_listings` / `account_credentials` (+`account_sales`, `credential_access_log`) | REQUIERE TRANSFORMACIÓN | cifrado y registro de accesos son del canónico |
| `notifications` | `notifications` (+`notification_campaigns`, `event_notification_log`) | COINCIDE | migrable tal cual |
| `referrals`, `user_favorite_games`, `user_currency_prefs` | idénticos | COINCIDE | migrables directamente |
| `audit_log` | `audit_log` (5 filas) | DEBE PRESERVARSE | añadir, nunca sobrescribir |
| `otp_limits`, `otp_test_challenges` | ausentes | EXISTE SOLO EN ANTIGUO | **deben crearse**: sin ellas no hay acceso por código |
| `api_transactions` | campos `provider_*` de `orders` | NO DEBE MIGRARSE | histórico técnico, se absorbe |
| — | `legacy_user_map` | EXISTE SOLO EN CANÓNICO | pieza clave de la migración de usuarios |
| `products` (filas) | 0 filas | DEBE GENERARSE DESDE G2BULK + DEBE PRESERVARSE (precios) | ver §16 |

## 5. Inventario de los 6.193 productos

Ubicación actual: **solo el backend antiguo**, hoy inaccesible desde este proyecto. El canónico tiene
0 juegos y 0 ofertas; el interno de Lovable también 0. No se pudo confirmar si siguen completos.

Separación de responsabilidades (ya soportada por el esquema del canónico):

- **Técnico del proveedor** — `provider`, `provider_game_id`, `provider_product_id`,
  `provider_cost_cup`, `cost_cup`, `available`, `provider_metadata`, `last_synced_at`.
- **Comercial de MonStore** — `price_cup`, `discount_price_cup`, `discount_starts_at`,
  `discount_ends_at`, `is_featured`, `sort_order`, `is_active`, `name`/`description` editados,
  `internal_notes`, `topup_kind`, `region`, `fields`.

Regla que debe mantenerse: G2Bulk escribe **solo** columnas técnicas; nunca `price_cup`, descuentos,
promociones, destacados ni orden.

## 6. Clasificación del catálogo

Conceptualmente confirmada y sin cambios: `via_id` (el cliente escribe su ID de jugador), `codigo`
(tarjetas/códigos automáticos del proveedor), `via_cuenta` (**exclusivamente** ofertas personalizadas
de MonStore gestionadas por WhatsApp) y `comercio` (marketplace de cuentas de usuarios, tabla
aparte). La Fase 2.8.3 dejó 5.070 `via_id` + 1.123 `codigo` + 0 `via_cuenta`: **ningún producto de
G2Bulk debe convertirse en `via_cuenta`**. No se modificó ningún registro.

## 7. Usuarios y Auth

Canónico: 1 usuario (identidad interna `5351115040@monstore.local`), 1 perfil, rol `admin`, 1 wallet.
Antiguo: cantidad desconocida. Nota importante: el código usa el dominio interno
`@telefono.monstore.cu` (`src/lib/phone.ts`), mientras el usuario existente en el canónico usa
`@monstore.local`. **Divergencia que rompería el acceso por teléfono** si no se unifica.

Estrategia de preservación: los UUID de `auth.users` no se pueden reutilizar sin exportación
administrativa del antiguo; por eso el canónico incluye `legacy_user_map`
(`legacy_user_id → user_id`, `legacy_phone`, `source_project`). Todo registro migrado guarda además
su `legacy_id`, de modo que órdenes, wallets, eventos y publicaciones se re-enlazan por el mapa y no
por coincidencia de UUID.

Riesgos de rotura: dominio de correo interno divergente, ausencia de `otp_limits`/`otp_test_challenges`,
ausencia de `has_role`, y teléfonos duplicados si se migra sin normalizar a 8 dígitos.

## 8. Wallet y finanzas

Modelo antiguo: `wallets(balance, held_balance)` + `wallet_transactions` + `deposits` + `withdrawals`
+ `payment_lines`. Modelo canónico: `wallets(balance_cup, held_cup)` + `wallet_transactions` +
`fund_requests` + `withdrawal_requests` + `finance_entries` + `balance_lines` + `payment_line_events`.

Preservación propuesta: migrar primero los movimientos históricos con su `legacy_id`, y **derivar** el
saldo final de la suma de movimientos, comparándolo con el saldo antiguo antes de fijarlo; los fondos
retenidos se recalculan desde solicitudes pendientes; las líneas 1/2/3 se reconfiguran en
`balance_lines` y no se copian. `finance_entries` registra el beneficio de la plataforma, que el
modelo antiguo no separaba: se generaría por conversión, no por copia. **Ninguna operación
financiera se ejecutó en esta fase.**

## 9. Eventos

Migrable con transformación: `events` (estado, precio de entrada, mínimos/máximos, premio, región),
`event_subscriptions → event_participants` (ID de personaje, cobro, entrada). Requiere
reconstrucción: sala (`room_id`/`room_password` pasan a `event_rooms`), ganadores y premios pagados
(`event_results`), y el registro de avisos (`event_notification_log`). Los cobros ya realizados se
migran como movimientos de wallet, nunca se re-cobran.

## 10. Comercio de cuentas

`game_accounts → account_listings` (mismo concepto: vendedor, juego, región, precio, imágenes,
estado, revisión). `game_account_secrets → account_credentials`: **las credenciales no se leen ni se
muestran en este informe**; deben migrarse cifradas de extremo a extremo o, preferiblemente,
solicitarse de nuevo al vendedor y no migrarse. `account_sales` y `credential_access_log` son nuevos y
se rellenarán con la operación futura. Ningún archivo se copió.

## 11. Storage

Mismos cuatro buckets en ambos lados, todos privados en el canónico, con lectura por URL firmada de
una hora.

| Bucket | Finalidad | Migrar | Observación |
| --- | --- | --- | --- |
| `avatars` | fotos de perfil | opcional | reconstruible por el propio usuario |
| `catalog` | portadas de juegos/ofertas | no | se regenera con G2Bulk |
| `deposit-proofs` | comprobantes de pago | **sí** | valor probatorio y contable |
| `listings` | fotos de cuentas en venta | sí, solo publicaciones vivas | las vendidas/expiradas no son necesarias |

Número de archivos del antiguo: no verificable. No se enumeró ni descargó nada.

## 12. Configuración y precios

El canónico usa `settings` clave/valor (9 filas activas: comisión de retiro 15 %, comisión de comercio
5 %, valor del saldo móvil 2,80 CUP, entre otras). El código usa una fila única `platform_settings`.
Deben preservarse los valores históricos de: tasa USD→CUP y margen, valor del saldo móvil, coste de
publicación por día, comisión de retiro, comisión de comercio, reutilización de líneas y WhatsApp de
soporte. La arquitectura de Base de Precios (Fase 2.9) es compatible con las columnas
`price_cup`/`cost_cup`/`provider_cost_cup` del canónico. **No se recalculó ni modificó ningún precio.**

## 13. G2Bulk

Sin conexión y sin API key. Del modelo se confirma: los 6.193 productos históricos provienen de
G2Bulk; los campos del proveedor son los listados en §5; el precio de venta, descuentos, destacados y
orden son de MonStore. Diseño futuro confirmado: **G2Bulk = fuente técnica, MonStore = fuente
comercial**, con upsert por `provider_product_id` y sin tocar columnas comerciales.

## 14. Dependencias de Lovable

| Elemento | Clasificación | Acción |
| --- | --- | --- |
| Cliente generado `src/integrations/supabase/*` (`VITE_SUPABASE_*`) | **debe sustituirse** | pasar a leer los secretos `MONSTORE_DB_*` |
| Backend interno `tvzbcqxgfoqvxzpjqwus` (vacío) | debe quedar en desuso | no contiene datos que trasladar |
| `.env` y `supabase/config.toml` | requieren adaptación | apuntan al backend interno/antiguo |
| Secretos `MONSTORE_DB_*` configurados y no consumidos por el código | **debe adaptarse** | único punto de conexión |
| Alojamiento, servidor de funciones, compilación, almacenamiento del repositorio | debe permanecer | válido y necesario |
| Informes `FASE_*.md` | permanecen | documentales |

## 15. Plan de migración por fases

Formato: objetivo · datos · riesgo · estrategia · validación · rollback.

- **FASE A — Preparación.** Recuperar credenciales de lectura del antiguo y hacer un volcado completo
  fuera de línea · todo · alto (sin esto no hay migración posible) · exportación de solo lectura +
  sumas de control · recuento por tabla e importe total · ninguno (no escribe).
- **FASE B — Estructuras faltantes.** Crear en el canónico `otp_limits`, `otp_test_challenges`, las
  funciones ausentes y los permisos · esquema · medio · migraciones idempotentes con GRANT+RLS ·
  cada función responde y RLS bloquea al visitante · migración inversa por objeto.
- **FASE C — Auth/usuarios.** Alta de usuarios en el canónico + `legacy_user_map` + perfiles ·
  usuarios, perfiles, roles · alto (acceso) · un usuario por teléfono normalizado, dominio interno
  unificado, rol `user` salvo administrador · cada teléfono entra por código y ve su perfil · borrar
  usuarios creados por el lote y su mapa.
- **FASE D — Wallet y finanzas.** Movimientos, solicitudes, saldos, retenidos · dinero · **muy alto** ·
  movimientos primero, saldo derivado y comparado, líneas reconfiguradas, sin re-cobros · suma de
  movimientos = saldo antiguo, usuario por usuario · anular el lote por `legacy_id` y recalcular.
- **FASE E — Catálogo.** Juegos y ofertas · 6.193 · medio · híbrida (§16) · 6.193 / 5.070 / 1.123 / 0
  y suma 293.721.871,45 CUP · borrar por `legacy_id` del lote.
- **FASE F — Eventos.** Eventos, participantes, salas, resultados · medio · migrar cerrados como
  histórico; los abiertos, revisados uno a uno · participantes y cobros cuadran · borrado por lote.
- **FASE G — Comercio.** Publicaciones y ventas; credenciales pedidas de nuevo · medio-alto
  (secretos) · solo publicaciones vivas · el vendedor ve su publicación · borrado por lote.
- **FASE H — Storage.** `deposit-proofs` y `listings` vivos · medio · copia por lotes con
  verificación de tamaño y ruta idéntica · cada registro resuelve su archivo firmado · borrar objetos
  del lote.
- **FASE I — Conexión.** Cambiar el cliente a `MONSTORE_DB_*` · toda la app · alto · un solo punto de
  conexión y despliegue único · la app arranca contra el canónico y el catálogo se ve sin sesión ·
  revertir la variable/commit.
- **FASE J — Validación.** Acceso por código, compra, fondos, retiro, evento, publicación, panel,
  RLS, precios, archivos · alto · lista de pruebas cerrada · todas en verde · vuelta a Fase I.
- **FASE K — Congelación del antiguo.** Solo lectura, respaldo guardado, sin borrar nada · bajo ·
  revocar escritura, conservar respaldo 6 meses · no hay tráfico contra el antiguo · reactivar.

## 16. Estrategia recomendada para el catálogo

**C — Híbrida.** Reconstruir juegos y ofertas desde G2Bulk (identificadores, costes, disponibilidad,
metadatos, imágenes) y migrar **solo la capa comercial** desde el respaldo del antiguo, casando por
`provider_product_id`: `price_cup`, descuentos y fechas, `is_featured`, `sort_order`, `topup_kind`
(`via_id`/`codigo`), región y nombres editados.

Motivos: los precios comerciales actuales (293.721.871,45 CUP en total) no pueden perderse ni
recalcularse; la clasificación de la Fase 2.8.3 es trabajo humano validado; los identificadores del
proveedor son la única llave estable entre ambos mundos; los productos retirados por el proveedor no
deben resucitar; y el futuro control de precios desde el panel exige que `price_cup` sea de MonStore
desde el primer día. Migrar directamente arrastraría datos técnicos caducos; reconstruir todo
perdería los precios. **No se ejecutó ninguna de las tres opciones.**

## 17. Identificadores y relaciones

Deben conservarse **exactamente**: `provider_game_id` y `provider_product_id` (llave del catálogo y
de G2Bulk), `order_code` y `idempotency_key` de los pedidos, `referral_code` de los perfiles, el
teléfono normalizado a 8 dígitos, y las rutas de los objetos de Storage.

Se conservan **como `legacy_id`** (no como clave primaria): UUID antiguos de perfiles, wallets,
movimientos, pedidos, eventos, participantes, publicaciones, solicitudes de fondos y retiros. Los
UUID de `auth.users` se re-enlazan mediante `legacy_user_map`. Las claves primarias del canónico se
generan nuevas; ninguna relación se reconstruye por nombre o por importe.

## 18. Idempotencia y seguridad

Cada paso se ejecuta como `INSERT ... ON CONFLICT DO NOTHING` sobre una clave natural única, dentro
de una transacción por lote, con un identificador de lote registrado en `audit_log`:

- usuarios: único por teléfono normalizado + `legacy_user_map(legacy_user_id)` único;
- wallets: única por `user_id`;
- movimientos y asientos: únicos por `legacy_id` / `idempotency_key`;
- pedidos: únicos por `order_code` y por `idempotency_key`;
- productos: únicos por `provider_product_id`; juegos por `provider_game_id`;
- eventos y participantes: únicos por `legacy_id` y por (evento, usuario);
- archivos: misma ruta de objeto, con comparación de tamaño antes de copiar.

Así el proceso es reejecutable sin duplicar, verificable por recuentos y sumas, y reversible borrando
por identificador de lote. Ninguna clave de servicio aparece en código de navegador, logs ni
respuestas; las credenciales de cuentas nunca se registran en claro.

## 19. Riesgos, rollback y pruebas

**Riesgos.** R1: pérdida definitiva del catálogo y del histórico si no se recupera acceso al antiguo.
R2: descuadre de saldos si se migran saldos sin derivarlos de movimientos. R3: acceso roto por el
dominio interno divergente (`@telefono.monstore.cu` vs `@monstore.local`). R4: sin las tablas OTP el
acceso por código no funciona en el canónico. R5: trabajar creyendo que ya se opera sobre el canónico
y escribir datos reales en el backend interno. R6: una sincronización de G2Bulk antes de proteger las
columnas comerciales borraría los precios.

**Rollback general.** Respaldo del antiguo intacto; migraciones inversas por objeto; borrado por
identificador de lote; y reversión de la conexión a la variable anterior en un solo cambio.

**Pruebas antes del cutover.** Acceso por teléfono + código (alta, reenvío, caducidad, intentos,
uso único); panel de administración con cliente, sin sesión y con administrador; catálogo visible sin
sesión con 6.193 / 5.070 / 1.123 / 0 y suma 293.721.871,45 CUP; compra completa con saldo e
idempotencia; solicitud y aprobación de fondos con línea asignada y liberada; retiro con comisión y
rechazo con devolución; inscripción, sala y cobro de un evento; publicación y aprobación de una
cuenta; archivos privados accesibles solo por URL firmada; y verificación de que ninguna clave de
servicio llega al navegador.

---

## VEREDICTO

🔴 **MIGRACIÓN NO PREPARADA**

El plan está completo y el destino es viable, pero hay dos bloqueadores absolutos: **no existe ninguna
credencial de lectura del backend antiguo**, por lo que su inventario real y el respaldo de los 6.193
productos, usuarios, saldos e historial no pudieron hacerse; y el canónico **carece todavía** de las
tablas OTP y de dieciséis funciones que la aplicación necesita. Sin la Fase A no puede iniciarse
ninguna otra. Auditoría detenida, sin modificaciones, a la espera de autorización expresa.
