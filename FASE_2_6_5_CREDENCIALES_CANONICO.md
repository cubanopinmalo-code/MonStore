# FASE 2.6.5 — Autorización controlada de credenciales Supabase

Estado: **DOCUMENTACIÓN DE CREDENCIALES. No se ejecutó ningún cambio.**

- Backend actual (sin tocar): `https://yfimkckjhhvxkbkyxexd.supabase.co`
- Backend canónico (destino): `https://nklgztbukgaoycuaryzk.supabase.co`
- La aplicación sigue conectada a `yfimkckjhhvxkbkyxexd`.
- No se migraron datos, usuarios, catálogo, archivos, Auth ni OTP.
- No se eliminaron ni revocaron funciones.
- No se introdujeron credenciales reales.
- No se realizaron operaciones irreversibles.

---

## Límites OTP confirmados (definitivos)

Los siguientes límites quedan aprobados y ya coinciden con `DEFAULT_OTP_LIMITS` en
`src/lib/otp-config.server.ts`. No requieren cambio de código:

| Límite | Valor aprobado | Campo en `otp_limits` |
|---|---|---|
| Solicitudes por teléfono cada 24 h | **5** | `max_per_phone_per_day` |
| Mínimo entre solicitudes | **60 s** | `resend_cooldown_seconds` |
| Dígitos del código | **6** | `code_length` |
| Expiración del código | **5 min (300 s)** | `ttl_seconds` |
| Intentos máximos por código | **5** | `max_attempts` |
| Uso del código | **único** (invalidado tras verificar o expirar) | diseño del flujo |
| Límite por origen/IP | **10 por hora** | `max_per_ip_per_hour` |
| Registro del código en logs | **nunca** | diseño del flujo |
| Tope diario de SMS del proyecto | **sin definir** (`null` = sin tope) | `daily_sms_cap` |

El tope diario de SMS del proyecto (`daily_sms_cap`) sigue en `null`. Este campo
es independiente del límite por teléfono y queda pendiente de decisión futura; no
bloquea la preparación.

---

## 1. Clave pública / publicable (publishable / anon)

### Finalidad

Permite que el cliente (navegador) y el servidor (SSR / server functions en modo
publicable) lean y escriban en la base de datos **a través de las reglas de acceso
(RLS)**. Nunca otorga privilegios administrativos ni elude RLS.

### Dónde será utilizada

| Ubicación | Variable | Acceso |
|---|---|---|
| Navegador (cliente) | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID` | Inyectadas en build-time por Vite; visibles en el bundle del navegador |
| SSR / server functions (cliente publicable) | `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_PROJECT_ID` | Leídas dentro de `process.env` en el servidor; nunca se exponen al navegador |
| Middleware de auth (`auth-middleware.ts`) | `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | Valida el token del usuario en cada server function protegida |

### ¿Será visible en el frontend?

**Sí.** Es una clave *publicable* por diseño. El sistema de seguridad de Supabase
la considera pública: el acceso a datos se controla exclusivamente mediante RLS.
Aparece en el bundle JavaScript del navegador, lo cual es el comportamiento
esperado y seguro. **No debe confundirse con la Service Role Key**, que jamás debe
aparecer en el navegador.

### Variables exactas necesarias (proyecto canónico)

```
SUPABASE_PROJECT_ID       = nklgztbukgaoycuaryzk
SUPABASE_URL              = https://nklgztbukgaoycuaryzk.supabase.co
SUPABASE_PUBLISHABLE_KEY  = sb_publishable_xxx...   (clave pública del proyecto canónico)
VITE_SUPABASE_PROJECT_ID       = nklgztbukgaoycuaryzk
VITE_SUPABASE_URL              = https://nklgztbukgaoycuaryzk.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY  = sb_publishable_xxx...   (misma clave pública)
```

> El usuario debe obtener estos tres valores desde la consola del proyecto
> `nklgztbukgaoycuaryzk`: **Settings → API → Project URL** y **Project API keys
> → `publishable` (anon)**. La clave nueva de Supabase tiene el prefijo
> `sb_publishable_`.

---

## 2. Service Role Key

### Finalidad exacta

Permite que el servidor (exclusivamente) ejecute operaciones que **eluden las
reglas de acceso (RLS)** para trabajo administrativo y operaciones sensibles.
Es la única clave que puede escribir en tablas que el cliente nunca debe tocar
directamente.

### Operaciones que requieren privilegios elevados

