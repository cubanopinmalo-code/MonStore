# FASE 2.16.2 — DISEÑO DEL RELAY SEGURO LOVABLE CLOUD → zdSMS

Fecha: 14/09/2026 (UTC). **Solo diseño y auditoría. No se implementó ningún relay, no se creó infraestructura externa, no se añadieron proveedores, no se tocó OTP, Auth, wallets, roles, el administrador, G2Bulk ni los datos. No se reactivó el modo simulado.**

---

## 1. Diagnóstico de partida (Fase 2.16.1)

- `zdsms.cu` resuelve a `200.55.147.245`; ningún saludo TCP se completa (443 ni 80), descarte silencioso, ~20 s de espera.
- Un host internacional responde en 0,06 s; otro host cubano ajeno al proveedor falla igual → bloqueo de ruta hacia la red cubana.
- No es DNS, ni TLS, ni IPv6, ni credenciales, ni el código OTP de MonStore.
- Conclusión: hace falta un punto de salida **con conectividad probada hacia Cuba**. Eso es lo que aquí se diseña.

---

## 2. Arquitectura propuesta

```text
Usuario -> MonStore (Lovable Cloud)
            genera OTP, guarda solo hash, aplica limites
                 |
                 |  HTTPS POST /sms/send  (HMAC + timestamp + nonce)
                 v
            Relay (infraestructura con salida hacia Cuba)
                 |  guarda ZDSMS_EMAIL / ZDSMS_PASSWORD, obtiene token
                 v
            zdSMS  -> SMS -> Usuario
                 ^
                 |  respuesta minima: ok, provider_message_id, error_code
            MonStore guarda el desafio SOLO si ok = true
```

El relay es **un transporte de un solo verbo**. No conoce usuarios, ni sesiones, ni dinero.

---

## 3. Responsabilidades

| Componente | Responsable de |
|---|---|
| Lovable Cloud | generar OTP, hash con `MONSTORE_OTP_PEPPER`, expiración, intentos, rate limiting, validación, sesión oficial, roles, administración, auditoría |
| Relay | recibir solicitud autenticada, verificar firma/tiempo/nonce, llamar a zdSMS, devolver resultado mínimo, log técnico |
| zdSMS | entregar el SMS |

El relay **no** genera, valida ni guarda OTP; no guarda usuarios, wallets ni sesiones. El texto del mensaje se envía en la petición y no se persiste (solo longitud y hash corto para diagnóstico).

---

## 4. Payload mínimo (MonStore → relay)

```json
{
  "to": "+5351110000",
  "text": "Tu codigo de acceso a MonStore es: NNNNNN. Caduca en 5 minutos.",
  "correlation_id": "uuid-v4",
  "ts": 1789200000,
  "nonce": "16-bytes-hex"
}
```

Cabeceras: `X-Monstore-Signature: v1=<hex>`, `X-Monstore-Key-Id: k1`, `Content-Type: application/json`.

Nunca se envía: identificador de usuario, rol, wallet, saldo, datos financieros, contraseña, ni el OTP separado del texto. `correlation_id` es opaco y no permite deducir la identidad.

---

## 5. Autenticación (opción elegida)

**HMAC-SHA256 sobre el cuerpo exacto + timestamp + nonce**, con clave compartida `MONSTORE_RELAY_HMAC_KEY` (32 bytes aleatorios, presente en Lovable Cloud y en el relay).

- Cadena firmada: `v1:{ts}:{nonce}:{sha256(cuerpo)}`.
- Comparación en tiempo constante.
- Ventana de tiempo ±120 s; fuera de ventana → 401.
- Anti-replay: `nonce` almacenado en el relay durante 10 minutos (memoria o KV); repetido → 409.
- Sin firma o firma inválida → 401 sin detalle.
- `key_id` permite rotar la clave sin cortar el servicio (dos claves válidas durante la rotación).

Descartado: solo secreto en cabecera (vulnerable a replay y a fugas en logs intermedios); mTLS (más seguro pero mucho más costoso de operar aquí). Nunca se autentica desde el frontend ni se aceptan peticiones anónimas.

---

## 6. Seguridad del relay

- Un único endpoint `POST /sms/send`; todo lo demás 404. Sin panel, sin listados, sin endpoints de diagnóstico públicos.
- HTTPS obligatorio, TLS 1.2+, HSTS.
- Cuerpo máximo 2 KB; texto máximo 480 caracteres; destino validado como E.164 y **restringido al prefijo cubano** `+53` (evita convertirlo en pasarela de spam global).
- Timeout hacia zdSMS 15 s; timeout total de la petición 20 s.
- Sin CORS (no lo llama ningún navegador).
- Bloqueo temporal de origen tras autenticaciones inválidas repetidas.
- Respuestas de error neutras y sin cuerpo del proveedor.

