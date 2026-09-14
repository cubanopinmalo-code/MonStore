# FASE 2.9.0.1 — Corrección de acceso administrativo y cierre de superficies de prueba

Fecha: 2026-09-14 (UTC)
Backend: proyecto actual del Customer App (`yfimkckjhhvxkbkyxexd`). Sin cutover, sin cambio de conexión.
Alcance ejecutado: **exclusivamente** los tres pendientes de la Fase 2.9.0 (R1 contraseña, R2 ruta de prueba, R3 permisos de más).

---

## 1. Cambios realizados

### 1.1 Acceso exclusivamente por teléfono + OTP (R1)

- `src/lib/auth.ts`: eliminadas `signInWithPhone` (contraseña) y `signUpWithPhone` (alta con contraseña). El módulo conserva únicamente `signOut` y reexporta los ayudantes canónicos de teléfono. **No queda ningún punto del código que llame a `signInWithPassword`, `signUp`, `resetPasswordForEmail` ni a recuperación por correo.**
- `src/lib/otp-test.functions.ts` → **`src/lib/otp.functions.ts`** (deja de ser "de prueba" y pasa a ser el módulo real). Funciones renombradas: `requestOtpTest` → `requestOtp`, `verifyOtpTest` → `verifyOtp`. La arquitectura no cambió: es la misma probada en la Fase 2.6.
- `verifyOtp` acepta ahora `name` y `referralCode` opcionales, que se pasan como `user_metadata` en el alta; así el disparador existente `handle_new_user()` sigue creando `profiles`, `wallets` y la referencia del invitador igual que antes. No se creó ningún sistema de identidad paralelo.
- `src/routes/index.tsx`: pantalla de acceso reescrita en dos pasos — teléfono (+ nombre solo la primera vez) → código de 6 cifras → `verifyOtp` de Supabase (`token_hash`, `type: 'email'`) → sesión oficial. Con cuenta atrás de reenvío de 60 s y mensajes neutros de `otp-messages.ts`. Ya no existen pestañas "Iniciar sesión / Crear cuenta" ni campo de contraseña.

Flujo definitivo: **teléfono → OTP → validación en servidor → sesión oficial de Supabase → consulta de rol en `user_roles` → acceso al panel**.

### 1.2 Ruta pública de prueba eliminada (R2)

- **Eliminado** `src/routes/prueba-otp.tsx`. `/prueba-otp` ya no existe (404). No queda ninguna interfaz pública capaz de crear cuentas, emitir sesiones ni validar códigos fuera del acceso oficial.
- El código reutilizable del sistema OTP **no se eliminó**: sigue en `src/lib/otp.functions.ts`, `otp-config.server.ts`, `otp-usage.server.ts`, `otp-messages.ts`, `phone.ts` y `zdsms.server.ts`.

### 1.3 Roles y protección en tres capas (sin cambios estructurales)

No se modificó el modelo de roles: sigue `public.user_roles` + `has_role()`. El teléfono **no** determina el rol.

| Capa | Mecanismo | Estado |
|---|---|---|
| Frontend | `_authenticated/route.tsx` (sesión) + `_authenticated/admin/route.tsx` (consulta `user_roles`) | intacto |
| Servidor | `createServerFn` + `requireSupabaseAuth` + `requireAdmin()` | intacto |
| Base de datos | RLS `*_admin_all` con `has_role(auth.uid(),'admin')` y RPC `SECURITY DEFINER` | intacto |

---

## 2. Rutas modificadas

| Ruta | Cambio |
|---|---|
| `/` | Acceso por teléfono + código; sin contraseña ni registro con clave |
| `/prueba-otp` | **Eliminada** (404) |
| `/login`, `/registro` | Sin cambios (siguen redirigiendo a `/`) |
| `/admin/*` | Sin cambios (guards ya correctos) |

---

## 3. Los tres permisos identificados

Estado **antes** (verificado sobre `pg_class.relacl`): `anon` y `authenticated` tenían `SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE, MAINTAIN`.

| # | Objeto | ¿Quién lo usa realmente? | ¿Necesario para anon/authenticated? |
|---|---|---|---|
| 1 | `public.audit_log` | Funciones `SECURITY DEFINER` del propio servidor (revisiones de fondos, retiros, anuncios) | **No** |
| 2 | `public.otp_limits` | `src/lib/otp-config.server.ts`, solo con clave de servicio | **No** |
| 3 | `public.otp_sms_log` | `src/lib/otp-usage.server.ts`, solo con clave de servicio | **No** |

