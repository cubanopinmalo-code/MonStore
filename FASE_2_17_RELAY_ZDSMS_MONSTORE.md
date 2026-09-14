# FASE 2.17 — PREPARACIÓN DEL RELAY SEGURO LOVABLE CLOUD → zdSMS

Fecha: 14/09/2026 (UTC). **No se desplegó ni contrató ningún servidor, no se creó infraestructura externa, no se cambió la URL de producción, no se reactivó el modo simulado y no se tocó OTP, Auth, wallets, roles, el administrador, catálogo, precios, G2Bulk, eventos, comercio ni GitHub.** El único cambio de código es un cliente server-side nuevo, **inactivo** mientras no existan `RELAY_URL` y `RELAY_SHARED_SECRET`.

---

## 1. Arquitectura

```text
Usuario -> MonStore (Lovable Cloud)
             genera OTP, guarda solo hash, limites, validacion, sesion, roles
                  |
                  |  HTTPS POST /sms/send  (HMAC + timestamp + nonce + request_id)
                  v
             RELAY (VPS con salida hacia Cuba)  [ZDSMS_EMAIL / ZDSMS_PASSWORD]
                  |  POST /v1/token  ->  POST /v1/message/send
                  v
             zdSMS -> SMS -> Usuario
                  ^
                  |  { success, request_id, provider_message_id, error_code, timestamp }
             MonStore guarda el desafio SOLO si success = true
```

El relay no tiene acceso a la base de datos, ni valida OTP, ni crea sesiones, ni conoce usuarios, wallets o roles.

---

## 2. Endpoint del relay

- `POST /sms/send` — único endpoint funcional.
- `GET /health` — estado técnico.
- Cualquier otra ruta o método: `404` / `405` sin cuerpo informativo.

## 3. Payload (MonStore → relay)

```json
{
  "recipient": "+5351110000",
  "message": "Tu codigo de acceso a MonStore es: NNNNNN. Caduca en 5 minutos.",
  "request_id": "uuid-v4",
  "timestamp": "2026-09-14T21:40:00.000Z",
  "nonce": "32-hex"
}
```

Cabeceras: `X-Monstore-Signature: v1=<hex>`, `X-Monstore-Timestamp`, `X-Monstore-Nonce`, `X-Monstore-Request-Id`.

No se envía: usuario, rol, wallet, saldo, datos financieros, ni ninguna credencial de zdSMS.

## 4. HMAC

`signature = HMAC_SHA256(RELAY_SHARED_SECRET, timestamp + "." + nonce + "." + body)`, hexadecimal, sobre el cuerpo **exacto** transmitido. Implementado con Web Crypto en `src/lib/sms-relay.server.ts`. El relay compara en tiempo constante. Secreto de 32 bytes aleatorios, nunca en código ni en frontend.

## 5. Anti-replay

Orden de validación en el relay: tamaño → JSON → timestamp (ventana ±120 s) → firma → nonce no usado. Nonce guardado 10 minutos (memoria o SQLite/KV local); repetido → `409`. Sin firma o firma inválida → `401` sin detalle y penalización del origen.

## 6. Idempotencia

`request_id` es la clave. El relay guarda `request_id → { success, provider_message_id, error_code }` durante 24 h en almacenamiento local ligero (SQLite o mapa con TTL); una repetición **devuelve el resultado previo y no envía un segundo SMS**. Eso es todo el estado que el relay conserva: no lo convierte en backend de MonStore.

## 7. Credenciales

- `ZDSMS_EMAIL` y `ZDSMS_PASSWORD`: **solo en el entorno del relay**. Nunca en el payload, ni en el frontend, ni en GitHub, ni en logs. Cuando el relay entre en producción, se retirarán de Lovable Cloud (allí son inútiles por falta de ruta de red).
- Bearer token de zdSMS: solo en memoria del relay, con caducidad y una renovación al recibir 401. No sale nunca en la respuesta.
- `MONSTORE_OTP_PEPPER`: permanece exclusivamente en Lovable Cloud; el relay no lo necesita.