---

## 7. Credenciales

- `ZDSMS_EMAIL` y `ZDSMS_PASSWORD` viven **solo** en el entorno del relay. Recomendación: eliminarlas de Lovable Cloud una vez el relay esté operativo, porque desde allí son inútiles (sin ruta de red) y su presencia solo amplía la superficie.
- Token Bearer de zdSMS: únicamente en memoria del relay, con caducidad y una renovación al recibir 401. Nunca en la respuesta, nunca en logs.
- En Lovable Cloud solo queda `MONSTORE_RELAY_URL` y `MONSTORE_RELAY_HMAC_KEY`.
- `MONSTORE_OTP_PEPPER` no sale nunca de Lovable Cloud y el relay no lo necesita.

---

## 8. Rate limiting

Control principal en Lovable Cloud, sin cambios: 60 s entre envíos · 5 por teléfono/24 h · 10 por IP/hora · 5 intentos · 5 min · un solo uso.

Defensa en profundidad en el relay (tope, no política de producto): 1 SMS por destino cada 45 s, 10 por destino/día, 120 por hora en total, más un límite global diario configurable. Exceso → 429 con `error_code: rate_limit_relay`, sin reintento automático.

---

## 9. Idempotencia y reintentos

- `correlation_id` es la clave de idempotencia. El relay guarda el resultado por `correlation_id` durante 24 h; una repetición **devuelve el resultado anterior sin volver a enviar SMS**.
- MonStore reintenta como máximo **una** vez, solo con el mismo `correlation_id` y solo ante fallo sin respuesta (timeout o 5xx del relay). Nunca reintenta un 4xx.
- Backoff: un único reintento a los 2 s. Sin bucles, sin reintentos ciegos.
- Timeout ambiguo (envío posiblemente entregado): se trata como fallo para MonStore (no se guarda desafío) y el relay conserva el registro; el usuario puede volver a pedir el código pasado el cooldown. Preferimos "no llega el código" antes que dos códigos válidos.
- Regla invariable: el desafío se guarda **solo** si el relay confirma `ok: true`.

---

## 10. Respuesta del relay

Éxito:
```json
{ "ok": true, "provider_message_id": "12345", "correlation_id": "uuid", "ts": 1789200002 }
```
Fallo:
```json
{ "ok": false, "error_code": "sin_saldo", "correlation_id": "uuid", "ts": 1789200002 }
```

`error_code` reutiliza el vocabulario ya existente: `auth_fallida`, `sin_saldo`, `numero_rechazado`, `rate_limit_proveedor`, `timeout`, `proveedor_no_disponible`, `envio_fallido`, `rate_limit_relay`. Nunca devuelve credenciales, token, cabeceras ni cuerpo del proveedor. El usuario final siempre ve un mensaje neutro.

---

## 11. Registros

Lovable Cloud (`otp_sms_log`, `audit_log`) — sin cambios: fecha, huella del teléfono, teléfono enmascarado `***NNNN`, huella del origen, resultado, modo, `provider_message_id`, código de error, latencia, `correlation_id`.

Relay: fecha, `correlation_id`, destino enmascarado `+53***NNNN`, longitud del texto, resultado, código HTTP de zdSMS, `provider_message_id`, latencia, motivo de rechazo de autenticación. Retención 30 días.

Nunca, en ningún lado: el OTP, el texto completo del mensaje, la contraseña del proveedor, el token Bearer ni la clave HMAC.

---

## 12. Alternativas de infraestructura

**A. Relay mínimo dedicado (VPS pequeño con salida hacia Cuba)**
- Ventajas: control total de la ruta de red y de la IP de salida (facilita que el proveedor la autorice); un solo endpoint; sin límites de runtime.
- Desventajas: hay que mantener sistema, TLS, monitorización; punto único de fallo si no se duplica.
- Seguridad: buena si se limita a un puerto, un endpoint y actualizaciones al día.
- Coste: orden de 4–10 USD/mes.
- Mantenimiento: bajo pero no nulo (parches, certificado, reinicios).
- Disponibilidad: ~99,5 % con una instancia; mejor con dos y DNS de reserva.
- Implementación: sencilla (un servicio de ~150 líneas).
- Dependencia: del hosting y de que su salida hacia Cuba realmente funcione (a verificar antes de contratar nada).