Comprobación previa: `rg` sobre todo `src/` confirma que **ningún código de navegador** consulta esas tres tablas; ninguna funcionalidad legítima depende de esos privilegios.

### Permisos revocados

Migración `drizzle/migrations/0011_revoke_excess_grants_audit_otp.sql`:

```sql
REVOKE ALL ON TABLE public.audit_log   FROM anon, authenticated;
REVOKE ALL ON TABLE public.otp_limits  FROM anon, authenticated;
REVOKE ALL ON TABLE public.otp_sms_log FROM anon, authenticated;
GRANT  ALL ON TABLE public.audit_log   TO service_role;  -- se mantiene
GRANT  ALL ON TABLE public.otp_limits  TO service_role;  -- se mantiene
GRANT  ALL ON TABLE public.otp_sms_log TO service_role;  -- se mantiene
```

Estado **después**: en esas tres tablas solo `postgres` y `service_role` conservan privilegios. No se tocó ningún otro permiso, ninguna política RLS ni ninguna otra tabla (R4–R7 quedan pendientes, fuera de esta autorización).

---

## 4. Pruebas realizadas y resultado

Ejecutadas contra la aplicación en ejecución, con el proveedor de SMS en **modo simulado**.

| # | Prueba | Resultado esperado | Resultado obtenido |
|---|---|---|---|
| 1 | Cliente: teléfono → código → sesión | PERMITIDO | ✅ sesión oficial creada, redirige a `/app` |
| 2 | Cliente normal (rol `user`) → `/admin` | BLOQUEADO | ✅ redirigido a `/app` |
| 3 | Administrador: teléfono → código → `/admin` | PERMITIDO | ✅ entra en `/admin` y `/admin/wallets` |
| 4 | Usuario no autenticado → `/admin` y `/admin/wallets` | BLOQUEADO | ✅ redirigido a `/` |
| 5 | Cierre de sesión → `/admin` | BLOQUEADO | ✅ redirigido a `/` |
| 6 | Ruta de prueba `/prueba-otp` | NO EXISTE | ✅ HTTP 404 |
| 7 | Pantalla de acceso sin contraseña | sin contraseña | ✅ no contiene campo ni texto de contraseña |
| 8 | Cliente lee `audit_log` / `otp_limits` / `otp_sms_log` por API | BLOQUEADO | ✅ HTTP 403 (42501) en las tres |
| 9 | Cliente inserta en `audit_log` | BLOQUEADO | ✅ HTTP 403 (42501) |
| 10 | Cliente intenta darse rol `admin` | BLOQUEADO | ✅ 403, violación de RLS |
| 11 | Cliente intenta cambiar el precio de productos | BLOQUEADO | ✅ 0 filas modificadas (RLS) |
| 12 | Lecturas públicas del catálogo (`games`) | PERMITIDO | ✅ HTTP 200 |
| 13 | Cliente lee su propia wallet | PERMITIDO | ✅ HTTP 200 |
| 14 | Límites OTP (espera de 60 s entre solicitudes) | activo | ✅ el reenvío quedó bloqueado durante la cuenta atrás |
| 15 | Compilación y pruebas automáticas | sin errores | ✅ `tsgo --noEmit` limpio, 7 pruebas en verde, build OK |

Cuenta de prueba: se creó temporalmente el número `53112233`, se le concedió y **retiró** el rol admin, y la cuenta fue **eliminada** al terminar, junto con sus códigos temporales. Estado final verificado: 0 cuentas de prueba, 1 administrador (el existente), catálogo intacto (6.193 productos, suma `293.721.871,45` CUP).

---

## 5. Confirmaciones

- **No se modificó** G2Bulk, catálogo, productos, precios, base de precios, wallet, fondos, retiros, órdenes, eventos, comercio, notificaciones, referidos, Storage ni el Supabase canónico.
- **No se usaron credenciales reales de zdSMS**: `ZDSMS_EMAIL` y `ZDSMS_PASSWORD` siguen sin configurar y el envío continúa en modo simulado. No se envió ningún SMS real.
- **No se conectó G2Bulk** ni se avanzó a la Base de Precios.
- El código OTP nunca se muestra, devuelve ni registra; solo se guarda su huella.
- La clave de servicio sigue exclusivamente en el servidor.

Pendientes conocidos (fuera de esta autorización): R4 `platform_settings`, R5 eventos sin capa de servidor, R6 pepper con valor por defecto, R7 `has_role` sin `SECURITY DEFINER`, y la integración real de zdSMS.

**Fin de la Fase 2.9.0.1. Esperando autorización.**
