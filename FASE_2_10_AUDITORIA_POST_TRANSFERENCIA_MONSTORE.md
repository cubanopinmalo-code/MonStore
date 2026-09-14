# FASE 2.10 — Auditoría post-transferencia del backend MonStore

Fecha: 14/09/2026. Alcance: **solo lectura**. No se creó, modificó ni eliminó ninguna tabla, política,
permiso, función, dato, precio, ruta ni configuración. No se conectó zdSMS ni G2Bulk. No se tocó el
proyecto antiguo. No se hizo ninguna operación de Git.

---

## 1. Estado de conexión Supabase

| Prueba | Resultado |
| --- | --- |
| Resolución y HTTPS a `https://nklgztbukgaoycuaryzk.supabase.co` | ✅ responde |
| API de datos con clave publicable (rol público) | ✅ 200 en lecturas públicas |
| API de datos con clave de servicio | ✅ 200 |
| API de autenticación (GoTrue v2.196.0) | ✅ 200 |
| Almacenamiento con clave de servicio | ✅ 200 |

**Pero la aplicación no usa esa conexión.** El cliente del navegador y el del servidor leen
`VITE_SUPABASE_URL` / `SUPABASE_URL`, que hoy apuntan a un backend interno de Lovable creado por la
transferencia (`tvzbcqxgfoqvxzpjqwus`). Las variables `MONSTORE_DB_*` no son leídas por ninguna línea
de código.

## 2. Proyecto Supabase detectado

- Proyecto al que **apunta la aplicación** en ejecución: `tvzbcqxgfoqvxzpjqwus` (interno de Lovable, vacío).
- Proyecto al que apuntan los ficheros del repositorio (`.env`, `supabase/config.toml`): `yfimkckjhhvxkbkyxexd` (antiguo, ya no coincide con el entorno).
- Proyecto canónico verificado por prueba directa: `nklgztbukgaoycuaryzk` ✅ (coincide URL, ID y claves).

## 3. Variables verificadas

| Variable | Existe | Valor comprobado |
| --- | --- | --- |
| `MONSTORE_DB_URL` | ✅ | `https://nklgztbukgaoycuaryzk.supabase.co` ✅ |
| `MONSTORE_DB_PROJECT_ID` | ✅ | `nklgztbukgaoycuaryzk` ✅ |
| `MONSTORE_DB_PUBLISHABLE_KEY` | ✅ | válida contra el canónico (no se muestra) |
| `MONSTORE_DB_SERVICE_KEY` | ✅ | válida contra el canónico (no se muestra) |
| `MONSTORE_OTP_PEPPER` | ✅ | 64 caracteres, solo servidor (no se muestra) |

Ningún secreto está escrito en el código. `MONSTORE_DB_SERVICE_KEY` no aparece en código de navegador,
logs ni respuestas. `MONSTORE_OTP_PEPPER` se lee únicamente en `src/lib/otp.functions.ts` dentro del
servidor. **Pendiente:** las cuatro variables `MONSTORE_DB_*` están configuradas pero no consumidas.

## 4. Referencias al backend antiguo (`yfimkckjhhvxkbkyxexd`)

| Archivo | Ubicación | Función | Tipo |
| --- | --- | --- | --- |
| `supabase/config.toml` | línea 1 | `project_id` del proyecto ligado | **activa** (config, generada por la plataforma) |
| `.env` | 6 variables | conexión del navegador y del servidor | **activa en el fichero**, sobrescrita en ejecución por el entorno (`tvzbcq…`) |
| `FASE_2_5…`, `FASE_2_6_3/4/5`, `FASE_2_8_*`, `FASE_2_9_0*`, `FASE_2_6_AUTH_OTP_TEST` | menciones en texto | histórico de informes | documental |

No se modificó ninguna referencia.

## 5. Estado de Auth/OTP