**B. Relay serverless/edge**
- Ventajas: sin servidores que mantener, escalado y TLS incluidos, coste casi nulo a este volumen.
- Desventajas: **la salida de red suele salir por la misma clase de infraestructura que ya falla**; IP de salida variable, difícil de autorizar en el lado cubano; anti-replay necesita almacén externo (KV).
- Seguridad: equivalente si hay KV para nonces.
- Coste: prácticamente 0–2 USD/mes.
- Mantenimiento: mínimo.
- Disponibilidad: alta.
- Implementación: muy sencilla.
- Dependencia: alta del proveedor; **solo viable si se comprueba de antemano que ese entorno alcanza `zdsms.cu`**.

Recomendación: **A**, previa comprobación de conectividad desde el proveedor candidato. B queda como plan alternativo únicamente si la comprobación resulta positiva.

Opción C (sin relay, mejor si es posible): que zdSMS autorice el acceso desde fuera de Cuba y confirme una dirección alcanzable. Coste 0, cero infraestructura nueva. Merece intentarse antes que A.

---

## 13. Plan de implementación (cuando se autorice)

1. Verificar conectividad hacia `zdsms.cu` desde el candidato (DNS, TCP 443, TLS, HTTP) **antes** de contratar o programar nada.
2. Generar `MONSTORE_RELAY_HMAC_KEY` y guardarla como secreto en ambos lados.
3. Desplegar el relay con un único endpoint, validaciones, anti-replay, idempotencia y límites.
4. Configurar `ZDSMS_EMAIL` / `ZDSMS_PASSWORD` solo en el relay y validar el `POST /v1/token` desde allí.
5. En MonStore: sustituir la llamada directa dentro de `src/lib/zdsms.server.ts` por la llamada firmada al relay. **Sin tocar** OTP, hash, límites, sesión, roles ni base de datos.
6. Ejecutar la batería de pruebas del punto 14 contra un número de prueba propio.
7. Retirar `ZDSMS_EMAIL` / `ZDSMS_PASSWORD` de Lovable Cloud.
8. Verificar el acceso real del administrador y actualizar el informe de la Fase 2.16.

---

## 14. Pruebas mínimas

| Prueba | Resultado esperado |
|---|---|
| Petición válida | `ok: true`, SMS entregado, desafío guardado |
| Sin autenticación | 401, sin envío, sin desafío |
| Firma inválida | 401, sin envío, origen penalizado |
| Timestamp expirado (>120 s) | 401, sin envío |
| Replay (mismo nonce) | 409, sin segundo SMS |
| Mismo `correlation_id` | resultado anterior, sin segundo SMS |
| Timeout de zdSMS | `timeout`, sin desafío, mensaje neutro |
| Error de zdSMS (sin saldo / número rechazado) | código interno correcto, mensaje neutro |
| Respuesta no JSON del proveedor | `envio_fallido`, sin desafío |
| Reintento tras 5xx del relay | un solo SMS en total |
| Rate limit del relay | 429, sin envío |
| Relay caído | mensaje neutro, sin sesión, fallo registrado |
| Destino fuera de `+53` | 400, sin envío |
| Cuerpo > 2 KB | 413, sin envío |

---

## 15. Riesgos

- El punto de salida elegido podría no alcanzar tampoco la red cubana → mitigación: comprobar antes de invertir.
- Fuga de la clave HMAC → convertiría el relay en pasarela de SMS ajena; mitigación: restricción a `+53`, límites propios, rotación por `key_id`.
- Relay como punto único de fallo → sin SMS no hay acceso a la aplicación; mitigación: dos instancias o al menos vigilancia y aviso.
- Coste de SMS por abuso → topes en ambos lados.
- Latencia añadida (un salto más) → aceptable, presupuesto 20 s.
- Dependencia legal/operativa del hosting con ruta a Cuba.

---

## 16. Rollback

Reversión limpia y en un solo paso: MonStore vuelve a la llamada directa a `zdsms.cu` (código actual, intacto) y se apaga el relay. No hay cambios de base de datos, ni de OTP, ni de Auth, ni de roles, ni de wallets que deshacer. **No hay fallback automático a modo simulado**: si relay y proveedor están fuera de servicio, no se crea sesión, el usuario ve un aviso neutro y el fallo se registra. La autenticación real nunca se degrada en silencio.

---

## VEREDICTO

🟡 **DISEÑO CON PENDIENTES**

El diseño es sólido y no requiere cambios en OTP, Auth ni datos, pero queda un pendiente bloqueante que no depende del diseño: **comprobar que el punto de salida candidato alcanza realmente `zdsms.cu`**, y decidir antes si zdSMS puede autorizar el acceso directo desde fuera de Cuba (opción C, sin infraestructura nueva).

Se detiene aquí y se espera autorización.