| Operación | Razón |
|---|---|
| `auth.admin.generateLink({ type: 'magiclink' })` | Crea el enlace de un solo uso que convierte una verificación OTP válida en una sesión oficial de Supabase (Fase 2.5) |
| Movimientos de wallet (cargar saldo tras depósito aprobado, descontar tras compra) | El destino exige que el cliente no pueda modificar su saldo; solo el servidor puede escribir |
| Aprobación / rechazo de solicitudes de fondos (`fund_requests`) | El cliente no puede modificar solicitudes; el servidor aplica la decisión del administrador |
| Aprobación / rechazo de retiros (`withdrawals`) | El servidor aplica la decisión y mueve el saldo |
| Aprobación / rechazo de publicaciones de cuentas (`listings`) | El servidor verifica credenciales y cambia el estado |
| Procesar pedido: `pay_order` → procesar → entregar / fallar | El servidor descuenta saldo, libera `held_balance`, registra movimientos |
| Reembolso de pedido | El servidor devuelve saldo y revierte `held_balance` |
| Sincronización de catálogo desde G2Bulk | El servidor escribe juegos/ofertas con los costos del proveedor |
| Registro de consumo de SMS (`otp_sms_log`) | El cliente no tiene permiso sobre esta tabla |
| Lectura de límites OTP (`otp_limits`) | El cliente no tiene permiso de lectura |
| Creación de buckets de Storage y políticas | Configuración inicial de los cuatro depósitos privados |
| Migración de datos (futura) | Escritura masiva de perfiles, wallets, catálogo, pedidos, etc. |

### Dónde será almacenada

Exclusivamente como **secreto de entorno del servidor**. En el código se lee
dentro del `handler` de una server function o dentro de un archivo `.server.ts`,
nunca en módulos que llegan al navegador.

Variable: `SUPABASE_SERVICE_ROLE_KEY`

En esta plataforma, los secretos se almacenan mediante el gestor de secretos
(herramienta `add_secret` / `set_secret`), no en archivos `.env` confirmados al
repositorio. El valor se inyecta en tiempo de ejecución solo en el servidor.

### Confirmaciones de seguridad

| Garantía | Estado |
|---|---|
| Nunca enviada al navegador | **Confirmado.** Se carga con `await import('@/integrations/supabase/client.server')` dentro del handler; el empaquetador bloquea los archivos `.server.ts` del bundle del cliente. |
| Nunca incluida en GitHub | **Confirmado.** No aparece en `.env` (que está en `.gitignore`); se almacena como secreto de entorno, no como literal en código. |
| Nunca aparece en logs | **Confirmado.** Ningún `console.log`, `console.error` ni respuesta de API imprime la clave. El middleware de auth y `client.server.ts` la usan internamente sin registrarla. |
| Protección del importador | `client.server.ts` usa un Proxy que crea el cliente bajo demanda; el archivo está protegido por la convención `.server.ts` que impide su inclusión en el bundle del navegador. |

### Variable exacta necesaria (proyecto canónico)

```
SUPABASE_SERVICE_ROLE_KEY = sb_secret_xxx...   (Service Role Key del proyecto canónico)
```

> El usuario debe obtener este valor desde la consola del proyecto
> `nklgztbukgaoycuaryzk`: **Settings → API → Project API keys → `service_role`**.
> La clave nueva de Supabase tiene el prefijo `sb_secret_`.
>
> **Esta clave no debe compartirse en chat ni pegarse en código.** Se almacenará
> como secreto del entorno mediante la herramienta segura `add_secret` cuando el
> usuario autorice.

---

## 3. Otras variables de entorno necesarias

### 3.1 Credenciales de zdSMS (proveedor de SMS)

| Variable | Finalidad | Dónde se usa | ¿Frontend? |
|---|---|---|---|
| `ZDSMS_EMAIL` | Autenticación con la API de zdSMS (`POST /v1/token`) | `src/lib/zdsms.server.ts` (solo servidor) | **No** |
| `ZDSMS_PASSWORD` | Autenticación con la API de zdSMS | `src/lib/zdsms.server.ts` (solo servidor) | **No** |

Ambas se leen dentro de la función `credentials()`, nunca en módulos del cliente.
Sin credenciales, el sistema simula el envío (modo `mock`) sin llamar a la API
real.

