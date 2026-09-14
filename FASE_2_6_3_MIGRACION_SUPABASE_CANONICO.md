# FASE 2.6.3 — Plan de migración al Supabase canónico

Estado: **PLAN. No se ejecutó ningún cambio.**

- Conexión actual (sin tocar): `https://yfimkckjhhvxkbkyxexd.supabase.co`
- Destino canónico: `https://nklgztbukgaoycuaryzk.supabase.co` (`nklgztbukgaoycuaryzk`)

Objetivo final: el proyecto externo es la única fuente de verdad; Lovable queda solo como
plataforma de desarrollo y publicación.

---

## 0. Bloqueador principal (sin cambios desde la Fase 1)

Este proyecto **no tiene acceso** al backend canónico: ni lectura, ni escritura, ni
almacenamiento. Todas las herramientas de base de datos de esta sesión apuntan al backend
interno. Por tanto, la comparación de esta fase se hace contra las **migraciones 002–005 ya
leídas** del proyecto de referencia, no contra una consulta viva.

Para ejecutar cualquier fase posterior hace falta una de estas dos vías:

- **A.** Aplicar las migraciones de adaptación desde el proyecto de referencia (Admin Panel).
- **B.** Autorizar la conexión del proyecto externo a esta aplicación (esto es, de hecho, el
  propio cambio de conexión; solo tiene sentido en la fase de cutover).

---

## 1. Inventario real de lo que la aplicación usa hoy

Extraído del código, no supuesto.

**Tablas leídas/escritas:** `profiles`, `user_roles`, `wallets`, `wallet_transactions`,
`deposits`, `withdrawals`, `orders`, `products`, `games`, `events`, `events_public`,
`event_subscriptions`, `game_accounts`, `game_account_secrets`, `listings`, `notifications`,
`referrals`, `user_favorite_games`, `payment_settings`, `payment_destinations`,
`payment_lines`, `platform_settings`, `otp_limits`, `otp_test_challenges`, `otp_sms_log`,
`audit_log`, `api_transactions`.

**Funciones (RPC) invocadas:** `has_role`, `place_wallet_order`, `refund_wallet_order`,
`request_deposit_v2`, `review_deposit`, `review_withdrawal`, `review_game_account`,
`read_account_credentials`, `release_payment_line`, `claim_referral_reward`,
`top_recharged_games`, `event_participant_counts`.

**Almacenamiento:** un único uso real, subida de comprobantes a `deposit-proofs`. Las
imágenes de catálogo se firman desde el servidor contra el depósito `catalog`.

**Tiempo real:** no se usa en ninguna parte. Nada que migrar.

---

## 2. Comparación componente por componente

Leyenda: **Existe** / **Falta** / **Distinto**. "Adaptar código" y "Migrar datos" indican el
trabajo asociado.

| Componente | En el canónico | Código | Datos | Reglas de acceso | Funciones |
|---|---|---|---|---|---|
| Variables de conexión | n/a | Cambiar 6 valores | — | — | — |
| Cliente del navegador | Existe | Sin cambios | — | — | — |
| Cliente del servidor | Existe | Sin cambios | — | — | — |
| Sesión y acceso | Existe | Alinear formato de correo interno | Sí, usuarios | — | Ajustar alta de usuario |
| Perfiles | Existe | Sin cambios | Sí | Ya definidas | — |
| Roles | Existe | Sin cambios | Sí | Ya definidas | `has_role` idéntica |
| Saldo y movimientos | Existe | Sin cambios de lectura | Sí | Más estrictas: saldo solo lectura | — |
| Solicitudes de fondos | **Distinto**: `fund_requests` | Renombrar consultas | Sí | Sin modificación directa | Reemplazar `request_deposit_v2` / `review_deposit` |
| Retiros | **Distinto** (estados y columnas) | Adaptar | Sí | Ya definidas | Reemplazar `review_withdrawal` por completar/rechazar |
| Métodos de pago | **Distinto**: `payment_methods_config` | Renombrar y remapear campos | Sí (datos reales, no los de ejemplo) | Vista pública mínima | — |
| Destinos de pago | Existe | Verificar nombres de columnas | Sí (reales) | Vista pública | — |
| Líneas de pago | Existe + eventos inmutables | Adaptar liberación | No (ejemplo) | Inmutable por disparador | Adaptar `release_payment_line` |
| Juegos | Existe + `platforms`, vista `games_public` | Usar la vista en lecturas públicas | Sí, 386 | El costo queda fuera de la vista | — |
| Ofertas | Existe + `products_public`, tipo `topup_kind` | Usar vista pública; mapear `via_id`/`codigo` | Sí, 6.193 | Costo oculto | Disparador que bloquea cambios de precio por sincronización |
| Pedidos | **Distinto**: flujo de 5 pasos + historial | Reescribir la compra | Sí (0 filas hoy) | Ya definidas | `create_order`, `pay_order`, procesar, entregar, reembolsar |
| Eventos | **Distinto**: sala, participantes y resultados separados | Adaptar tres pantallas | Sí (0 filas) | Ya definidas | Reemplazar inscripción y entrada a sala |
| Comercio de cuentas | **Distinto**: `listings` + credenciales cifradas + registro de accesos | Renombrar y adaptar | Sí (0 filas) | Credenciales sin acceso al cliente | Reemplazar publicar/revisar/leer credenciales |
| Notificaciones | Existe | Sin cambios | Sí | Ya definidas | — |
| Referidos | Existe | Sin cambios | Sí | Ya definidas | Adaptar el premio |
| Favoritos | Existe | Sin cambios | Sí | Ya definidas | — |
| Configuración global | **Distinto**: `settings` clave/valor en vez de una fila ancha | Adaptar todas las lecturas | Sí (valores reales) | Solo administrador escribe | — |
| Auditoría | Existe, inmutable | Sin cambios | No | Inmutable | — |
| Registro del proveedor | **Falta** `api_transactions` | — | No | Crear con reglas | — |
| Almacenamiento | **Falta**: no hay ningún depósito | Sin cambios de código | Sí, imágenes y avatar | Crear 4 privados + reglas | — |
| Tiempo real | No se usa | — | — | — | — |
| Proveedor de recargas | Existe la arquitectura | Conectar en fase propia | — | — | — |
| Acceso por código SMS | **Falta**: las tres tablas de códigos | — | No | Crear cerradas al cliente | Funciones de servidor ya escritas |

