# FASE 2.16.1 — DIAGNÓSTICO DEFINITIVO DE CONECTIVIDAD → zdSMS

Fecha: 14/09/2026. **Solo diagnóstico. No se envió ningún SMS, no se usaron credenciales, no se modificó Auth, OTP, roles, el administrador, wallets, base de datos, secretos, G2Bulk ni la arquitectura. No se creó relay ni modo simulado.**

---

## 1. RESULTADOS DE RED (entorno server-side de MonStore)

| Capa | Resultado |
|---|---|
| DNS (A) | **SÍ** — `zdsms.cu → 200.55.147.245` (rango ETECSA, Cuba), resuelto en ~0,01–0,03 s |
| DNS (AAAA) | No hay registro IPv6 propio; solo `::ffff:200.55.147.245` (IPv4 mapeada) |
| TCP 443 | **NO** — nunca se abre la conexión |
| TCP 80 | **NO** — nunca se abre la conexión |
| TLS | **NO** — no se negocia; muere antes (sin error de certificado) |
| HTTP | **NO** — ningún código de estado (`000`) |
| Timeout | ~20 s hasta abandonar (curl exit 28, "Connection timed out") |

Pruebas realizadas, sin credenciales:

| Prueba | Resultado |
|---|---|
| `GET https://zdsms.cu/` | `code:000  conn:0  tls:0  total:20,00 s` |
| `GET https://zdsms.cu/api` | `code:000  conn:0  tls:0  total:20,00 s` |
| `GET https://zdsms.cu/api` forzado IPv4 | `code:000  total:20,00 s` (exit 28) |
| `GET https://zdsms.cu/api` forzado IPv6 | sin salida IPv6 disponible (exit 6) |
| TCP directo a `200.55.147.245:443` | falla por tiempo agotado |
| TCP directo a `200.55.147.245:80` | falla por tiempo agotado |
| Handshake TLS directo (`s_client`) | sin salida: agotado antes del saludo TLS |

Pruebas de control, mismo entorno y momento:

| Control | Resultado |
|---|---|
| `https://example.com` | **HTTP 200 en 0,06 s** → la salida a Internet funciona con normalidad |
| `https://www.etecsa.cu/` (otro host cubano) | `code:000`, tiempo agotado a los 20 s |

---

## 2. DNS FRENTE A CONECTIVIDAD

- DNS resuelve correctamente: **SÍ**
- TCP llega al destino: **NO**
- TLS se establece: **NO**
- HTTP responde: **NO**

El fallo es puramente de ruta de red: se conoce la dirección, pero ningún paquete completa el saludo TCP, ni en 443 ni en 80.

---

## 3. SIN CREDENCIALES

Toda la comprobación se hizo **sin autenticarse** contra zdSMS. Conclusión: el fallo ocurre **antes de cualquier autenticación**; no tiene relación con el usuario, la contraseña, el token ni la integración de MonStore.

---

## 4. IPv4 / IPv6

- IPv4: falla (tiempo agotado).
- IPv6: el proveedor no publica dirección IPv6 propia y el entorno no ofrece salida IPv6, por lo que no existe una segunda vía que probar.
- No es un problema exclusivo de una familia IP: **la única vía posible (IPv4) está cortada**.

---

## 5. RESPONSABLE

Escenario aplicable: **4 — la salida hacia esa red no está disponible desde la infraestructura actual**, con un matiz importante que apunta también al escenario 3.

Evidencia:

- El entorno tiene Internet plena (`example.com` responde en 0,06 s).
- Falla el proveedor **y** otro host cubano no relacionado (`etecsa.cu`), con el mismo patrón exacto.
- Falla en dos puertos distintos, sin rechazo explícito (no hay "connection refused"), lo que indica descarte silencioso de paquetes, típico de cortafuegos intermedio o de filtrado por origen geográfico.

Nivel de certeza:

- **Alta (95 %)**: no es DNS, ni TLS/certificado, ni IPv6, ni temporal puntual, ni un error de la integración. Es bloqueo de ruta de red hacia direcciones cubanas.
- **Media**: distinguir si el corte lo aplica la red de salida de la plataforma o el filtrado de entrada del lado cubano no es observable desde aquí, porque el descarte es silencioso en ambos casos. El hecho de que caiga **todo** el destino cubano probado sugiere un filtro amplio, no una regla específica de zdSMS.

Causa probable: **F/G — bloqueo de la ruta de salida hacia el rango de red cubano**, con posible refuerzo de E (filtrado de entrada por origen extranjero en el lado del proveedor).

---

## 6. QUÉ SOLUCIÓN TÉCNICA SERÍA NECESARIA

Cualquiera de estas tres, todas fuera del código de MonStore (que ya está listo):

1. Que zdSMS autorice el acceso desde fuera de Cuba y confirme una dirección alcanzable públicamente.
2. Un punto de salida intermedio con conectividad hacia Cuba (relay/proxy autorizado), al que MonStore pediría el envío. **No se ha creado y requiere tu autorización.**
3. Un proveedor de SMS alternativo con cobertura de móviles cubanos y accesible desde Internet global.

Nada de esto exige tocar OTP, Auth, roles, el administrador, wallets ni la base de datos: solo cambia el transporte del mensaje.

---

## 7. ESTADO ACTUAL SIN CAMBIOS

- Integración real de zdSMS: implementada, intacta.
- Modo simulado: **no** reactivado.
- Administrador: sin cambios (mismo UUID, rol, perfil y saldo).
- Consecuencia operativa mientras el bloqueo persista: no llegan códigos por SMS, por lo que el acceso real por teléfono no está disponible.

---

## VEREDICTO

🟡 **CONECTIVIDAD BLOQUEADA PERO DIAGNOSTICADA**

Se detiene aquí y se espera autorización.