## 8. Timeouts

| Tramo | Valor |
|---|---|
| MonStore → relay (total) | 20 s |
| Relay → zdSMS: conexión | 5 s |
| Relay → zdSMS: respuesta | 15 s |
| Petición completa en el relay | 20 s |

## 9. Retries

Un único reintento, a los 2 s, **con el mismo `request_id`**, y solo cuando no hubo respuesta útil del relay (timeout o 5xx). Nunca se reintenta un 4xx, ni un error de proveedor, ni un `409`. El relay no reintenta contra zdSMS salvo la renovación única de token tras un 401. Si el resultado es ambiguo se trata como fallo: no se guarda desafío y el usuario puede pedir otro código pasado el cooldown. Preferimos "no llega el código" antes que dos códigos válidos.

## 10. Logs

Relay: `request_id`, fecha, destino enmascarado (`+53***NNNN`), longitud del mensaje, resultado, código HTTP del proveedor, `provider_message_id`, latencia, motivo de rechazo de autenticación. Retención 30 días.

MonStore (`otp_sms_log`, `audit_log`) sin cambios: huella del teléfono, teléfono enmascarado, huella del origen, resultado, modo, `provider_message_id`, código de error interno.

Nunca en ningún lado: OTP, contraseña de zdSMS, Bearer token, secreto compartido, datos financieros, stack traces.

## 11. Rate limiting del relay

Segunda capa, no política de producto (el control principal sigue en Lovable Cloud: 60 s / 5 por teléfono-24 h / 10 por IP-hora / 5 intentos / 5 min / uso único):

- 1 SMS por destino cada 45 s; 10 por destino/día.
- 120 peticiones/hora en total y tope global diario configurable.
- Cuerpo máximo 2 KB; mensaje máximo 480 caracteres; destino E.164 restringido a `+53`.
- Bloqueo temporal del origen tras firmas inválidas repetidas.
- Exceso → `429` con `error_code: RATE_LIMITED`, sin reintento.

## 12. Health check

`GET /health` devuelve solo:

```json
{ "status": "ok", "version": "1.0.0", "uptime_seconds": 12345 }
```

Comprobación interna de conectividad: cada 5 minutos el relay hace un `OPTIONS`/`HEAD` a `https://zdsms.cu/api` y guarda un booleano con la fecha del último éxito. Ese resultado **no** se expone en `/health` público; se consulta con firma HMAC en `GET /health/deep`, y devuelve solo `{ "provider_reachable": true, "checked_at": "..." }`. Sin credenciales, sin cuerpos del proveedor, sin datos de clientes.

## 13. Seguridad del servidor (recomendaciones)

- HTTPS obligatorio (certificado gestionado y renovación automática), TLS 1.2+, HSTS.
- Cortafuegos con solo 443 abierto al público y 22 restringido por IP.
- SSH solo por clave; sin acceso por contraseña; sin login directo de root.
- Actualizaciones de seguridad automáticas; servicio con usuario sin privilegios.
- Logs rotados con retención definida; sin secretos en ellos.
- Copia de la configuración y de las variables de entorno fuera del servidor, cifrada.
- Monitorización de `/health` con aviso al fallar, más aviso si `provider_reachable` es falso más de 15 minutos.
- Rotación del secreto compartido cada 90 días, admitiendo dos claves válidas durante el cambio.

## 14. Requisitos del VPS (criterios, sin elegir proveedor)

- **Conectividad estable y comprobada hacia `zdsms.cu`** — criterio eliminatorio, a verificar antes de contratar.
- IPv4 pública fija (facilita que el proveedor la autorice).
- Soporte de HTTPS con dominio propio.
- Latencia razonable hacia Cuba; disponibilidad mensual ≥ 99,5 %.
- Capacidad mínima suficiente: 1 vCPU, 512 MB–1 GB RAM, 10 GB disco.
- Acceso administrativo completo (SSH) y reinicio desde panel.
- Coste orientativo 4–10 USD/mes.

