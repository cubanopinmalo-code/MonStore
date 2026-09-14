# FASE 2.6.4 — Preparación controlada del Supabase canónico

Estado: **PREPARACIÓN COMPLETA, CON BLOQUEADORES DE ACCESO. No se ejecutó ningún cambio.**

- Backend actual (sin tocar): `https://yfimkckjhhvxkbkyxexd.supabase.co`
- Backend canónico (destino): `https://nklgztbukgaoycuaryzk.supabase.co`

Confirmaciones de esta fase: no se cambió la conexión, no se revocó ni eliminó ninguna función,
no se tocó el acceso por código, no se migró ningún dato, no se modificaron precios, catálogo,
saldos, pedidos ni el proveedor. El backend actual sigue completamente operativo.

---

## 1. Accesibilidad del proyecto canónico

Comprobado desde este entorno el día de esta fase:

| Prueba | Resultado |
|---|---|
| DNS y TLS de `nklgztbukgaoycuaryzk.supabase.co` | Correcto |
| `/auth/v1/health` | Responde en 0,13 s con `401 · No API key found in request` |
| `/rest/v1/` | Responde `401` |

Lectura: **el proyecto existe, está activo y es alcanzable por red**. Lo que falta no es
conectividad, sino **credenciales**: no tengo su clave pública ni la clave de servidor, y las
herramientas de base de datos de esta sesión siguen atadas al backend actual. Sin ellas no puedo
consultar su esquema vivo, crear los depósitos de archivos ni aplicar nada.

La compatibilidad se valida, por tanto, contra las migraciones 002–005 ya leídas del proyecto de
referencia, no contra una consulta viva. **Ninguna contradicción detectada** entre esta aplicación
y esas migraciones.

---

## 2. Mapa de compatibilidad

Columnas: **C** = requiere cambio de código · **D** = migración de datos · **A** = archivos ·
**R** = adaptar reglas de acceso · **F** = adaptar función/RPC.

### 2.1 Tablas

| Actual | Canónica | C | D | A | R | F | Nota |
|---|---|:-:|:-:|:-:|:-:|:-:|---|
| `profiles` | `profiles` | — | Sí | — | — | — | Idéntica; `province`/`municipality` presentes |
| `user_roles` | `user_roles` | — | Sí | — | — | — | Enum añade `moderator`, no se usa |
| `wallets` | `wallets` | — | Sí | — | Sí | — | Destino: cliente solo lectura, saldo no negativo por restricción |
| `wallet_transactions` | `wallet_transactions` | — | Sí | — | Sí | — | Tipos de movimiento por enum |
| `deposits` | **`fund_requests`** | Sí | Sí | — | Sí | Sí | Renombrado + sin modificación directa desde el cliente |
| `withdrawals` | `withdrawals` | Sí | Sí | — | — | Sí | Estados y columnas distintos |
| `orders` | `orders` + `order_status_history` | Sí | Sí | — | — | Sí | Flujo de 5 pasos; historial inmutable |
| `products` | `products` (+ vista `products_public`) | Sí | Sí | — | Sí | — | Lecturas públicas por la vista; costo oculto |
| `games` | `games` (+ vista `games_public`) | Sí | Sí | — | Sí | — | Igual; `platforms` presente |
| `events` / `event_subscriptions` | `events`, `event_participants`, resultados | Sí | Sí | — | — | Sí | Sala y participantes separados |
| `game_accounts` | **`listings`** | Sí | Sí | — | Sí | Sí | Renombrado |
| `game_account_secrets` | `account_credentials` + registro de accesos | Sí | Sí | — | Sí | Sí | Sin ningún permiso para el cliente |
| `payment_settings` | **`payment_methods_config`** | Sí | Sí* | — | Sí | — | Renombrado y campos remapeados |
| `payment_destinations` | `payment_destinations` | — | Sí* | — | — | — | Verificar nombres de columnas |
| `payment_lines` + eventos | `payment_lines` + `payment_line_events` | Sí | No | — | Sí | Sí | Eventos inmutables por disparador |
| `platform_settings` (fila ancha) | **`settings`** (clave/valor) | Sí | Sí | — | Sí | — | Cambio de formato: afecta a 3 archivos |
| `notifications` | `notifications` | — | Sí | — | — | — | — |
| `referrals` | `referrals` | — | Sí | — | — | Sí | Adaptar el premio |
| `user_favorite_games` | `user_favorite_games` | — | Sí | — | — | — | — |
| `user_currency_prefs` | `user_currency_prefs` | — | Sí | — | — | Sí | — |
| `audit_log` | `audit_log` | — | No | — | — | — | Inmutable en destino |
| `api_transactions` | **Falta** | — | No | — | Sí | — | Crear en preparación del destino |
| `otp_limits`, `otp_test_challenges`, `otp_sms_log` | **Faltan** | — | No | — | Sí | Sí | Crear cerradas al cliente |
| — | `legacy_user_map` | Sí | Sí | — | — | — | Existe en destino; origen por defecto ya es el backend actual |