✅ Acceso exclusivamente por teléfono + código de 6 dígitos (`src/routes/index.tsx` +
`src/lib/otp.functions.ts`). Caducidad 300 s, 5 intentos, un solo uso (consumo inmediato), reenvío cada
60 s, 5 códigos por número/24 h, límite por IP/hora, huella SHA-256 con pimienta, el código nunca sale al
navegador ni a los logs. Sesión oficial de Supabase mediante `verifyOtp({ token_hash })`, con
auto-refresh y persistencia; cierre de sesión por `supabase.auth.signOut()`; rutas privadas bajo
`_authenticated`. Sin acceso por contraseña, sin recuperación por correo, sin ruta `/prueba-otp`
(no existe). El teléfono no otorga privilegios: el rol se lee de `user_roles`.
El SMS sigue simulado (zdSMS no conectado), correcto para esta fase.

## 6. Estado de roles y seguridad del panel

Tres capas presentes en el código: pantalla/ruta (`_authenticated/route.tsx` y
`_authenticated/admin/route.tsx`, que exige fila `admin` en `user_roles`), servidor (funciones con
`requireSupabaseAuth` y comprobación de rol) y base de datos (RLS con `has_role`/`is_admin`).
En el canónico existe `is_admin()` y responde. **No pudo verificarse el resto de la autorización en el
canónico**: no hay sesiones ni datos de prueba y las funciones RPC que usa la aplicación no existen allí (§7).

## 7. Estado de RLS y estructuras del canónico

Existen: `profiles`, `user_roles`, `wallets`, `wallet_transactions`, `fund_requests`,
`withdrawal_requests`, `games`, `products`, `orders`, `order_status_history`, `events`,
`event_participants`, `event_rooms`, `event_results`, `account_listings`, `account_credentials`,
`account_sales`, `notifications`, `referrals`, `user_favorite_games`, `user_currency_prefs`,
`settings` (9 filas), `finance_entries`, `audit_log` (5 filas), y las vistas `games_public` /
`products_public` legibles sin sesión. RLS activo: la clave publicable no puede leer nada fuera de las
vistas públicas.

**Faltan, respecto a lo que este código espera:** `deposits`, `withdrawals`, `platform_settings`,
`payment_lines`, `payment_destinations`, `otp_limits`, `otp_test_challenges`, y las funciones
`has_role`, `place_wallet_order`, `request_deposit(_v2)`, `request_withdrawal`, `review_deposit`,
`review_withdrawal`, `publish_game_account`, `read_account_credentials`, `subscribe_event`,
`enter_event_room`, `claim_referral_reward`, `set_display_currency`, `event_participant_counts`,
`top_recharged_games`. Es decir: el esquema del canónico y el del código **no son el mismo**.

## 8. Estado del catálogo

| Esperado | Encontrado en el canónico |
| --- | --- |
| 6.193 ofertas | **0** |
| 5.070 `via_id` | 0 |
| 1.123 `codigo` | 0 |
| 0 `via_cuenta` | 0 ✅ (por vacío) |
| Juegos | 0 |

El backend interno actual (`tvzbcq…`) también está vacío (0 productos, 0 juegos, 0 perfiles, 0 pedidos).
Los 6.193 registros reclasificados en la Fase 2.8.3 vivían en el backend antiguo `yfimkck…`, que ya no es
alcanzable desde este proyecto. **No hay datos que comparar, no hay pérdida provocada por esta auditoría.**

## 9. Estado de precios

La separación técnica/comercial sigue en el código (Fase 2.8.1/2.9): la sincronización solo escribe
columnas del proveedor y no toca `sale_price`, descuentos, promociones, `featured`, `sort_order` ni
reglas comerciales. No hay protección equivalente **en la base canónica** (las estructuras y funciones
de precios de la Fase 2.9 no están allí). No se ejecutó ninguna sincronización.

## 10. Estado de Storage

Canónico: `avatars`, `catalog`, `deposit-proofs`, `listings` — los cuatro **privados** ✅. La lectura se
hace por URL firmada de una hora (`src/lib/supabase.server.ts`). No hay exposición pública de archivos
privados. Los archivos existentes no se enumeraron ni descargaron. No se creó ni eliminó ningún bucket.

## 11. Estado de Realtime

