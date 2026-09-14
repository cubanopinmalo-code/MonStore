# FASE 2.6 — PRUEBA CONTROLADA DE ACCESO POR SMS + SESIÓN SUPABASE

Fecha de la prueba: 14/09/2026. Backend usado: el actual de esta aplicación (`yfimkckjhhvxkbkyxexd`). **No se cambió ninguna conexión, no se migró ningún dato, no se introdujo ninguna credencial real de zdSMS ni de G2Bulk.**

---

## 1. ESTADO DE LA PRUEBA

**APROBADA.** Se demostró de extremo a extremo, con evidencia reproducible, que un código enviado por SMS y validado por nuestro servidor puede convertirse en una **sesión normal de Supabase Auth**, sin ningún sistema de acceso paralelo.

| Criterio | Resultado | Evidencia |
|---|---|---|
| El código se genera de forma segura en el servidor | ✓ | 6 dígitos con generador criptográfico; solo se guarda su huella |
| El código puede enviarse por zdSMS | ✓ (en modo simulado) | Cliente real implementado; sin credencial hace un envío simulado |
| El código se valida en el servidor | ✓ | `verificar: {"ok":true,...}` |
| Una sola cuenta por teléfono | ✓ | 1 cuenta en el sistema para ese número tras dos accesos |
| El identificador de usuario se conserva | ✓ | `2a33a1b9-1458-4dda-84ff-e6b9dc64e5eb` en ambos accesos (`created:false` el segundo) |
| Sesión REAL de Supabase | ✓ | `sesion: ok user=2a33a1b9…` |
| `getSession()` | ✓ | `getSession: válida` |
| `getUser()` | ✓ | `2a33a1b9… (55550001@telefono.monstore.cu)` |
| `auth.uid()` + RLS | ✓ | El perfil, la billetera y el rol se leen solo con sesión; vacíos tras salir |
| `profiles` | ✓ | `{"id":"2a33a1b9…","phone":"55550001"}` |
| `wallets` | ✓ | `{"user_id":"2a33a1b9…","balance":0}` |
| `user_roles` | ✓ | `[{"role":"user"}]` |
| Cierre de sesión | ✓ | `getSession: ninguna`, `getUser: ninguno`, datos privados inaccesibles |
| La sesión sobrevive a una recarga | ✓ | Tras `reload`, sesión y datos siguen disponibles |
| Sin segunda sesión paralela | ✓ | La única sesión es la del cliente oficial de Supabase |
| Sin exposición de secretos ni del código | ✓ | El código nunca sale del servidor; el token del proveedor solo en `.server.ts` |
| G2Bulk, catálogo, precios, pedidos intactos | ✓ | No se tocó ningún archivo ni tabla de ese ámbito |
| Sin migración de datos reales ni cambio de backend | ✓ | Solo se creó un usuario de prueba y una tabla temporal de pruebas |

Pruebas negativas superadas: código incorrecto (`attemptsLeft` decreciente), bloqueo al agotar 5 intentos (`bloqueado`), código ya usado (`sin_codigo`), código caducado (`caducado`), reenvío antes de 60 s (`espera, retryInSeconds`), y normalización (`0053 5555 0001` cae en el mismo cubo de límites que `+5355550001`).

---

## 2. ARQUITECTURA FINAL PROPUESTA

```text
Navegador (Customer App)
   │  teléfono / código
   ▼
Función de servidor MonStore  (src/lib/otp-test.functions.ts)
   ├─ normaliza el teléfono          (src/lib/phone.ts)
   ├─ limita solicitudes             (tabla de desafíos)
   ├─ genera y guarda la huella del código
   ├─ pide el SMS a zdSMS            (src/lib/zdsms.server.ts, token solo servidor)
   └─ tras validar: Admin API de Supabase → enlace de un solo uso
   ▼
Navegador: supabase.auth.verifyOtp({ token_hash, type:'email' })
   ▼
Sesión normal de Supabase Auth (access token + refresh token)
   ▼
getSession / getUser / auth.uid / RLS / profiles / wallets / user_roles
```