\* Solo datos reales; **no se migran los de ejemplo** (3 líneas y 5 destinos actuales son ficticios).

### 2.2 Funciones y RPC

| Actual | Destino | Clasificación |
|---|---|---|
| `has_role`, `update_updated_at_column` | Idénticas | CONSERVAR |
| `release_payment_line`, `claim_referral_reward`, `set_display_currency`, `top_recharged_games`, `event_participant_counts`, `handle_new_user` | Equivalentes con ajustes | ADAPTAR |
| `place_wallet_order`, `refund_wallet_order` | `create_order` → `pay_order` → procesar → entregar/fallar → reembolsar | REEMPLAZAR |
| `request_deposit`, `request_deposit_v2`, `review_deposit` | Funciones de `fund_requests` | REEMPLAZAR |
| `request_withdrawal`, `review_withdrawal` | Completar/rechazar retiro | REEMPLAZAR |
| `publish_game_account`, `review_game_account`, `read_account_credentials` | Funciones de `listings` + registro de accesos | REEMPLAZAR |
| `subscribe_event`, `enter_event_room` | Inscripción y sala canónicas | REEMPLAZAR |
| `encrypt_account_credentials`, `keep_profile_phone` | Cubiertas por el destino | ELIMINAR POSTERIORMENTE |

Ninguna función se elimina ni revoca en esta fase. La revocación de `place_wallet_order` y
`refund_wallet_order` en el backend antiguo se hace **el día del cambio**, no antes.

### 2.3 Reglas de acceso

El destino es **más estricto** que el actual en cinco puntos: el cliente no ve el costo del
proveedor (vistas públicas), no puede modificar su saldo, no puede modificar solicitudes de fondos,
no tiene ningún permiso sobre credenciales de cuentas, y toda aprobación (fondos, retiros,
publicaciones, eventos, reembolsos) exige rol verificado en el servidor. Consecuencia para esta
aplicación: aprobar retiros, aprobar publicaciones y abrir sala de evento —hoy invocados desde el
navegador— deben pasar a funciones de servidor con comprobación de rol antes del cambio.

### 2.4 Archivos

| Depósito | Actual | Canónico |
|---|---|---|
| `avatars` | 1 archivo | **No existe** |
| `catalog` | 0 archivos (249 imágenes son externas) | **No existe** |
| `deposit-proofs` | comprobantes | **No existe** |
| `listings` | fotos de cuentas | **No existe** |

Los cuatro deben crearse **privados** en el destino, con las reglas ya escritas en
`.lovable/plan.md` §B1. Nada se borra en el origen.

---

## 3. Catálogo

Se migran **386 juegos** y **6.193 ofertas**, tal cual, preservando identificador original, nombre,
imagen, activo/inactivo, orden, región, tipo de recarga, precio de venta, promociones,
identificadores del proveedor y su costo técnico.

Clasificación fija y aprobada: **5.070 `via_id` → `via_id`**, **1.123 automáticas de códigos →
`codigo`**, **0 `via_cuenta`** (no existe ninguna real; no se convierte ninguna oferta dudosa).

Reglas duras de la migración: precios copiados **exactamente**, sin recalcular; región obligatoria
con valor general cuando falte; los 7 pares de nombres duplicados se migran **sin fusionar ni
renombrar**; el costo del proveedor viaja como dato técnico, nunca visible al cliente.

Verificación de llegada: 386 / 6.193 filas, suma de precios **293.721.871,45 CUP**
(mín 5,75 · máx 17.595.000) y costo total **255.413,65 USD** idénticos origen-destino.

---

## 4. Usuarios

Se conservan identificador de cuenta, teléfono, perfil, rol, saldo, preferencias, favoritos,
referidos y notificaciones. Identidad canónica ya fijada: `<telefono>@telefono.monstore.cu`, sin
prefijo 53. Una sola cuenta por teléfono; el teléfono normalizado es la clave de reconciliación y
`legacy_user_map` guarda la correspondencia antigua→nueva.