## 15. Variables de entorno

**Relay:** `RELAY_SHARED_SECRET`, `ZDSMS_EMAIL`, `ZDSMS_PASSWORD`, opcional `ZDSMS_API_URL` (por defecto `https://zdsms.cu/api`), opcional `RELAY_VERSION`.

**MonStore (Lovable Cloud):** `RELAY_URL`, `RELAY_SHARED_SECRET`. Nada más. Ninguna credencial se hardcodea.

## 16. Matriz de pruebas

| # | Prueba | Resultado esperado |
|---|---|---|
| A | Firma válida | `200`, `success: true`, SMS enviado |
| B | Firma inválida | `401`, sin envío, origen penalizado |
| C | Timestamp expirado (>120 s) | `401`, sin envío |
| D | Nonce repetido | `409`, sin segundo SMS |
| E | `request_id` repetido | resultado previo, sin segundo SMS |
| F | Payload inválido / >2 KB | `400` / `413`, sin envío |
| G | Sin autenticación | `401`, sin envío |
| H | SMS correcto | `provider_message_id` presente, desafío guardado |
| I | Timeout del proveedor | `TIMEOUT`, sin desafío, mensaje neutro |
| J | Error de zdSMS (saldo, número) | código interno correcto, mensaje neutro |
| K | Token de zdSMS inválido | una renovación, luego `AUTH_FAILED` sin exponer nada |
| L | Respuesta no JSON del proveedor | `envio_fallido`, sin desafío |
| M | Reintento seguro | un solo SMS en total |
| N | Relay caído | mensaje neutro, sin sesión, fallo registrado |

## 17. Procedimiento de despliegue (cuando se autorice)

1. Verificar conectividad hacia `zdsms.cu` desde el candidato antes de contratar.
2. Contratar el VPS, endurecerlo según el punto 13 y publicar el dominio con HTTPS.
3. Configurar en el relay `RELAY_SHARED_SECRET`, `ZDSMS_EMAIL`, `ZDSMS_PASSWORD`.
4. Desplegar el relay (un endpoint, firma, anti-replay, idempotencia, límites, `/health`).
5. Probar A–N contra un número propio.
6. Guardar `RELAY_URL` y `RELAY_SHARED_SECRET` como secretos de Lovable Cloud → el cliente ya preparado se activa solo, sin cambios de código.
7. Verificar el acceso real del administrador y retirar `ZDSMS_EMAIL` / `ZDSMS_PASSWORD` de Lovable Cloud.

## 18. Rollback

Basta con **borrar `RELAY_URL`** en Lovable Cloud: el cliente vuelve automáticamente al envío directo actual, sin desplegar nada ni tocar código. No hay cambios de base de datos, OTP, Auth, roles ni wallets que deshacer. **Sin fallback al modo simulado**: si relay y proveedor están fuera de servicio, no se crea sesión, el usuario ve un aviso neutro y el fallo queda registrado.

---

## Estado del código en esta fase

- Nuevo: `src/lib/sms-relay.server.ts` con la única función `sendOtpSms()` (firma HMAC, nonce, timestamp, `request_id`, un reintento idempotente, respuesta mínima).
- **Inactivo**: sin `RELAY_URL` y `RELAY_SHARED_SECRET` delega en el envío directo existente, por lo que el comportamiento de producción es idéntico al de la Fase 2.16.
- No se modificó `src/lib/otp.functions.ts`, `zdsms.server.ts`, Auth, roles, wallets ni ninguna otra área.
- Revisión de tipos del proyecto: correcta.

---

## VEREDICTO

🟡 **RELAY PREPARADO CON PENDIENTES**

El diseño y el cliente de MonStore están listos y son reversibles con un solo cambio de configuración. Pendientes bloqueantes, todos fuera del código: comprobar la conectividad real del candidato hacia `zdsms.cu`, desplegar el relay y ejecutar la matriz A–N. Se detiene aquí y se espera autorización.