Ninguna pieza sustituye a Supabase Auth: la identidad, el token y la renovación siguen siendo suyos.

---

## 3. FLUJO COMPLETO

**A — Solicitud.** Teléfono → normalización → validación de formato (móvil cubano `5XXXXXXX`) → límites (60 s entre envíos, 5 por teléfono/hora, 10 por origen/hora) → código de 6 dígitos → se invalidan los desafíos anteriores → se guarda `sha256(telefono:codigo:pimienta)` con caducidad de 5 minutos → SMS → respuesta `{"ok":true}` idéntica exista o no la cuenta.

**B — Verificación.** Teléfono + código → último desafío no consumido → comprobación de caducidad, intentos y coincidencia → fallo: `attempts+1` (al quinto, desafío bloqueado) → acierto: se marca consumido de inmediato → se identifica o crea la cuenta → se emite el enlace de un solo uso → el navegador lo canjea por sesión.

---

## 4. INTEGRACIÓN CON zdSMS

Base `https://zdsms.cu/api/v1`, cabecera `Authorization: Bearer <token>`.
- `POST /message/send` con `{ recipient, mstext }` → devuelve el identificador del mensaje.
- `GET /message/{id}/status` → estado del envío.
- **No existe endpoint de generación ni de verificación de OTP**: toda la validación es nuestra. No se ha inventado ningún endpoint.

El token se lee de `ZDSMS_TOKEN` **dentro** del manejador, en un archivo `.server.ts` que el empaquetador nunca envía al navegador. Sin token configurado, el cliente simula el envío (`mode: "mock"`), que es como se ejecutó esta prueba.

---

## 5. MECANISMO EXACTO PARA IDENTIFICAR/CREAR LA CUENTA

`supabaseAdmin.auth.admin.createUser({ email: '<telefono>@telefono.monstore.cu', email_confirm: true, user_metadata: { phone } })`.
- Si el correo interno ya existe, el error de duplicado se ignora y se continúa con la cuenta existente: **el identificador nunca se regenera** (`created:false` en el segundo acceso).
- Si es nueva, el disparador `handle_new_user` crea automáticamente perfil, rol `user` y billetera (verificado en la prueba).
- El teléfono normalizado (8 dígitos, sin 53) es la clave lógica; el identificador de Supabase sigue siendo la clave técnica de todas las relaciones.

---

## 6. MECANISMO EXACTO DE LA SESIÓN

`supabaseAdmin.auth.admin.generateLink({ type: 'magiclink', email })` devuelve `properties.hashed_token`. Al navegador viaja **solo** ese token (no la URL completa, no tokens de acceso). El navegador ejecuta `supabase.auth.verifyOtp({ token_hash, type: 'email' })`, que llama al endpoint oficial `/auth/v1/verify` y devuelve `access_token` + `refresh_token`. Es un inicio de sesión de Supabase como cualquier otro: token de un solo uso, de vida corta, inútil si se intercepta después de canjearse.

Alternativa descartada: devolver la URL del enlace (expone el token en la barra de direcciones y en el historial).

---

## 7. PERSISTENCIA DE LA SESIÓN

La guarda el propio cliente de Supabase (`persistSession: true`, `autoRefreshToken: true`) en el almacenamiento del navegador que define `src/integrations/supabase/client.ts`. No hay estado propio en React, Zustand ni almacenamiento personalizado. Verificado: tras recargar la página, la sesión y los datos privados siguen disponibles.

---

## 8. getSession / getUser / auth.uid

- `getSession()` lee el token guardado y lo renueva si hace falta → devolvió sesión válida.
- `getUser()` valida el token contra el servidor de Supabase → devolvió el usuario y su correo interno correctos.
- `auth.uid()` se deriva del token enviado en cada consulta → las reglas de acceso lo usaron correctamente.

---

## 9–12. RLS, PERFIL, BILLETERA Y ROLES

