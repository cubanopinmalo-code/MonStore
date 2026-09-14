# FASE 2.9.0 — Auditoría de seguridad y acceso del Admin Panel

Fecha: 2026-09-14 (UTC)
Alcance: **solo lectura**. No se modificó código, datos, RLS, funciones, rutas, Auth, OTP ni variables.
Backend auditado: proyecto actual del Customer App (`yfimkckjhhvxkbkyxexd`). El canónico sigue vacío y sin cutover.

---

## 1. Resumen ejecutivo

El Admin Panel está protegido en **tres capas** (frontend + servidor + base de datos), que es la arquitectura objetivo (opción **C**). Las operaciones sensibles verifican el rol de administrador en el servidor con `has_role(auth.uid(),'admin')` o dentro de funciones `SECURITY DEFINER` de la base de datos, y las políticas RLS bloquean al usuario normal aunque llame directamente a la API.

**Un usuario normal no puede otorgarse el rol admin**: la tabla `user_roles` solo permite lectura de la propia fila y cualquier escritura exige ser admin.

Riesgos abiertos: el acceso real **todavía es teléfono + contraseña** (el OTP está implementado pero como prueba), existe una ruta pública de prueba OTP que puede crear cuentas, y hay privilegios de tabla concedidos de más (mitigados hoy por RLS).

**Veredicto: 🟡 APROBADO CON PENDIENTES** (detalle en la sección 17).

---

## 2. Arquitectura actual

| Elemento | Implementación |
|---|---|
| Rutas | `/admin` y 15 subrutas: `index, usuarios, wallets, depositos, retiros, pedidos, productos, juegos, pagos, eventos, comercio, referidos, actividad, configuracion, g2bulk` |
| Guard de sesión | `src/routes/_authenticated/route.tsx` — `ssr:false`, `beforeLoad` con `getSession()`; sin sesión → redirige a `/` |
| Guard de rol | `src/routes/_authenticated/admin/route.tsx` — `beforeLoad` con `getUser()` + consulta a `user_roles`; sin rol admin → redirige a `/app` |
| Backend | `createServerFn` + `requireSupabaseAuth` (token Bearer validado en servidor) + `requireAdmin()` en `catalog.functions.ts`, `orders.functions.ts`, `payments.functions.ts` |
| RPC | `review_deposit`, `review_withdrawal`, `review_game_account`, `read_account_credentials`, `release_payment_line` — `SECURITY DEFINER` con comprobación de admin interna |
| RLS | Políticas `*_admin_all` con `has_role(auth.uid(),'admin')` en games, products, orders, deposits, withdrawals, wallets, wallet_transactions, notifications, events, game_accounts, game_account_secrets, payment_settings, payment_lines, payment_destinations, user_roles, audit_log |
| Tablas de identidad | `auth.users` → `profiles` → `user_roles` (enum `app_role`: `admin`, `user`) |

**Clasificación: C — Frontend + backend + RLS.**

---

## 3. Estado de autenticación

Flujo **actual en producción**: teléfono → correo interno derivado `<telefono>@telefono.monstore.cu` → **contraseña** (`supabase.auth.signInWithPassword` en `src/lib/auth.ts`) → sesión Supabase → comprobación de rol.

Flujo **objetivo** (teléfono → OTP → zdSMS → validación servidor → sesión oficial):

| Paso | Estado |
|---|---|
| Normalización de teléfono e identidad canónica | ✅ implementado (`src/lib/phone.ts`) |
| Generación, hash y validación del código en servidor | ✅ implementado (`src/lib/otp-test.functions.ts`) |
| Límites server-side (`otp_limits`, `otp_sms_log`) | ✅ implementado |
| Envío por zdSMS | ⚠️ preparado; sin credenciales funciona en modo simulado (`mock`), y la conectividad de red a zdsms.cu no está confirmada |
| Sesión oficial Supabase vía `generateLink` + `verifyOtp` | ✅ implementado y probado (Fase 2.6) |
| Sustitución del login por contraseña | ❌ pendiente |

