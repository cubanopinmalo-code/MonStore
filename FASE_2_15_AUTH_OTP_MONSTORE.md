# FASE 2.15 — Sistema de acceso de MonStore: teléfono + OTP

Fecha: 2026-09-14 (UTC)
Backend: **Lovable Cloud** (único backend y fuente de verdad).
Proveedor de SMS: **modo simulado** (sin credenciales reales de zdSMS, sin envíos reales).

---

## 1. Arquitectura de Auth

| Capa | Responsable |
|---|---|
| Identidad de acceso | número de teléfono normalizado (8 dígitos, móvil cubano) |
| Identificador técnico | UUID de Supabase Auth (`auth.users.id`) |
| Correo interno derivado | `<telefono>@telefono.monstore.cu` (no recibe correo; solo sirve de clave de identidad en Auth) |
| Sesión | sesión **oficial** de Supabase Auth (access + refresh token, auto-refresh) |
| Datos del usuario | `profiles` → `wallets` → `user_roles` → operaciones |

Cadena: `auth user` → `profile` → `wallet` → `roles` → operaciones.

No existe: contraseña, alta con contraseña, acceso por nombre, acceso por correo, recuperación por correo, ni segundo sistema de sesión. Verificado por búsqueda en todo `src/`: cero apariciones de `signInWithPassword`, `signUp(`, `resetPasswordForEmail`.

Normalización única (`src/lib/phone.ts`): `+5355550001`, `0053 5555 0001`, `5355550001` y `55550001` producen **la misma** identidad. Comprobado en pruebas (una sola cuenta, mismo UUID).

Cambio de esta fase en la pantalla de acceso: se **eliminó el campo de nombre**. El acceso pide solo teléfono y código; el nombre se completa después en el perfil.

## 2. Flujo OTP

1. La persona escribe su teléfono → `requestOtp` (servidor).
2. El servidor comprueba límites, genera un código de 6 cifras con generador criptográfico, guarda **solo la huella** `SHA-256(telefono:codigo:MONSTORE_OTP_PEPPER)`, invalida los códigos anteriores del mismo teléfono y pide el envío del SMS (hoy simulado).
3. La persona escribe el código → `verifyOtp` (servidor): comprueba existencia, caducidad, intentos y huella; consume el desafío de forma condicionada (`consumed_at IS NULL`), lo que impide repetición y uso simultáneo.
4. El servidor obtiene/crea la identidad Auth y emite un enlace de un solo uso; devuelve al navegador **únicamente** su `hashed_token`.
5. El navegador lo canjea con `verifyOtp({ token_hash, type: 'email' })` → sesión oficial de Supabase Auth.
6. El servidor ejecuta el alta idempotente de perfil, rol y wallet.

El código nunca se devuelve al navegador, nunca se escribe en logs, nunca aparece en respuestas y nunca se guarda en claro.

## 3. Seguridad

- Huella SHA-256 con pimienta de servidor `MONSTORE_OTP_PEPPER` (secreto de servidor, no está en base de datos, no llega al navegador, no se imprime, no se regenera).
- Uso único con consumo condicionado → protección contra repetición y contra código reutilizado.
- Caducidad de 5 minutos.
- Máximo 5 intentos por código; al superarlo el desafío queda inservible aunque el código sea correcto.
- Respuestas neutras: la respuesta al pedir código es idéntica exista o no la cuenta → no permite enumerar usuarios.
- Tablas `otp_challenges`, `otp_limits`, `otp_sms_log`: **sin permisos** para visitantes ni para usuarios con sesión; solo el servidor. RLS activo y sin políticas a propósito (denegación total en la API).
- Registro de consumo con teléfono y origen **en huella + máscara** (`***0001`), nunca en claro y nunca con el código.
- Se cerró el acceso sin sesión a las operaciones internas que antes podían invocarse desde el exterior (wallet, fondos, retiros, pedidos, eventos, comercio, referidos, moneda) y se retiró el permiso de invocación de las funciones internas de mantenimiento.

## 4. Límites de frecuencia

Configurables en `otp_limits` (solo servidor); valores activos:

| Límite | Valor |
|---|---|
| Longitud del código | 6 |
| Caducidad | 300 s (5 min) |
| Intentos por código | 5 |
| Espera entre reenvíos | 60 s |
| Solicitudes por teléfono / 24 h | 5 |
| Solicitudes por origen / hora | 10 |
| Tope global diario de SMS | sin tope (pendiente de decisión) |

## 5. Sesiones

Sesión oficial de Supabase Auth con auto-refresh y persistencia. Sobrevive a recargar la página. El cierre de sesión limpia la caché del cliente, invalida la sesión y navega a la pantalla de acceso reemplazando el historial; al recargar no se recupera la sesión anterior. No existe JWT paralelo ni sesión propia.

## 6. Perfiles · 7. Wallet inicial · 8. Roles

Nueva función interna `provision_user_account` (solo servidor, idempotente):

