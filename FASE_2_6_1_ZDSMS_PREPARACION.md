# FASE 2.6.1 — PREPARACIÓN DE PRODUCCIÓN PARA zdSMS

Fecha: 14/09/2026. Backend usado: el actual de esta aplicación. **No se envió ningún SMS, no se introdujo ninguna credencial, no se cambió la conexión ni se tocó nada fuera del alcance.**

---

## 1. ESTADO DE CONECTIVIDAD CON zdSMS

Comprobación realizada desde este entorno hacia `https://zdsms.cu/api`:

| Prueba | Resultado |
|---|---|
| DNS | **Resuelve correctamente**: `zdsms.cu → 200.55.147.245` (rango cubano, ETECSA) |
| Conexión TCP 443 | **Falla**: la conexión no llega a abrirse |
| TLS | **No se llega a negociar** (la conexión muere antes) |
| HTTP | **Sin código de estado**: `curl (28) Connection timed out after 25002 ms` |
| Tipo de bloqueo | Tiempo de espera agotado en el establecimiento de la conexión, sin rechazo explícito — comportamiento típico de un servicio accesible solo desde redes cubanas o con filtrado de origen |

**Interpretación honesta:** el nombre de dominio existe y apunta a un servidor real; lo que no hay es ruta desde este entorno hasta él. Esto **no significa** que la integración no vaya a funcionar: significa que hay que comprobarla desde el servidor donde se publique la aplicación, o bien pedir a zdSMS que autorice la salida internacional de nuestro servidor. Se dejó preparada una comprobación (`probeZdsms`) que repite esta verificación sin enviar nada.

---

## 2. VARIABLES SECRETAS PREPARADAS

El cliente del proveedor lee **únicamente** del entorno del servidor, y siempre dentro del manejador:

| Variable | Uso | Estado |
|---|---|---|
| `ZDSMS_EMAIL` | Usuario de la cuenta del proveedor | Preparada, **sin valor** |
| `ZDSMS_PASSWORD` | Contraseña de la cuenta del proveedor | Preparada, **sin valor** |
| `OTP_PEPPER` | Ingrediente secreto de las huellas de códigos y teléfonos | Preparada, con valor provisional de prueba |

Sin `ZDSMS_EMAIL` y `ZDSMS_PASSWORD` el cliente **no hace ninguna llamada externa**: simula el envío, exactamente como en la Fase 2.6.

---

## 3. LÍMITES CONFIGURADOS

Los límites dejaron de estar escritos en el código: viven en una tabla del servidor (`otp_limits`, una sola fila) **sin ningún permiso para el navegador**, y se leen en cada solicitud.

| Parámetro | Valor inicial |
|---|---|
| Longitud del código | 6 dígitos |
| Vigencia | 5 minutos |
| Intentos por código | 5 |
| Espera entre envíos al mismo número | 60 segundos |
| Solicitudes por número cada 24 horas | 5 |
| Solicitudes por origen cada hora | 10 |
| Tope diario de SMS del proyecto | **sin fijar** (pendiente de tu decisión de coste) |

Un código solo puede usarse una vez: al acertar se consume en el acto, y pedir uno nuevo invalida los anteriores. Cambiar cualquiera de estos valores es actualizar una fila, sin tocar código. **No se creó ninguna pantalla de administración para esto** (no existía una estructura adecuada y quedaba fuera de lo aprobado).

---

## 4. LÍMITES POR ORIGEN (ABUSO MASIVO)

Cada solicitud registra el origen de la petición y se cuenta por hora (10 como máximo). El origen nunca se guarda en claro en el registro de consumo: se guarda su huella. Todos los límites se aplican **en el servidor**; el navegador no puede leerlos ni alterarlos, ni saltándose la pantalla.

---

## 5. MANEJO DE ERRORES

El servidor traduce cualquier fallo del proveedor a un motivo corto y neutro; el detalle técnico (código HTTP, respuesta del proveedor) **nunca sale al navegador** y nunca incluye credenciales ni el código.

| Situación | Lo que ve la persona |
|---|---|
| Credenciales rechazadas por el proveedor | "No pudimos enviar el código en este momento. Inténtalo nuevamente más tarde." |
| Saldo insuficiente | El mismo mensaje neutro |
| Proveedor caído o inalcanzable | El mismo mensaje neutro |
| Tiempo de espera agotado | El mismo mensaje neutro |
| Número rechazado por el proveedor | "No pudimos enviar el mensaje a ese número." |
| Número mal escrito | "Ese número no parece un móvil cubano válido." |
| Demasiadas solicitudes del mismo número | "Has pedido demasiados códigos hoy. Inténtalo mañana." |
| Demasiadas solicitudes del mismo origen | "Demasiadas solicitudes desde esta conexión. Inténtalo más tarde." |
| Tope diario alcanzado | "El servicio de mensajes alcanzó su límite de hoy. Inténtalo mañana." |
| Código caducado | "El código ha caducado. Pide uno nuevo." |
| Código incorrecto | "El código no es correcto." |
| Código ya usado / inexistente | "No hay ningún código pendiente. Pide uno nuevo." |
| Intentos agotados | "Demasiados intentos. Pide un código nuevo." |

---

## 6. REGISTRO DE CONSUMO

Cada solicitud deja una línea en un registro **solo de servidor** (`otp_sms_log`, sin ningún permiso para el navegador) con: fecha y hora, huella del teléfono, teléfono enmascarado (`***0001`), huella del origen, resultado (enviado / simulado / fallido / bloqueado), modo (real o simulado), identificador del mensaje del proveedor y motivo del error.

**El código nunca se registra, ni en claro ni de ninguna otra forma.** Con este registro se podrá saber cuántos mensajes se enviaron, cuántos fallaron, el consumo por día y qué números u orígenes están abusando. El propio tope diario se calcula leyendo este registro.

---

## 7. QUÉ FALTA PARA UN ENVÍO REAL

1. Que decidas el **tope diario de SMS** (decisión de coste).
2. Guardar `ZDSMS_EMAIL` y `ZDSMS_PASSWORD` como secretos del servidor — **no te los pido todavía**.
3. Comprobar desde el servidor de publicación que `https://zdsms.cu/api` responde; si no, gestionar el acceso con el proveedor.
4. Guardar `OTP_PEPPER` definitivo.
5. Un primer envío a un número tuyo, midiendo el tiempo de entrega.

---

## 8. CONFIRMACIÓN DE QUE LAS CREDENCIALES NO ESTÁN EXPUESTAS

No hay ninguna credencial en el código, ni valores de ejemplo. Se leen solo dentro del archivo del proveedor, que termina en `.server.ts` y que el empaquetador nunca envía al navegador. No aparecen en respuestas, ni en errores, ni en registros, ni en ninguna tabla accesible por el navegador. El identificador de sesión del proveedor se guarda solo en memoria del servidor.

---

## 9. CONFIRMACIÓN DE ALCANCE

No se tocó el catálogo, los juegos, los productos, los precios, la billetera, los pedidos, G2Bulk, el almacenamiento, el comercio de cuentas, los eventos, los referidos, la migración, los usuarios reales ni ningún identificador existente. No se cambió la conexión del backend. El mecanismo aprobado en la Fase 2.6 (teléfono → código → validación en servidor → enlace de un solo uso → sesión oficial) **no se modificó**.

**NO SE REALIZÓ NINGÚN ENVÍO REAL. NO SE INTRODUJERON CREDENCIALES. NO SE AVANZA A LA FASE 2.7.**