Contraseñas: **no se migran**. Si el identificador de cuenta no puede conservarse, el mapa de
correspondencia se rellena antes de mover cualquier dato dependiente y todas las referencias
(saldo, pedidos, referidos) se reescriben con el nuevo identificador en el mismo bloque.

Hoy hay **1 perfil real y 2 roles**, así que el riesgo práctico es mínimo. No se creó, migró ni
modificó ninguna cuenta. El acceso por código no se toca en esta fase.

---

## 5. Saldo y dinero — estado documentado antes de migrar

Estado actual congelado como referencia: **1 monedero, saldo 0 CUP, retenido 0 CUP**, y **0 filas**
en movimientos, solicitudes de fondos, retiros, pedidos y transacciones del proveedor.

Eso significa que hoy **no hay historial financiero que migrar** y la migración de dinero es
trivial. Aun así, el procedimiento queda fijado para cuando existan datos: se copian saldo
disponible, retenido, cada movimiento con su saldo antes/después, depósitos y retiros con importe,
comisión, conversión, destino, estado y revisor. Verificación: suma de movimientos = saldo final,
en cada monedero, origen y destino.

No se hizo ningún cargo, reembolso ni compra, ni se modificó ningún saldo.

---

## 6. Pedidos y protección contra doble descuento

El destino sustituye la compra de un solo paso por: **crear pedido → pagar pedido → procesar con el
proveedor → actualizar estado → registrar historial → registrar asiento financiero**.

Cuatro barreras contra el doble descuento, ya presentes en el destino:
clave de idempotencia por intento de compra; el cobro ocurre solo en el paso de pago y solo si el
pedido está pendiente; transiciones de estado inválidas rechazadas; historial inmutable que
delata cualquier repetición. Además el precio se calcula en el servidor y cada pedido congela
nombres, precios, costo del proveedor y la configuración comercial vigente.

Riesgo real durante el cambio: que los dos backends acepten cobros a la vez. Se anula revocando las
dos funciones de cobro antiguas el mismo día del cambio.

---

## 7. Proveedor de recargas

Arquitectura confirmada y sin cambios: aplicación → función de servidor → proveedor. La clave vive
en un único archivo del servidor (`src/lib/g2bulk.server.ts`), nunca en el navegador, nunca en
registros, nunca en una tabla legible. El costo del proveedor es dato técnico y queda fuera de las
vistas públicas. La sincronización **no puede** tocar precio de venta, promociones, activo,
destacado ni orden: un disparador del destino la aborta. No se hizo ninguna llamada real ni compra.

---

## 8. Configuración

Único cambio de formato relevante: hoy se lee una fila ancha de `platform_settings`
(`usd_to_cup`, `usd_margin_cup`, `listing_fee_per_day`, `saldo_conversion_rate`,
`allow_line_reuse`, `support_whatsapp`); en el destino son filas clave/valor de `settings`.

Se resuelve con **una sola capa de lectura de configuración** que devuelva el mismo objeto a toda
la aplicación, cambiando su implementación en un único sitio el día del cambio. Afecta a
`src/lib/catalog.functions.ts`, `src/lib/payments.functions.ts` y `src/hooks/useMarketplace.ts`.
Esa capa **no se introduce en esta fase**, para no tocar producción.

---

## 9. Variables y secretos

Separación exigida el día del cambio, sin mezclar:

| Variable | Lado | Uso |
|---|---|---|
| `VITE_SUPABASE_URL`, `SUPABASE_URL` | navegador + servidor | dirección del proyecto |
| `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_PUBLISHABLE_KEY` | navegador + servidor | clave pública |
| `SUPABASE_SERVICE_ROLE_KEY` | **solo servidor** | operaciones administrativas |
| `VITE_SUPABASE_PROJECT_ID`, `SUPABASE_PROJECT_ID` | ambos | identificador |
| Clave del proveedor, credenciales del SMS | **solo servidor** | nunca al navegador |

La clave de servidor y las credenciales del SMS no aparecen en ningún archivo del navegador hoy y
no deben aparecer nunca. Las seis variables de conexión se cambian **en un solo acto**.

---

## 10. Archivos y código que habrá que modificar