- crea el perfil si falta y mantiene el teléfono sincronizado;
- crea el rol `user` si falta;
- crea la wallet con **saldo 0 CUP** si falta;
- registra el invitador si el enlace de referido es válido.

Repetir el acceso no duplica nada (claves únicas en `wallets.user_id` y `user_roles(user_id, role)`), y **no genera ningún movimiento financiero**.

## 9. Protección del admin

Tres capas, sin cambios de modelo (el teléfono nunca concede privilegios):

| Capa | Mecanismo |
|---|---|
| Rutas | `_authenticated/route.tsx` (sesión) + `_authenticated/admin/route.tsx` (consulta `user_roles`) |
| Servidor | `createServerFn` + `requireSupabaseAuth` + comprobación de rol |
| Base de datos | políticas RLS con `has_role(auth.uid(),'admin')` |

Mejora aplicada: `has_role()` pasa a ejecutarse con privilegios controlados del servidor (antes fallaba al comprobar roles ajenos) y se añadió `is_admin()`. Ambas solo pueden invocarse con sesión.

Rutas: cliente `/app/...`, administración `/admin/...`, aplicación unificada.

## 10. Resultados de pruebas

Ejecutadas contra la aplicación real, con SMS simulado y cuentas temporales.

| # | Prueba | Esperado | Resultado |
|---|---|---|---|
| A | Teléfono nuevo | entra y se registra | ✅ entra en `/app` |
| B | Teléfono existente | misma cuenta | ✅ mismo UUID, sin duplicados |
| C | Código incorrecto | rechazado | ✅ |
| D | Código caducado | rechazado | ✅ |
| E | Código ya usado | rechazado | ✅ |
| F | Más de 5 intentos | bloqueado | ✅ y el código correcto ya no sirve |
| G | Reenvío antes de 60 s | bloqueado | ✅ |
| H | Más de 5 solicitudes/24 h | bloqueado | ✅ |
| I | `+5355550001` vs `0053 5555 0001` | misma identidad | ✅ 1 cuenta, 1 perfil, 1 wallet |
| J | Recarga con sesión activa | mantiene sesión | ✅ |
| K | Cierre de sesión + recarga | no recupera sesión | ✅ |
| L | `/admin` y `/admin/wallets` sin sesión | bloqueado | ✅ enviado al acceso |
| M | `/admin` con cliente normal | bloqueado | ✅ enviado a `/app` |
| N | `/admin` con administrador | permitido | ✅; al retirar el rol vuelve a bloquear |
| O | Cliente intenta darse admin | bloqueado | ✅ HTTP 403 |
| P | Cliente intenta cambiar su saldo | bloqueado | ✅ 0 filas modificadas, saldo 0 |
| 13 | Integridad financiera del alta | 1 wallet, 0 CUP, 0 movimientos | ✅ |
| — | Compilación y pruebas automáticas | sin errores | ✅ `tsgo` limpio, 7 pruebas en verde |

Estado final verificado tras limpiar: 0 usuarios, 0 perfiles, 0 wallets, 0 roles, 0 movimientos, 0 desafíos, 0 registros de SMS y 0 trazas de auditoría de prueba.

## 11. Auditoría y trazabilidad

Se registran en `audit_log` (`entity_type = 'auth'`): `otp_solicitado`, `otp_rechazado`, `otp_bloqueado`, `login`, `login_fallido`. Solo el evento, el motivo y el teléfono enmascarado. **Nunca el código.** Comprobado en las pruebas.

## 12. Problemas y riesgos

- El cierre de sesión ocurre en el navegador, por lo que **no deja traza `logout`** en la auditoría. Riesgo bajo; se puede añadir en una fase posterior.
- El correo interno derivado del teléfono no puede recibir mensajes: cualquier flujo por correo queda descartado por diseño.
- Sin tope global diario de SMS, el gasto del proveedor no tiene techo cuando se conecte el envío real.
- Avisos de seguridad restantes del proyecto (ajenos al acceso): una vista de eventos con permisos del creador y funciones internas invocables por usuarios con sesión que verifican el rol dentro de sí mismas; y las tres tablas del sistema de códigos con RLS sin políticas, que es intencionado.
- Un cambio de `MONSTORE_OTP_PEPPER` invalida los códigos pendientes (efecto momentáneo, aceptable).

## 13. Pendientes para zdSMS

La sustitución del envío simulado por el real solo requiere configurar `ZDSMS_EMAIL` y `ZDSMS_PASSWORD`: el punto de envío está aislado en `zdsms.server.ts` y no toca identidad, códigos, sesiones, perfiles, roles ni wallets. Falta además decidir el tope diario de SMS y confirmar el alcance de red al proveedor desde la aplicación publicada.

---

## VEREDICTO

🟡 **AUTH LISTA CON PENDIENTES**

El acceso por teléfono + código funciona de extremo a extremo, con identidad única, sesión oficial, alta idempotente con saldo 0 CUP y panel administrativo protegido en tres capas. Pendientes: envío real de SMS (zdSMS), tope diario de mensajes y traza de cierre de sesión.

**Fin de la Fase 2.15. Esperando autorización.**
