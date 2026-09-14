# FASE 2.15.1 — Administrador inicial de MonStore

Fecha: 2026-09-14 (UTC)
Backend: **Lovable Cloud** (único backend). SMS en **modo simulado** (sin credenciales ni envíos reales).

---

## 1. Cuenta configurada

| Dato | Valor |
|---|---|
| Identificador de usuario (UUID) | `fc2452e6-eaac-44cf-bd34-ee2139421675` |
| Teléfono (enmascarado) | `+53 5111 ****` → `***5040` |
| Teléfono normalizado | 8 dígitos, sin prefijo 53 |
| Perfil | ✅ creado (código de referido propio generado, sin datos inventados) |
| Wallet | ✅ creada, **0,00 CUP**, sin saldo retenido |
| Movimientos financieros | 0 |
| Rol anterior | `user` |
| Rol nuevo | `user` + **`admin`** |

La cuenta **no existía** (la base estaba vacía tras la limpieza de pruebas de la Fase 2.15), por lo que se creó con el **flujo normal** de MonStore: teléfono → código de un solo uso → sesión oficial → alta idempotente de perfil, rol de cliente y wallet a 0 CUP. No se creó ninguna segunda cuenta, ni perfil ni wallet duplicados, y el identificador es el que emitió Auth.

## 2. Cómo se concede el acceso administrativo

El rol se añadió en `user_roles` usando **el identificador real del usuario**, conservando su rol de cliente (la arquitectura admite varios roles).

La autorización sigue dependiendo **exclusivamente** de: sesión válida → identificador de usuario → `user_roles` → `has_role()` / `is_admin()` → RLS → comprobaciones en el servidor.

- **No** hay ningún número de teléfono escrito en el código que conceda privilegios.
- **No** existe ninguna comparación tipo `phone === "..."`, ni atajo, ni excepción.
- Búsqueda en todo `src/`: la única aparición de ese número es `SUPPORT_PHONE` en la pantalla de perfil, que es el **contacto de soporte por WhatsApp** ya existente y no interviene en ninguna comprobación de permisos.

Quitar la fila del rol en `user_roles` retira el acceso al panel de inmediato (comprobado en la Fase 2.15).

## 3. Auditoría registrada

Entrada en `audit_log`:

| Campo | Valor |
|---|---|
| Acción | `rol_admin_asignado` |
| Tipo | `user_roles` |
| Autor / afectado | el propio usuario (inicialización autorizada) |
| Antes | `roles: ["user"]` |
| Después | `roles: ["user","admin"]` |
| Motivo | inicialización del administrador principal (FASE 2.15.1) |
| Metadatos | teléfono enmascarado `***5040`, origen `inicializacion_manual_autorizada` |
| Fecha y hora | registrada automáticamente por la base de datos (UTC) |

También quedaron las trazas normales del acceso (`otp_solicitado`, `login`) con el teléfono enmascarado y **sin el código** en ningún caso.

## 4. Resultado de las pruebas

| # | Prueba | Esperado | Resultado |
|---|---|---|---|
| C | Sin sesión → `/admin` | bloqueado | ✅ enviado al acceso |
| A | Administrador → `/admin` | permitido | ✅ |
| A | Administrador → `/admin/wallets`, `/admin/usuarios`, `/admin/pedidos`, `/admin/configuracion` | permitido | ✅ las cuatro |
| A | Administrador consulta roles | permitido | ✅ lee las 2 filas de rol |
| B | Cliente → `/admin` | bloqueado | ✅ enviado a `/app` |
| B | Cliente intenta darse `admin` | bloqueado | ✅ HTTP 403 |
| B | Cliente intenta cambiar el rol del administrador | bloqueado | ✅ 0 filas modificadas |
| B | Cliente consulta roles | solo el suyo | ✅ 1 fila (la propia) |
| B | Cliente consulta la auditoría | bloqueado | ✅ 0 filas |
| B | Cliente consulta fondos ajenos | bloqueado | ✅ 0 filas |
| 7 | Salir, volver a entrar, recargar | el rol persiste | ✅ sigue entrando en `/admin` |

Total: **14 comprobaciones, 0 fallos.**

Estado final verificado: 1 usuario (el administrador), 1 perfil, 1 wallet con 0,00 CUP, 0 movimientos, 0 códigos temporales pendientes. La cuenta de cliente usada para las pruebas de bloqueo fue **eliminada**, junto con sus trazas.

## 5. Confirmaciones

No se conectó zdSMS real ni se enviaron mensajes. No se modificó el sistema de códigos, G2Bulk, el catálogo, los precios, las wallets, los datos históricos ni ninguna otra funcionalidad. No se creó ningún otro administrador. No se escribió ningún teléfono en el código.

## 6. Pendiente importante

Mientras el envío de mensajes siga **simulado**, ese teléfono no recibirá el código real, por lo que la entrada desde un teléfono propio requiere activar el proveedor de SMS (`ZDSMS_EMAIL` y `ZDSMS_PASSWORD`) en una fase posterior. La cuenta y el rol ya están listos y esperando.

---

## VEREDICTO

🟢 **ADMIN INICIAL CONFIGURADO**

**Fin de la Fase 2.15.1. Esperando autorización.**