| Archivo | Motivo |
|---|---|
| `.env` (6 variables) | dirección y claves del destino |
| `supabase/config.toml` | identificador del proyecto |
| `src/lib/catalog.functions.ts` | vistas públicas + configuración clave/valor |
| `src/lib/payments.functions.ts` | `fund_requests`, funciones nuevas, configuración |
| `src/lib/orders.functions.ts` | flujo de cinco pasos |
| `src/routes/_authenticated/app/recargas/$slug.tsx` | compra real conectada al flujo nuevo |
| `src/hooks/useMarketplace.ts` | `listings` + configuración |
| `src/routes/_authenticated/admin/retiros.tsx`, `comercio.tsx`, `eventos.tsx` | mover operaciones sensibles a servidor |
| `src/hooks/useAdmin.ts`, `useEvents.ts` | nombres de tablas y funciones |
| `src/integrations/supabase/types.ts` | tipos regenerados del destino |

---

## 11. Orden exacto de migración

1. Preparar el destino: WhatsApp de soporte, los cuatro depósitos privados, tabla del proveedor y
   las tres tablas del acceso por código. Todo aditivo.
2. Adaptar el código **sin cambiar la conexión**, validando contra datos de prueba del destino.
3. Copiar datos, en este orden obligatorio: identidad → perfiles → roles → monederos y movimientos
   → configuración real → juegos → ofertas → resto. Copia, nunca movimiento.
4. Copiar archivos (avatar y comprobantes). Las 249 imágenes externas se dejan como están.
5. Cambio de conexión en un solo acto + revocación de las dos funciones de cobro antiguas.
6. Acceso por código SMS, solo cuando el cambio esté estable.

### Procedimiento del día del cambio

A congelar operaciones · B verificar integridad del origen (conteos y sumas) · C migración final ·
D verificar conteos y sumas en destino · E cambiar las seis variables · F comprobar acceso ·
G catálogo · H saldo · I pedidos · J reglas de acceso · K proveedor · L reabrir operaciones ·
M mantener el backend antiguo intacto y congelado ≥30 días.

Cada paso de verificación es bloqueante: si falla, no se pasa al siguiente, se revierte.

---

## 12. Vuelta atrás

Disparadores: fallo de acceso, pérdida de sesión, catálogo incorrecto, saldo incorrecto, error de
pedidos, de reglas de acceso, del proveedor o de archivos.

Procedimiento: congelar operaciones → restaurar las seis variables anteriores → publicar →
comprobar acceso, catálogo y saldo → reabrir. El backend antiguo permanece intacto y sin borrar,
así que no se pierde nada.

Condición que hace la vuelta atrás segura: mientras dure la ventana de respaldo, el destino no debe
ser la única copia de ningún dato nuevo. Si ya se registraron operaciones reales en el destino,
la vuelta atrás exige copiarlas antes al origen; por eso el paso A (congelar) no es opcional.

---

## 13. Pruebas obligatorias

Registro · acceso por código · cierre de sesión · sesión que sobrevive a recargar · catálogo
(386 y 6.193 con precios idénticos uno a uno) · búsqueda · filtros · favoritos · saldo · fondos ·
retiros · pedidos `via_id` · pedidos `codigo` · comprobación de que no existe `via_cuenta` ·
eventos · comercio de cuentas · notificaciones · referidos · reglas de acceso · archivos ·
proveedor · panel de administración completo.

Criterios de éxito: conteos y sumas idénticos origen-destino; cero errores en la consola; ninguna
lectura que devuelva el costo del proveedor; ningún depósito que responda sin sesión; repetir la
misma compra no descuenta dos veces.

---

## 14. Bloqueadores restantes

| # | Bloqueador | Qué hace falta |
|---|---|---|
| 1 | **Sin credenciales del proyecto canónico** | Su clave pública y su clave de servidor, o autorizar su conexión a este proyecto. Sin esto no se prepara ni se verifica nada en el destino. |
| 2 | Depósitos de archivos inexistentes en el destino | Crear los cuatro, privados (SQL listo en `.lovable/plan.md` §B1) |
| 3 | Datos reales de pago | Los actuales son de ejemplo y no se migran |
| 4 | Tope diario de SMS | Decisión de coste, pendiente |
| 5 | Conectividad del proveedor de SMS desde producción | Su sitio no responde desde aquí; se comprueba al publicar |

---

## 15. Confirmaciones finales

No se cambió la conexión. No se migró ningún dato. No se eliminó ni revocó ninguna función. No se
modificó el acceso por código. No se tocaron precios, catálogo, saldos, pedidos, archivos ni el
proveedor. No se introdujo ninguna credencial. El backend actual sigue plenamente funcional.
No se avanza a la siguiente fase sin tu autorización explícita.