Con sesión: perfil (`id`, `phone`), billetera (`user_id`, saldo 0) y rol (`user`) se leyeron con las políticas ya existentes, sin ningún permiso nuevo.
Sin sesión: perfil y billetera devuelven vacío y la lista de roles es vacía — las reglas de acceso siguen mandando.
Ninguna política de seguridad fue modificada en esta fase.

---

## 13. CIERRE DE SESIÓN

`supabase.auth.signOut()` → `getSession: ninguna`, `getUser: ninguno`, datos privados inaccesibles. Las rutas protegidas de la aplicación, que ya dependen de la sesión, volverían a exigir acceso.

---

## 14. RECARGA

Verificado en la prueba: `reload` → `getSession` válida, mismo identificador, mismos datos.

---

## 15. SEGURIDAD

| Amenaza | Defensa demostrada |
|---|---|
| Fuerza bruta del código | 5 intentos por desafío; al agotarlos, el desafío muere |
| Reutilización del código | Se consume en el momento del acierto (`sin_codigo` en el reintento) |
| Código caducado | 5 minutos (`caducado`) |
| Varios códigos simultáneos | Al pedir uno nuevo, los anteriores se invalidan |
| Spam de SMS | 60 s entre envíos, 5 por teléfono/hora, 10 por origen/hora |
| Enumeración de usuarios | La respuesta de solicitud es idéntica exista o no la cuenta |
| Manipulación del teléfono o del identificador | El navegador nunca decide el usuario: se deriva del código validado en el servidor |
| Acceso cruzado entre usuarios | Toda lectura pasa por las reglas de acceso con el identificador del token |
| Robo de sesión | Token de un solo uso y de vida corta; la sesión la emite Supabase |
| Exposición del código | Nunca en respuestas, ni en errores, ni en registros; en base de datos solo la huella con pimienta |
| Exposición del token del proveedor | Solo en `.server.ts`, leído dentro del manejador |

Observación honesta: la huella de un código de 6 dígitos es invertible por fuerza bruta si alguien consigue leer la tabla y conoce la pimienta (lo comprobé en la prueba para recuperar el código). Por eso la tabla no tiene ningún permiso para el navegador y la pimienta debe ser un secreto del servidor (`OTP_TEST_PEPPER`) en producción.

---

## 16. LÍMITES DE USO

Por teléfono: 1 envío cada 60 s, 5 por hora. Por origen: 10 por hora. Por desafío: 5 intentos. Pendiente de tu decisión: **tope diario de SMS del proyecto** (decisión de coste) y bloqueo temporal prolongado ante abuso repetido.

---

## 17. ERRORES DE zdSMS

El cliente distingue: respuesta de error del proveedor (`zdsms_http_<código>`) y proveedor inalcanzable (`zdsms_unreachable`). En ambos casos el desafío queda registrado pero la respuesta al usuario es `sms_no_enviado`, sin detalles internos. Los identificadores de mensaje se guardan para poder consultar el estado.

---

## 18. SI zdSMS ESTÁ FUERA DE SERVICIO

Nadie puede entrar: es el único método de acceso. Mitigaciones recomendadas antes de producción: reintento automático breve, aviso claro en pantalla ("no pudimos enviar el mensaje, inténtalo en unos minutos"), vigilancia del crédito y de la tasa de fallos, y un procedimiento operativo para avisar a los clientes. Importante: el sitio de zdSMS **no responde desde este entorno** (parece restringido a redes cubanas); hay que verificar que sí responde desde el servidor de producción antes de depender de él.

---

## 19. QUÉ HABRÍA QUE MODIFICAR EN LA CUSTOMER APP

| Componente | Acción |
|---|---|
| `src/routes/index.tsx` (pantalla de acceso) | REEMPLAZAR: dos pasos, teléfono → código; fuera contraseña y pestañas |
| `src/lib/auth.ts` | REEMPLAZAR `signInWithPhone`/`signUpWithPhone`; CONSERVAR `signOut`; la normalización pasa a `src/lib/phone.ts` |
| `src/routes/login.tsx`, `src/routes/registro.tsx` | Retirar o redirigir a la pantalla única |
| Funciones de servidor definitivas | Promover las de prueba a `src/lib/auth-otp.functions.ts` |
| Tabla de desafíos | Crearla como migración definitiva en el backend canónico |
| Secretos | `ZDSMS_TOKEN` y `OTP_TEST_PEPPER` (renombrado a `OTP_PEPPER`) del lado servidor |