**Métodos alternativos existentes (a eliminar en la fase de cutover):** contraseña (`signInWithPassword`), alta con contraseña (`signUp` en `/registro` y `/`), y la ruta pública de prueba `/prueba-otp`. No se detectó login por email visible al usuario ni recuperación por email en el código.

---

## 4. Estado del OTP

| Requisito | Estado |
|---|---|
| 6 dígitos | ✅ (`otp_limits.code_length`) |
| Hash SHA-256 con pimienta | ✅ (`MONSTORE_OTP_PEPPER`, secreto de servidor) |
| Expiración 5 minutos | ✅ |
| Máximo 5 intentos | ✅ (al agotarse se consume el desafío) |
| Uso único | ✅ (`consumed_at` inmediato tras validar) |
| Espera 60 s entre solicitudes | ✅ |
| Máximo 5 por teléfono / 24 h | ✅ |
| Límite por IP | ✅ (10/hora) |
| Invalidación de códigos anteriores | ✅ |
| Código nunca en respuesta ni en logs | ✅ (solo se registra hash y teléfono enmascarado) |
| No enumeración de usuarios | ✅ (respuesta idéntica exista o no la cuenta) |
| Sesión resultante | ✅ sesión oficial de Supabase; no hay sesión paralela |

⚠️ Observación: el *pepper* tiene un valor por defecto en código si la variable faltara. Hoy la variable está configurada.

---

## 5. Estado de roles

- Rol en tabla dedicada `public.user_roles` (`user_id`, `role app_role`), nunca en `profiles`. ✅
- `has_role(_user_id, _role)`: SQL `STABLE`, `search_path=public`, **no** `SECURITY DEFINER`; `EXECUTE` concedido a `authenticated` y `service_role`, **no** a `anon`. ✅
- Políticas de `user_roles`: `roles_self_read` (SELECT solo la fila propia) y `roles_admin_all` (ALL solo admin). **Un usuario normal no puede insertar, modificar ni borrar roles, ni el suyo ni el de otros.** ✅
- No existe `is_admin()` en este backend (sí en el canónico); no hay funciones equivalentes sin protección.
- La comprobación nunca depende de un campo `isAdmin` enviado por el navegador: siempre se deriva de `auth.uid()` del token validado en servidor. ✅

⚠️ Nota técnica: por no ser `SECURITY DEFINER`, `has_role(otro_usuario,'admin')` devuelve `false` para un no-admin (RLS oculta la fila). No es una brecha —falla cerrado— pero conviene documentarlo para no usarla en comprobaciones sobre terceros.

---

## 6. Estado de rutas — escenarios probados

| # | Escenario | Resultado | Dónde se bloquea |
|---|---|---|---|
| 1 | Visitante no autenticado → `/admin` | BLOQUEADO | `_authenticated/route.tsx` (sin sesión → `/`) y, tras él, el guard de rol |
| 2 | Usuario autenticado sin rol admin → `/admin` | BLOQUEADO | `admin/route.tsx` (consulta `user_roles` → redirige a `/app`) |
| 3 | Usuario sin rol admin → subruta directa (`/admin/wallets`) | BLOQUEADO | el layout padre `/admin` ejecuta su `beforeLoad` antes de la subruta; además RLS y `requireAdmin` bloquean los datos |
| 4 | Admin → `/admin` | PERMITIDO | rol verificado contra la base de datos |
| 5 | Admin recarga la página | PERMITIDO | `ssr:false` + sesión persistida; el guard se reevalúa en cada carga |
| 6 | Admin cierra sesión y reintenta | BLOQUEADO | sin sesión, guard de `_authenticated` |
| 7 | Sesión expirada/perdida | BLOQUEADO | `getUser()` falla → redirección; y el servidor rechaza las funciones sin token válido |

En todos los casos el bloqueo **no depende solo del frontend**: aunque se fuerce la navegación, las funciones de servidor y RLS niegan los datos.

---

## 7. Estado del backend

Funciones de servidor del panel con verificación real de rol (`requireAdmin` sobre `has_role` con el `userId` del token):