El código **no abre ningún canal de tiempo real**: fondos, retiros, eventos, participantes y
configuración se leen por consulta/refresco. No hay nada que migrar en este punto, pero tampoco hay
tiempo real disponible hoy. Sin cambios de configuración.

## 12. Estado de GitHub

No hay integración con GitHub: los remotos son el almacenamiento interno de Lovable (`origin` y
`secondary`). Rama activa: `edit/edt-40aa1ee6-b521-4907-b22c-ddc043a6833c`. Árbol de trabajo limpio. No
se hizo push, pull ni cambio de rama. No es posible comparar con un repositorio externo porque no existe.

## 13. Dependencias de Lovable

| Elemento | Clasificación |
| --- | --- |
| Cliente generado `src/integrations/supabase/*` (`VITE_SUPABASE_*` / `SUPABASE_*`) | **D — problemática**: apunta al backend interno, no al canónico |
| `.env` con `yfimkckjhhvxkbkyxexd` | **B — residual** |
| `supabase/config.toml` con `yfimkckjhhvxkbkyxexd` | **B — residual** |
| Backend interno `tvzbcqxgfoqvxzpjqwus` (Lovable Cloud, vacío) | **C — específica de Lovable** |
| Alojamiento, servidor de funciones, compilación | **A — necesaria y válida** |
| Secretos `MONSTORE_DB_*` configurados y sin usar | **D — problemática** (falsa sensación de cutover) |
| Informes `FASE_*.md` | **E — no relevante** |

## 14. Problemas encontrados

1. **P1 (crítico).** La aplicación no está conectada al canónico: usa el backend interno `tvzbcq…`.
2. **P2 (crítico).** Ningún fichero del código lee `MONSTORE_DB_URL/PUBLISHABLE_KEY/SERVICE_KEY/PROJECT_ID`.
3. **P3 (crítico).** El canónico no tiene el catálogo (0 de 6.193) ni las tablas/funciones que el código usa.
4. **P4 (alto).** Los 6.193 registros de la Fase 2.8.3 solo existían en `yfimkck…`, hoy inalcanzable.
5. **P5 (medio).** `.env` y `supabase/config.toml` conservan el identificador antiguo.
6. **P6 (medio).** Sin tiempo real y sin tablas OTP (`otp_limits`, `otp_test_challenges`) en el canónico: el acceso por código no funcionaría allí tal cual.
7. **P7 (bajo).** La pimienta OTP tiene valor por defecto si faltara el secreto, en lugar de fallar.

## 15. Riesgos

- **R1.** Trabajar creyendo que ya se opera sobre el canónico y escribir datos reales en el backend interno.
- **R2.** Pérdida definitiva del catálogo si nadie conserva acceso o respaldo de `yfimkck…`.
- **R3.** Un cambio de conexión sin adaptar el esquema rompería compras, fondos, retiros, eventos y acceso.
- **R4.** Cualquier prueba de zdSMS o G2Bulk ahora escribiría en el backend equivocado.

## 16. Recomendaciones (a autorizar en otra fase)

1. Recuperar o confirmar respaldo del catálogo del backend antiguo antes de cualquier otro paso.
2. Decidir la fuente de verdad del esquema: adaptar el código al esquema del canónico, o completar el canónico con las tablas y funciones que el código usa.
3. Hacer que el cliente lea `MONSTORE_DB_*` (un único punto de conexión) y limpiar `.env` y `config.toml`.
4. Cargar el catálogo en el canónico y verificar 6.193 / 5.070 / 1.123 / 0 antes de abrir la aplicación.
5. Repetir después: seguridad del panel con usuario real, RLS, precios y almacenamiento.
6. Solo entonces conectar zdSMS y G2Bulk.

---

## Veredicto

🔴 **NO APROBADO** — el proyecto transferido **no** está usando el Supabase canónico: apunta a un
backend interno vacío, los secretos canónicos no están conectados al código y el canónico carece del
catálogo y de las estructuras que la aplicación necesita. Auditoría detenida; sin modificaciones y a la
espera de autorización.
