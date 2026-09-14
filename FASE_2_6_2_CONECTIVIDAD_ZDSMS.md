# FASE 2.6.2 — VERIFICACIÓN DE CONECTIVIDAD CON zdSMS

Fecha: 14/09/2026. **No se envió ningún SMS. No se usó ninguna credencial (`ZDSMS_EMAIL` y `ZDSMS_PASSWORD` siguen vacías). No se modificó el acceso, el backend, el catálogo, la billetera, los pedidos ni G2Bulk.**

---

## 1. RESULTADO RESUMIDO

| Capa | Resultado |
|---|---|
| DNS | **CORRECTO** — `zdsms.cu → 200.55.147.245` (rango de ETECSA, Cuba) |
| Conexión TCP al puerto 443 | **FALLA** — la conexión nunca llega a abrirse |
| TLS | **No se negocia** (muere antes en la capa anterior) |
| HTTP | **Ningún código de estado** |
| Tipo de fallo | Tiempo de espera agotado al conectar; no hay rechazo explícito ni error de certificado |

Se probaron tres direcciones, todas con el mismo resultado:

| Endpoint | Método | Resultado | Tiempo |
|---|---|---|---|
| `https://zdsms.cu/api` | GET | conexión fallida | ~10,5 s hasta abandonar |
| `https://zdsms.cu/api/v1/token` | GET | conexión fallida | ~10,5 s |
| `https://zdsms.cu/` | GET | conexión fallida | ~10,5 s |

Herramienta de red directa (`curl`), mismo entorno: `curl (28) Connection timed out after 25002 ms`.

---

## 2. DESDE QUÉ SERVIDOR SE PROBÓ — LIMITACIÓN IMPORTANTE

La prueba se ejecutó desde **el servidor de la aplicación en el entorno de desarrollo** (Node.js 22), llamando a una sonda temporal creada para esto (`/api/public/zdsms-probe`), que no envía mensajes ni usa credenciales.

**No fue posible probar desde el servidor de producción definitivo**, por un motivo concreto: **esta aplicación todavía no está publicada**. El intento de ejecutar la sonda contra la dirección pública devolvió *"No working published build found yet"*, y la dirección de vista previa exige inicio de sesión de la plataforma, por lo que tampoco sirve para una prueba de red.

Esto importa porque el servidor de producción es una infraestructura distinta (red distinta, salida a Internet distinta) de la de desarrollo. **El resultado de arriba no permite concluir que producción tampoco llegue.**

---

## 3. INTERPRETACIÓN

El dominio existe y apunta a un servidor real en Cuba; lo que falta es **ruta de red** desde este entorno hasta él. Es el comportamiento típico de un servicio accesible solo desde redes cubanas o con filtrado por origen. No es un problema de certificado, ni de dominio mal escrito, ni de la integración que preparamos.

---

## 4. CÓMO OBTENER LA RESPUESTA DEFINITIVA

La sonda ya está lista y queda en la aplicación para este fin. El procedimiento es:

1. Publicar la aplicación (basta una publicación normal; no cambia nada del acceso ni de los datos).
2. Abrir `https://<tu-dirección-publicada>/api/public/zdsms-probe`.
3. La respuesta dirá, por cada dirección probada, si conectó, con qué código y en cuánto tiempo.
4. Si tampoco conecta desde producción, hay dos caminos: pedir a zdSMS que autorice el acceso desde fuera de Cuba, o enviar los mensajes a través de un servidor situado en Cuba.

Cuando ya no haga falta, la sonda se elimina en un momento (es un único archivo y no expone nada).

---

## 5. CONFIRMACIONES

- No se envió ningún SMS.
- `ZDSMS_EMAIL` y `ZDSMS_PASSWORD` permanecen sin configurar (la sonda lo confirma: `credentialsConfigured: false`).
- No se implementó el acceso por código real ni se modificó el acceso actual.
- No se modificó Supabase, el catálogo, la billetera, los pedidos, G2Bulk ni ninguna otra funcionalidad.
- No se avanza a la Fase 2.7.