### Diferencias que obligan a tocar código, en concreto

1. **Configuración**: hoy se lee una fila de `platform_settings` con columnas
   (`usd_to_cup`, `usd_margin_cup`, `listing_fee_per_day`, `saldo_conversion_rate`,
   `allow_line_reuse`, `support_whatsapp`). En el canónico son filas de `settings`. Afecta a
   `catalog.functions.ts`, `payments.functions.ts` y `useMarketplace.ts`.
2. **Nombres de tabla**: `deposits` → `fund_requests`, `game_accounts` → `listings`,
   `payment_settings` → `payment_methods_config`.
3. **Compra**: `place_wallet_order` desaparece; entra el flujo de cinco pasos.
4. **Vistas públicas**: las lecturas de catálogo deben pasar por `games_public` y
   `products_public` para no exponer el costo del proveedor.
5. **Métodos de pago**: el conjunto de valores permitidos difiere (`saldo`, `tarjeta`,
   `monedero`, `usdt`, `zelle` frente a los actuales). Hay que traducir en la migración.

---

## 3. Plan por fases

**F1 — Preparación del canónico** (requiere acceso; SQL ya escrito en `.lovable/plan.md` §B1)
Ajuste de WhatsApp de soporte, cuatro depósitos privados con sus reglas, tabla del registro
del proveedor y las tres tablas del acceso por código. Todo aditivo.

**F2 — Adaptación del código, sin cambiar la conexión**
Capa única de configuración, renombrado de tablas, lecturas por vistas públicas, compra
sobre el flujo canónico, comercio y eventos adaptados, administración sensible movida a
funciones de servidor con comprobación de rol. Se valida con datos de prueba del canónico,
no con los reales.

**F3 — Migración de datos** (copia, nunca movimiento)
Orden obligatorio: identidad → perfiles → roles → saldos → configuración real → juegos →
ofertas → resto. Cada tabla conserva su identificador antiguo. Precios copiados exactamente,
sin recalcular.

**F4 — Archivos**
Avatar y comprobantes al depósito correspondiente; las 249 imágenes externas se dejan como
están hasta que se decida internalizarlas.

**F5 — Cambio de conexión**
Seis variables en un único acto, publicación, comprobación inmediata y revocación de las dos
funciones de cobro antiguas ese mismo día.

**F6 — Acceso por código SMS**
Solo después de que el cambio esté estable y con conectividad al proveedor demostrada.

---

## 4. Riesgos

| Riesgo | Gravedad | Control |
|---|---|---|
| Doble cobro con los dos backends vivos | Crítico | Revocar las funciones antiguas el día del cambio |
| Cambio parcial de variables | Crítico | Cambiar las seis a la vez; comprobar antes de publicar |
| Cuentas duplicadas por el formato de correo | Crítico | Formato único ya fijado; alinear el alta del canónico antes de migrar |
| Precios alterados al migrar o al sincronizar | Alto | Copia exacta + disparador que ya bloquea la sincronización |
| Comprobantes o credenciales accesibles | Alto | Los cuatro depósitos se crean privados de forma explícita |
| Pantallas rotas por nombres distintos | Medio | F2 completa antes de tocar la conexión |
| Pérdida de acceso del administrador | Medio | Verificar rol en el canónico antes del cambio |

---

## 5. Pruebas antes de dar por buena la migración

Identidad y sesión, rol de administrador, catálogo (386 juegos y 6.193 ofertas con precios
idénticos uno a uno), compra completa incluida la repetición de la misma operación,
reembolso, fondos y retiros de principio a fin, comercio de cuentas con credenciales
invisibles al cliente, eventos, notificaciones, referidos, favoritos, subida y lectura de
comprobante, y comprobación de que ningún depósito responde sin sesión.

**Criterio de éxito:** conteos y sumas idénticos origen-destino, cero errores en la consola,
y ninguna lectura que devuelva el costo del proveedor.

**Vuelta atrás:** restaurar las seis variables anteriores. El backend antiguo queda congelado
y sin borrar al menos 30 días.

---

## 6. Confirmaciones

No se cambió la dirección del backend. No se cambió ninguna clave. No se borró ni modificó el
backend interno. No se migró ningún dato. No se modificó el acceso. No se implementó el
acceso real por código. No se tocó catálogo, precios, saldos, pedidos ni el proveedor.