## 20. QUÉ NO DEBE MODIFICARSE

`src/integrations/supabase/*` (generados), el guardia `_authenticated`, las reglas de acceso, `profiles`/`wallets`/`user_roles` y su disparador, el catálogo, los precios, los pedidos, la billetera, G2Bulk y el almacenamiento.

---

## 21. MIGRACIONES POSTERIORES NECESARIAS

1. Tabla de desafíos de código (equivalente a la de prueba) con acceso solo de servidor.
2. Limpieza periódica de desafíos caducados (o borrado al consumir).
3. Alinear el disparador de alta del backend canónico con `<telefono>@telefono.monstore.cu` sin prefijo 53.
4. Opcional: índice único sobre el correo interno normalizado para blindar la unicidad por teléfono.

**Estructura temporal creada en esta prueba (eliminable):** `public.otp_test_challenges`, sin permisos para el navegador. Se elimina con un borrado de tabla y no afecta a ninguna tabla comercial. Usuario de prueba creado: `55550001@telefono.monstore.cu` (identificador `2a33a1b9-1458-4dda-84ff-e6b9dc64e5eb`), sin saldo ni pedidos.

---

## 22. RIESGOS

1. **Dependencia total de un proveedor de SMS cubano**, sin alternativa y sin recuperación por pérdida de línea (decisión asumida).
2. **Alcance de red**: no se ha comprobado que el servidor llegue a zdSMS.
3. **Coste**: cada intento de acceso cuesta un SMS; sin tope diario, un abuso se traduce en dinero.
4. **Pimienta comprometida** + lectura de la tabla = códigos recuperables; mitigado con secreto de servidor y tabla sin permisos.
5. **Acceso administrativo**: el mecanismo usa la clave de servicio; cualquier fuga permitiría emitir sesiones. Debe permanecer solo en el servidor.
6. **Números repetidos entre usuarios** (líneas reasignadas por el operador) darían acceso a la cuenta anterior: caso conocido, fuera de alcance.

---

## 23. PLAN DE VUELTA ATRÁS

Esta fase es reversible por completo: borrar `public.otp_test_challenges`, borrar el usuario de prueba, y eliminar `src/lib/otp-test.functions.ts`, `src/lib/zdsms.server.ts`, `src/lib/phone.ts` y la ruta `/prueba-otp`. El acceso actual por contraseña no se tocó y sigue siendo el único camino real de la aplicación.

---

## 24. PASOS EXACTOS DE LA FUTURA FASE 2.7

1. Confirmar el tope diario de SMS y el crédito contratado.
2. Guardar `ZDSMS_TOKEN` y `OTP_PEPPER` como secretos del servidor.
3. Comprobar desde el servidor de producción que zdSMS responde (`/me`) y enviar un SMS real a un número propio.
4. Repetir esta misma batería con envío real, incluido el tiempo de entrega del SMS.
5. Promover las funciones de prueba a definitivas y crear la migración de la tabla de desafíos en el backend canónico.
6. Sustituir la pantalla de acceso por el flujo de dos pasos, manteniendo temporalmente el acceso por contraseña como red de seguridad.
7. Retirar el acceso por contraseña solo después del cambio de backend y de validar el acceso por código en producción.

---

**NO SE MIGRARON USUARIOS REALES. NO SE CAMBIÓ LA CONEXIÓN DE SUPABASE. NO SE MODIFICÓ AUTH DE FORMA DESTRUCTIVA. NO SE INTRODUJERON CREDENCIALES DE ZDSMS NI DE G2BULK. NO SE TOCÓ EL CATÁLOGO, LOS PRECIOS, LA BILLETERA NI LOS PEDIDOS. NO SE AVANZA A LA FASE 2.7.**