- Catálogo: `listGamesAdmin`, `listProductsAdmin`, `saveGame`, `deleteGame`, `saveProduct`, `deleteProduct`, `uploadCatalogImage`, `syncProviderCatalog`, `syncGameOffers`, `syncMissingGameOffers`, `getProviderStatus`, `setUsdRate`, `setSaldoRate` — ✅ 14 comprobaciones sobre 20 funciones; las 6 restantes son lecturas públicas del catálogo (sin coste del proveedor).
- Pagos/fondos: `savePaymentMethod`, `reviewDeposit`, `listPaymentLines`, `savePaymentLine`, `setLineReusePolicy` — ✅.
- Pedidos: 4 comprobaciones admin sobre 7 funciones; el resto son operaciones del propio cliente.
- Retiros, comercio de cuentas y credenciales: se ejecutan por RPC `SECURITY DEFINER` que comprueba admin dentro de la base de datos — ✅ protegidas incluso si se llaman directamente desde el navegador.
- Eventos (`admin/eventos.tsx`): escritura directa desde el navegador a `events`, **permitida únicamente por la política `events_admin_all`**. Protegida por RLS, pero sin capa de servidor — inconsistente con el resto (riesgo BAJO).

Ninguna operación sensible confía en botones ocultos, rutas, variables del frontend ni en un campo `isAdmin` del cliente.

---

## 8. Estado de RLS

Todas las tablas de `public` tienen RLS activado. Resultado para un **usuario autenticado normal**:

| Operación | Resultado |
|---|---|
| Leer datos administrativos (otros perfiles, wallets, fondos, retiros, pedidos ajenos, auditoría) | BLOQUEADO |
| Modificar configuración (`platform_settings`, `payment_settings`, `payment_destinations`, `payment_lines`) | BLOQUEADO |
| Modificar precios o productos / juegos | BLOQUEADO |
| Aprobar o rechazar solicitudes | BLOQUEADO (RPC comprueban admin) |
| Modificar wallets, movimientos, fondos o retiros | BLOQUEADO |
| Modificar roles | BLOQUEADO |
| Leer credenciales de cuentas de juego | BLOQUEADO (`game_account_secrets` sin SELECT para `authenticated`) |
| Leer tablas OTP (`otp_limits`, `otp_sms_log`, `otp_test_challenges`) | BLOQUEADO (cero políticas) |

Lecturas públicas intencionadas: `games`, `products`, `platform_settings`, anuncios aprobados de comercio. No exponen coste del proveedor cuando se leen por las funciones de servidor (columnas explícitas sin `g2bulk_cost`).

⚠️ **Privilegios concedidos de más** (hoy neutralizados por RLS, pero contrarios al principio de mínimo privilegio):
- `audit_log`: `anon` tiene INSERT y UPDATE; `authenticated` tiene INSERT/UPDATE/DELETE.
- `otp_limits` y `otp_sms_log`: `anon` y `authenticated` tienen SELECT/INSERT/UPDATE/DELETE.
- `platform_settings`: `authenticated` tiene INSERT/UPDATE/DELETE sin ninguna política de escritura (las escrituras funcionan hoy por la clave de servicio; una política futura mal escrita abriría el acceso).
- `products`, `games`, `profiles`, `wallets`, etc.: `authenticated` tiene DELETE a nivel de tabla; solo RLS lo impide.

---

## 9. Estado de claves

