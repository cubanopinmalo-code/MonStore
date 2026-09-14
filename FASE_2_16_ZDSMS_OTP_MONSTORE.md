# FASE 2.16 — INTEGRACIÓN REAL DE zdSMS PARA OTP DE MONSTORE

Fecha: 14/09/2026 (UTC)
Alcance: sustituir el envío simulado de OTP por envío real vía zdSMS.
Modo de trabajo: solo capa de envío. No se tocó autenticación, sesión, roles, wallets, catálogo, precios, G2Bulk, eventos, comercio, GitHub, Supabase externo ni datos históricos.

---

## 1. Arquitectura implementada

```
Usuario -> teléfono
  -> Lovable Cloud: normaliza, aplica límites, genera OTP (6 dígitos, CSPRNG)
  -> guarda SOLO hash SHA-256 (teléfono + código + MONSTORE_OTP_PEPPER)
  -> Lovable Cloud (servidor) -> zdSMS: POST /v1/token, POST /v1/message/send
  -> zdSMS entrega el SMS
  -> Usuario introduce el código
  -> Lovable Cloud valida contra el hash, marca uso único
  -> sesión oficial de Supabase Auth (magiclink -> verifyOtp)
  -> /app (cliente) o /admin (rol admin en user_roles)
```

zdSMS actúa **solo como transporte de SMS**. No genera ni valida OTP y no participa en la sesión.

## 2. Endpoints usados

- `POST https://zdsms.cu/api/v1/token`
- `POST https://zdsms.cu/api/v1/message/send` con `{ "recipient", "mstext" }`
- `GET https://zdsms.cu/api/v1/message/{id}/status` (solo consulta puntual)

No se inventó ningún endpoint de OTP.

## 3. Secrets requeridos

- `ZDSMS_EMAIL` — configurado (solo servidor)
- `ZDSMS_PASSWORD` — configurado (solo servidor)
- `MONSTORE_OTP_PEPPER` — configurado, sin cambios ni regeneración
- `MONSTORE_SMS_MODE` — opcional. Valor `simulado` fuerza modo sin llamada externa. Actualmente **no configurado** (modo real activo).

Ninguna credencial aparece en el frontend, en el código, en el repositorio ni en logs. Todo el acceso ocurre en `src/lib/zdsms.server.ts` (archivo bloqueado para el navegador).

## 4. Flujo completo y 5–7. OTP, hash y validación

Sin cambios respecto a la Fase 2.15 validada:

- OTP de 6 dígitos con `crypto.getRandomValues`.
- Se guarda únicamente el hash con pimienta de servidor; nunca en claro, nunca en respuestas, nunca en logs.
- Expiración 5 minutos, contador de intentos, uso único con consumo condicionado (protección de repetición).
- Cambio nuevo: el desafío se guarda **solo si el proveedor aceptó el mensaje**. Un envío fallido no deja ningún código válido ni consume cuota del teléfono.
- Cambio nuevo: tras insertar, se cierran los demás desafíos abiertos del mismo teléfono, de modo que dos peticiones simultáneas nunca dejan dos códigos válidos.

Texto del SMS: `Tu codigo de acceso a MonStore es: NNNNNN. Caduca en 5 minutos.` Sin rol, saldo ni datos de cuenta.

## 8. Rate limiting (servidor)

60 s entre envíos · 5 solicitudes por teléfono / 24 h · 10 por IP / hora · 5 intentos por OTP · 5 min de vigencia · un solo uso. Valores en `public.otp_limits`, aplicados en el servidor.

## 9. Seguridad

- Token Bearer solo en memoria del servidor, con caducidad y renovación única al recibir 401; nunca viaja al navegador ni a logs.
- Timeout de 15 s por llamada.
- Respuesta no JSON o inesperada se trata como fallo de envío.
- Se eliminó la sonda pública temporal `/api/public/zdsms-probe` (revelaba si había credenciales configuradas).
- Sin JWT propio, sin segunda sesión, sin cambios en `has_role()` / `is_admin()` / protección de rutas.

## 10. Manejo de errores

Internamente se distinguen: `auth_fallida`, `sin_saldo`, `numero_rechazado`, `rate_limit_proveedor`, `timeout`, `proveedor_no_disponible`, `envio_fallido`. Al usuario solo se le muestra un mensaje neutro. Sin envío correcto no hay código válido ni sesión.

## 11. Control de consumo

`otp_sms_log`: fecha, huella del teléfono, teléfono enmascarado (`***NNNN`), huella del origen, resultado, modo, ID del mensaje del proveedor y código de error interno. `audit_log`: eventos de acceso con teléfono enmascarado. Nunca se registra el OTP, la contraseña del proveedor ni el token.

## 12. Resultado de envío y pruebas

**Bloqueo detectado:** desde el entorno de servidor de Lovable no existe ruta de red hacia `zdsms.cu`.

- DNS correcto: `zdsms.cu -> 200.55.147.245`.
- `POST /api/v1/token` con las credenciales reales: **timeout** a los 25 s (`http 000`), igual que `https://zdsms.cu/`.
- El fallo es de conectividad de salida, no de credenciales: no llega ninguna respuesta HTTP.

Consecuencia inmediata: con las credenciales configuradas el sistema opera en modo real, por lo que toda solicitud de código termina en “no pudimos enviar el código” y **nadie puede iniciar sesión**, incluido el administrador.

| Prueba | Estado |
| --- | --- |
| A envío correcto | 🔴 no verificable (proveedor inalcanzable) |
| B recepción del SMS | 🔴 no verificable |
| C–G OTP correcto / incorrecto / expirado / reutilizado / 5 intentos | 🟢 validadas en Fase 2.15 (lógica sin cambios) |
| H–J reenvío, límite diario, límite por IP | 🟢 validadas en Fase 2.15 (lógica sin cambios) |
| K error de zdSMS | 🟢 error neutro, sin código válido, sin sesión |
| L timeout | 🟢 reproducido: 15 s y fallo controlado |
| M credenciales inválidas | 🟡 no verificable (no hay respuesta del proveedor) |
| N–R logout, recarga, admin, cliente, visitante | 🟢 sin cambios respecto a Fase 2.15/2.15.1 |

Revisión de tipos del proyecto: correcta.

## 13. Estado del administrador

Sin cambios: mismo UUID, mismo rol en `user_roles`, mismo profile, misma wallet, mismo teléfono. No se ejecutó ninguna parte de la Fase 2.15.1. Podrá recibir el SMS real en cuanto exista salida de red hacia el proveedor.

## 14. Pendientes

1. Habilitar la salida de red del servidor de producción hacia `zdsms.cu` (o un reenvío autorizado dentro de Cuba). Requiere decisión fuera del alcance de esta fase; no se improvisó ninguna solución.
2. Repetir A, B y M una vez exista conectividad, preferiblemente desde la aplicación publicada.
3. Mientras no haya conectividad, configurar `MONSTORE_SMS_MODE=simulado` para no bloquear el acceso; requiere autorización expresa.
4. Advertencias heredadas del linter de la base de datos (Fase 2.14/2.15) siguen abiertas.

---

# 🔴 ZDSMS OTP NO LISTO

La integración real está implementada y protegida, pero el proveedor no es alcanzable desde el servidor, por lo que no puede enviarse ningún SMS real y el acceso queda bloqueado hasta resolver la conectividad.