> El usuario debe obtener estas credenciales desde su cuenta de zdSMS
> (https://zdsms.cu). Se almacenarán como secretos de entorno.
> **No solicitarlas todavía.**

### 3.2 Pepper para huellas de teléfono/IP

| Variable | Finalidad | Dónde se usa | ¿Frontend? |
|---|---|---|---|
| `OTP_PEPPER` (o `OTP_TEST_PEPPER`) | Sal adicional para los hashes SHA-256 de teléfono e IP en `otp_sms_log`, para que no sean reversibles | `src/lib/otp-usage.server.ts` (solo servidor) | **No** |

Actualmente usa un valor de prueba por defecto (`"monstore-fase-2-6-prueba"`).
Para producción se debe definir un pepper real y secreto.

> Se puede generar automáticamente con `generate_secret` (valor criptográfico
> aleatorio). No requiere intervención del usuario.

### 3.3 Variables ya gestionadas (no requieren acción)

| Variable | Estado | Nota |
|---|---|---|
| `LOVABLE_API_KEY` | Gestionada por la plataforma | No editable via herramientas de secretos; rotar con `lovable_api_key--rotate_lovable_api_key` |
| `LOVABLE_CRON_SECRET` | Gestionada por la plataforma | No editable ni eliminable via herramientas de secretos |

### 3.4 Variables que NO se necesitan

| Variable | Razón |
|---|---|
| Contraseña de la base de datos PostgreSQL | Lovable Cloud no la expone; todas las operaciones usan la API REST y Auth de Supabase, no conexiones directas a PostgreSQL |
| OAuth client secret (Google, etc.) | No se usa OAuth social; el acceso es exclusivamente por teléfono + OTP |
| JWT secret personal | Supabase gestiona internamente los tokens de sesión |

---

## 4. Resumen de credenciales requeridas

### Credenciales que el usuario debe obtener del proyecto canónico

| # | Variable | Tipo | Origen | ¿Visible en frontend? |
|---|---|---|---|---|
| 1 | `SUPABASE_URL` + `VITE_SUPABASE_URL` | Pública | Consola de `nklgztbukgaoycuaryzk` → Settings → API → Project URL | Sí (por diseño) |
| 2 | `SUPABASE_PUBLISHABLE_KEY` + `VITE_SUPABASE_PUBLISHABLE_KEY` | Pública | Consola → Settings → API → `publishable` (anon) key | Sí (por diseño) |
| 3 | `SUPABASE_PROJECT_ID` + `VITE_SUPABASE_PROJECT_ID` | Pública | `nklgztbukgaoycuaryzk` | Sí (por diseño) |
| 4 | `SUPABASE_SERVICE_ROLE_KEY` | **Secreta** | Consola → Settings → API → `service_role` key | **No, nunca** |

### Credenciales que el usuario debe obtener de zdSMS

| # | Variable | Tipo | Origen | ¿Visible en frontend? |
|---|---|---|---|---|
| 5 | `ZDSMS_EMAIL` | Secreta | Cuenta de zdSMS (https://zdsms.cu) | **No, nunca** |
| 6 | `ZDSMS_PASSWORD` | Secreta | Cuenta de zdSMS (https://zdsms.cu) | **No, nunca** |

### Credenciales generadas automáticamente (no requieren intervención)

| # | Variable | Tipo | Cómo se obtiene | ¿Visible en frontend? |
|---|---|---|---|---|
| 7 | `OTP_PEPPER` | Secreta | `generate_secret` (valor aleatorio) | **No, nunca** |

---

## 5. Orden de configuración (cuando el usuario autorice)

1. El usuario obtiene las tres claves públicas y la Service Role Key desde la
   consola del proyecto `nklgztbukgaoycuaryzk`.
2. El usuario obtiene las credenciales de zdSMS desde su cuenta.
3. El usuario configura cada secreto mediante el formulario seguro (`add_secret`),
   una variable a la vez. Las claves públicas pueden almacenarse en `.env`
   (son públicas); la Service Role Key y las credenciales de zdSMS deben almacenarse
   como secretos.
4. El sistema verifica que cada variable es accesible sin imprimir su valor.
5. **No se cambia la conexión de producción hasta una fase posterior autorizada.**

---

## 6. Confirmaciones finales

- La Customer App sigue conectada a `yfimkckjhhvxkbkyxexd`.
- El backend canónico definitivo sigue siendo `nklgztbukgaoycuaryzk`.
- No se migró ni modificó ningún dato.
- No se introdujo ninguna credencial real.
- No se eliminó ninguna función.
- No se realizó ningún cambio irreversible.
- No se cambió el sistema OTP.
- No se realizaron compras ni operaciones financieras.

**Me detengo y espero autorización para que el usuario configure las credenciales.**