- `SUPABASE_SERVICE_ROLE_KEY` / `MONSTORE_DB_SERVICE_KEY`: solo en `src/integrations/supabase/client.server.ts`, leídas con `process.env` dentro de ejecución de servidor, importadas con `await import(...)` dentro de los manejadores. ✅
- No aparece en código de frontend, ni en variables `VITE_*`, ni en respuestas de las funciones, ni en logs, ni en archivos públicos. No es obtenible desde DevTools. ✅
- `.env` del proyecto solo contiene: `SUPABASE_PROJECT_ID`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_URL` y sus equivalentes `VITE_*` (publicables). ✅
- La clave publicable es la única clave de Supabase presente en frontend. ✅
- `G2BULK_API_KEY` solo en `src/lib/g2bulk.server.ts`; credenciales zdSMS solo en `src/lib/zdsms.server.ts`; `MONSTORE_OTP_PEPPER` solo servidor. ✅

---

## 10. Estado de sesiones

- Persistencia y refresh: gestionados por el cliente oficial de Supabase; la recarga mantiene la sesión y vuelve a evaluar el guard.
- Logout: `supabase.auth.signOut()` limpia la sesión; las funciones de servidor dejan de recibir token válido.
- Expiración/revocación: al caducar el token, `requireSupabaseAuth` responde 401 y el guard redirige.
- Cambio de rol durante la sesión: **se aplica en la siguiente navegación/consulta**, porque el rol se lee de la base de datos en cada `beforeLoad` y en cada función, no del token. ✅
- Sesión válida ≠ acceso administrativo: siempre se exige **sesión + fila en `user_roles`**. ✅

---

## 11. Riesgos encontrados

| # | Riesgo | Nivel | Detalle |
|---|---|---|---|
| R1 | El acceso real sigue siendo teléfono + **contraseña**; existen `signUp`/`signInWithPassword` | ALTO | Contradice la arquitectura definitiva (solo OTP). Un admin con contraseña débil o filtrada entra sin SMS |
| R2 | Ruta pública `/prueba-otp` operativa en producción | ALTO | Puede **crear cuentas** en `auth.users` (`createUser`) y emitir sesiones; con zdSMS sin credenciales funciona en modo simulado, por lo que nadie recibe el código y no hay bypass directo, pero es superficie innecesaria y permite consumir cuota y generar cuentas vacías |
| R3 | Privilegios de tabla excesivos para `anon`/`authenticated` en `audit_log`, `otp_limits`, `otp_sms_log`, `platform_settings` | MEDIO | Hoy contenidos solo por RLS; cualquier política futura permisiva los convierte en escritura real |
| R4 | `platform_settings` sin política de escritura pero con GRANT de escritura | MEDIO | Configuración crítica dependiente de una sola capa |
| R5 | Escritura directa a `events` desde el navegador en `admin/eventos.tsx` | BAJO | Protegido por RLS, pero sin comprobación en servidor como el resto del panel |
| R6 | `pepper()` tiene valor por defecto embebido si faltara la variable | BAJO | Degradaría la fuerza del hash OTP en un despliegue mal configurado |
| R7 | `has_role` no es `SECURITY DEFINER` | BAJO | Falla cerrado, pero no sirve para comprobar el rol de terceros; riesgo de uso incorrecto futuro |
| R8 | El panel muestra datos personales y financieros de todos los usuarios | INFORMATIVO | Correctamente restringido a admin por RLS |

**No se encontró ninguna vía de escalada de privilegios** (sección 11 del encargo): un usuario normal no puede modificar su rol ni el de otros, no puede ejecutar RPC administrativas (todas comprueban admin), no puede llamar funciones de servidor administrativas (`requireAdmin`), y las llamadas directas a la API de datos quedan bloqueadas por RLS. Ninguna comprobación se basa en parámetros manipulables del cliente.

---

## 12. Elementos correctos

- Roles en tabla separada, sin posibilidad de autoconcesión.
- Triple capa de protección (ruta, servidor, base de datos).
- RPC financieras y de credenciales con `SECURITY DEFINER` + comprobación de admin.
- Clave de servicio estrictamente en servidor; única clave pública en frontend es la publicable.
- OTP con hash, pimienta, expiración, intentos, uso único, cooldown y límites por teléfono e IP; sesión resultante oficial de Supabase.
- Coste del proveedor y credenciales de cuentas nunca expuestos en lecturas públicas.
- Cambio de rol y logout surten efecto inmediato en la siguiente comprobación.

---

## 13. Elementos pendientes

1. Sustituir el login por contraseña por teléfono + OTP y eliminar `signUp`/`signInWithPassword`.
2. Retirar o proteger `/prueba-otp` y promover el flujo OTP a ruta oficial.
3. Confirmar conectividad y credenciales de zdSMS antes del cambio (hoy modo simulado).
4. Ajustar privilegios de tabla al mínimo necesario (R3, R4).
5. Unificar las escrituras de eventos a través de una función de servidor con `requireAdmin`.
6. Replicar todo este modelo de roles, RLS y RPC en el backend canónico antes del cutover.

---

## 14. Nivel de riesgo y 15. Recomendación por problema

| Riesgo | Nivel | Recomendación concreta |
|---|---|---|
| R1 contraseña vigente | ALTO | En la fase de cutover de Auth: eliminar `signInWithPassword`/`signUp` de `src/lib/auth.ts`, `/registro` y `/`, y dejar únicamente teléfono + OTP |
| R2 ruta de prueba | ALTO | Retirar `/prueba-otp`, o exigir zdSMS real y quitar la creación automática de cuentas hasta el cutover |
| R3 GRANT excesivos | MEDIO | `REVOKE` de INSERT/UPDATE/DELETE a `anon` y `authenticated` en `audit_log`, `otp_limits`, `otp_sms_log`; revocar SELECT de `anon` donde no aplique |
| R4 `platform_settings` | MEDIO | Revocar escritura a `authenticated` y mantener las actualizaciones por función de servidor con rol verificado |
| R5 eventos | BAJO | Mover el alta y la edición de eventos a `createServerFn` con `requireAdmin` |
| R6 pepper por defecto | BAJO | Fallar explícitamente si `MONSTORE_OTP_PEPPER` no está definido |
| R7 `has_role` | BAJO | Declararla `SECURITY DEFINER` (como el patrón recomendado) o documentar que solo sirve para `auth.uid()` |

Ninguna de estas recomendaciones se ha aplicado: esta fase es solo auditoría.

---

## 16. Pruebas realizadas

Todas de lectura, sin escrituras ni operaciones destructivas:

1. Lectura de los guards de ruta (`_authenticated/route.tsx`, `admin/route.tsx`) y de `src/start.ts`.
2. Inventario de las 16 rutas administrativas.
3. Recuento de funciones de servidor frente a comprobaciones `requireAdmin` en catálogo, pedidos y pagos.
4. Definición, `SECURITY DEFINER` y permisos `EXECUTE` de las 22 funciones de `public`.
5. Inventario completo de políticas RLS de las tablas administrativas y de usuario.
6. Matriz de privilegios de tabla para `anon` y `authenticated` en las 29 tablas de `public`.
7. Búsqueda de claves de servicio en código, `.env` y variables `VITE_*`.
8. Revisión del flujo OTP: generación, hash, límites, intentos, consumo y emisión de sesión.
9. Revisión de los métodos de autenticación existentes en el cliente.
10. Revisión de las escrituras hechas directamente desde pantallas administrativas.

---

## 17. Resultado esperado vs resultado actual y criterio final

| Esperado | Actual |
|---|---|
| Protección en frontend + backend + RLS | ✅ cumplido |
| Usuario normal no puede ser admin | ✅ cumplido |
| Operaciones administrativas verificadas en servidor | ✅ cumplido (salvo eventos, protegido solo por RLS) |
| Clave de servicio solo en servidor | ✅ cumplido |
| Acceso exclusivamente por teléfono + OTP | ❌ todavía con contraseña |
| Sin métodos alternativos de acceso | ❌ existen contraseña y ruta de prueba |
| zdSMS operativo | ❌ modo simulado |

### ¿El Admin Panel está realmente protegido para producción?

## 🟡 APROBADO CON PENDIENTES

**Por qué:** el control de acceso al panel es sólido y no se detectó ninguna vía de escalada de privilegios — un cliente normal no puede entrar, ni leer, ni ejecutar nada administrativo, ni por interfaz ni por llamadas directas. Lo que impide el verde es que el **método de acceso** aún no es el definitivo: sigue habiendo contraseña y una ruta pública de prueba que puede crear cuentas, y el envío de SMS no está operativo. Resueltos R1 y R2 (y, preferiblemente, R3–R4), el panel queda en estado 🟢.

---

**Fin de la Fase 2.9.0.** No se realizó ninguna modificación. Esperando autorización para la siguiente fase.
