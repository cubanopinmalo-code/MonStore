# FASE 2.5 — ACCESO SIN CONTRASEÑA POR CÓDIGO SMS

Documento de análisis y diseño. **No se ejecutó ningún cambio.**

---

## 1. Arquitectura propuesta

```text
Cliente (navegador)
   │  teléfono, luego código
   ▼
Función de servidor de MonStore   ← aquí vive TODA la lógica y el secreto
   │
   ├──► zdSMS (envío del SMS)
   │
   └──► Sistema de cuentas de MonStore (crear sesión)
```

Tres funciones de servidor, ninguna llamada al proveedor desde el navegador:

1. **Pedir código.** Recibe el teléfono, normaliza, aplica los límites, genera un código de 6 cifras, guarda solo su huella, pide el envío a zdSMS.
2. **Verificar código.** Recibe teléfono + código, comprueba huella, vigencia e intentos, marca el código como usado y devuelve una sesión.
3. **Reenviar.** La misma que pedir, con su propio tiempo mínimo de espera.

El secreto del proveedor se guarda como secreto del entorno del servidor. No aparece en el navegador, ni en variables públicas, ni en el repositorio, ni en ninguna tabla accesible al cliente, ni en ninguna respuesta.

---

## 2. Flujo de acceso (cuenta existente)

```text
Teléfono → normalizar → ¿límites ok? → generar código → guardar huella
   → zdSMS envía el SMS → el cliente escribe el código
   → verificar huella, vigencia, intentos → invalidar el código
   → crear sesión → cargar perfil, saldo y rol → entrar
```

**Respuesta siempre idéntica exista o no la cuenta.** Esto cierra la enumeración de usuarios: nadie puede averiguar qué números están registrados. La diferencia (entrar o crear cuenta) se resuelve **después** de verificar el código, nunca antes.

---

## 3. Flujo de registro (teléfono nuevo)

Idéntico hasta la verificación. Al verificar, si el teléfono no existe:

```text
crear cuenta → crear perfil (con código de referido)
  → crear billetera en cero → asignar rol de cliente → entrar
```

El disparador de alta que ya existe en el backend definitivo hace estos tres pasos automáticamente. **No hay que duplicar la lógica**, solo pasarle el nombre y el teléfono al crear la cuenta. El único ajuste pendiente es alinear ese disparador con el formato de identidad aprobado.

Si en el registro falta el nombre, se pide **después** de entrar, no antes del código: pedir datos antes de verificar el teléfono es una vía de spam.

---

## 4. Primer acceso de usuarios migrados

Para el usuario es exactamente igual: escribe su teléfono, recibe el código, entra. No nota la migración y **nunca se le pide una contraseña, ni la antigua ni una nueva**.

La reconciliación es por teléfono:

```text
teléfono normalizado → cuenta antigua (por identidad derivada del teléfono)
                     → cuenta definitiva (mismo identificador)
                     → tabla de correspondencia de usuarios antiguos
```

La tabla de correspondencia ya existe en el backend definitivo y no admite duplicados: cada teléfono antiguo apunta a una única cuenta nueva y viceversa. Si al verificar un código el teléfono coincide con una entrada de esa tabla, se entra a la cuenta migrada; nunca se crea una segunda.

---

## 5. Integración con zdSMS

Sentido único y desde el servidor:

```text
App → función de servidor → zdSMS → SMS al teléfono
```

Nunca app → zdSMS. Autenticación con credencial de portador en la cabecera, guardada como secreto del entorno.

---

## 6. Endpoints confirmados por la documentación

El sitio del proveedor no responde desde este entorno (la conexión expira), así que los endpoints se confirmaron contra sus bibliotecas oficiales publicadas [2](https://github.com/NoxCreation/pyzdsms) [1](https://packagist.org/packages/zonadigital/zdsms). Base: `https://zdsms.cu/api/v1`.

| Función | Método y ruta | Cuerpo |
|---|---|---|
| Datos de la cuenta y crédito | `GET /me` | — |
| **Enviar un SMS** | `POST /message/send` | `recipient`, `mstext` |
| Listado de mensajes | `GET /message/` | — |
| Listado paginado | `GET /message/paginated?page=N` | — |
| **Estado de un envío** | `GET /message/{id}/status` | — |
| Enviar campaña | `POST /campaign/send` | — |
| Listado de campañas | `GET /campaign/` | — |

**Declaración explícita, como pediste: la documentación disponible NO ofrece ningún endpoint de generación ni de verificación de códigos.** zdSMS es un servicio de envío de mensajes, no un verificador. No inventé ningún endpoint. En consecuencia, **toda la validación del código se implementa en el servidor de MonStore** (§7).

Uso previsto de cada pieza: `POST /message/send` para enviar; su identificador de respuesta se guarda para poder consultar `GET /message/{id}/status` ante una reclamación de "no me llegó"; `GET /me` para vigilar el crédito y avisar al administrador antes de que se agote — quedarse sin crédito dejaría a todos fuera de la aplicación.

Errores a manejar: crédito agotado, número inválido o fuera de Cuba, credencial rechazada, límite del proveedor, y el servicio caído. Ninguno debe devolver al navegador el texto crudo del proveedor: se traduce a un mensaje claro y el detalle queda solo en el registro del servidor.

---

## 7. Método de validación del código

Diseñado íntegramente en el servidor:

- Código de **6 cifras**, generado con un generador criptográfico, nunca secuencial ni predecible.
- **No se guarda el código.** Se guarda una **huella con sal**, igual que una contraseña. Ni yo, ni el administrador, ni quien lea la base de datos puede recuperar el código.
- Se guardan además: teléfono normalizado, momento de creación, vencimiento, intentos fallidos, marca de usado, huella del dispositivo y dirección de origen.
- La verificación compara huellas en **tiempo constante**, para que medir el tiempo de respuesta no filtre información.
- Al acertar: el código se marca usado **en la misma operación** que crea la sesión. Un código no puede usarse dos veces ni aunque lleguen dos peticiones a la vez.
- Al pedir un código nuevo, **todos los anteriores de ese teléfono quedan invalidados**. Nunca hay dos códigos vivos.
- La tabla de códigos **no es accesible desde el navegador**: sin permisos de lectura para el cliente, solo la función del servidor la toca.

---

## 8. Estrategia de sesión

**Sin sistema de sesiones paralelo.** El sistema de cuentas del backend sigue siendo el único dueño de la identidad y de la sesión. El código verificado se convierte en sesión así:

1. La función de servidor verifica el código.
2. Busca o crea la cuenta con permisos administrativos del servidor.
3. Genera un **enlace de acceso de un solo uso** para esa cuenta mediante la interfaz administrativa de cuentas y extrae de él el testigo.
4. El navegador canjea ese testigo por una sesión normal.

Resultado: sesión estándar, con renovación automática y cierre de sesión normales. Todas las reglas de acceso por fila siguen funcionando sin tocar nada.

El paso 3 exige la **clave de servicio del backend**, que existe en el entorno del servidor. Alternativa equivalente si se prefiere: el propio sistema de cuentas admite acceso por teléfono con código, pero exige contratar un proveedor de SMS de su catálogo, y zdSMS no está en él — por eso la vía correcta aquí es la descrita.

**No hace falta una función externa adicional.** Todo cabe en funciones de servidor de la propia aplicación, que es la arquitectura que ya usa.

---

## 9. Estrategia de migración de identidad

```text
Backend antiguo → copia de identidad y datos → cuenta definitiva
   → primer acceso con código → teléfono verificado → sesión definitiva
```

La clave lógica de reconciliación es **el teléfono normalizado**, no el correo ni la contraseña. No se necesita conocer ninguna contraseña antigua, y **no se migrará ninguna**.

Formato de identidad interna, ya aprobado y bloqueado: `<telefono>@telefono.monstore.cu`. No se antepone el 53 automáticamente y se descarta el otro formato.

**Normalización única y obligatoria**, aplicada en los dos extremos y en el servidor antes de cualquier búsqueda: quitar espacios, guiones, paréntesis y el símbolo de suma; conservar solo cifras. Un teléfono se guarda de una sola forma. Sin esto aparecen cuentas duplicadas del mismo usuario, que es el fallo más caro de revertir.

---

## 10. Conservación del identificador de usuario

**Sí es técnicamente posible conservarlo**, y es lo que hay que hacer: la interfaz administrativa de cuentas permite crear una cuenta indicando su identificador. Se copia el mismo del backend antiguo.

Conservarlo mantiene enlazados sin tocar nada: perfil, roles, billetera, movimientos, asientos financieros, solicitudes de fondos y de retiro, pedidos, favoritos, referidos, notificaciones, publicaciones, ventas e inscripciones a eventos.

**Si en algún caso no fuera posible** (identificador ya ocupado en el destino), las consecuencias serían: todas las referencias anteriores quedarían apuntando a un identificador inexistente y habría que reescribirlas una a una en orden de dependencias, con riesgo de perder historial financiero. En ese caso, y solo en ese caso, se usa la tabla de correspondencia antiguo → nuevo que ya existe en el destino, se reescriben las referencias dentro de una única operación, y se validan conteos y sumas antes de dar por buena la migración. **Preferencia clara: conservar el identificador y no entrar en ese camino.**

---

## 11. Conservación de billeteras

Se copian tal cual: saldo disponible, saldo retenido, estado y el identificador antiguo como referencia. **Sin recalcular, sin redondear, sin recrear movimientos.** El historial se copia con sus saldos anteriores y posteriores intactos.

Validación obligatoria después de copiar y antes de dar por buena la migración: la suma de todos los saldos del destino debe coincidir **exactamente** con la del origen, y el número de movimientos también. Si no cuadra, se revierte.

---

## 12. Prevención de duplicados

Cuatro barreras, en capas:

1. Normalización única del teléfono (§9).
2. Teléfono **único** en el perfil, garantizado por la base de datos, no por código.
3. La tabla de correspondencia de usuarios antiguos no admite repetir ni el usuario antiguo ni el nuevo.
4. Búsqueda por teléfono normalizado **antes** de crear cualquier cuenta, dentro de la misma operación que la crea.

---

## 13. Seguridad

| Amenaza | Defensa |
|---|---|
| Fuerza bruta del código | 6 cifras, máximo 5 intentos, y al quinto el código muere |
| Códigos simultáneos | Pedir uno nuevo invalida los anteriores |
| Reutilización | Marcado de usado en la misma operación que crea la sesión |
| Código caducado | Vencimiento comprobado en el servidor, nunca en el navegador |
| Enumeración de usuarios | Respuesta idéntica exista o no la cuenta |
| Código legible en la base | Solo se guarda una huella con sal |
| Fuga del secreto del proveedor | Solo en el entorno del servidor; el navegador nunca lo ve |
| Abuso automatizado | Límites por teléfono y por origen, más bloqueo temporal |
| Gasto malicioso de SMS | Tope diario por teléfono y tope global diario con aviso al administrador |
| Comparación por tiempo | Comparación en tiempo constante |

Auditoría: cada solicitud y cada intento se registra con teléfono, origen, resultado y momento, en una tabla **inmutable** y visible solo para el administrador.

---

## 14. Límites de uso

| Límite | Valor propuesto |
|---|---|
| Espera mínima entre reenvíos | 60 segundos |
| Máximo por teléfono y hora | 3 |
| Máximo por teléfono y día | 10 |
| Máximo por origen y hora | 10 |
| Intentos fallidos antes de invalidar el código | 5 |
| Bloqueo temporal tras superar los límites | 30 minutos |
| Tope global diario de mensajes | configurable, con aviso al administrador al 80 % |

Todos configurables desde los ajustes, no escritos en el código. Se comprueban **en el servidor antes de llamar al proveedor**: un límite comprobado en el navegador no es un límite.

---

## 15. Vigencia del código

**5 minutos.** Suficiente para un SMS con retraso, corto frente a un ataque. El reloj es el del servidor; el navegador solo muestra la cuenta atrás. Al vencer, el código se rechaza aunque sea correcto, y el registro conserva el intento.

---

## 16. Pérdida del teléfono

Es el punto débil de todo acceso por SMS y hay que resolverlo antes de tener volumen de usuarios: **quien pierde el número pierde la cuenta, y con ella su saldo.**

Diseño propuesto:

1. El cliente escribe al soporte por WhatsApp desde otro número.
2. Acredita la propiedad: últimos pedidos, importes, fecha aproximada de alta y saldo aproximado.
3. El administrador, desde el panel, inicia un **cambio de número**: introduce el nuevo, el sistema envía un código a ese número y hasta que no se verifica no se cambia nada.
4. El cambio queda en la auditoría, con quién lo autorizó y cuándo; el número anterior queda bloqueado para nuevas altas durante 30 días.
5. Mientras dure el proceso, los retiros de esa cuenta quedan retenidos.

Sin el punto 5, un cambio de número indebido es un robo de saldo directo. Recomiendo además ofrecer un **teléfono de respaldo** opcional en el perfil.

---

## 17. Componentes de contraseña a reemplazar

Auditado el acceso actual de la aplicación:

| Componente | Clasificación |
|---|---|
| `signInWithPhone` (acceso con contraseña) | **REEMPLAZAR** por pedir y verificar código |
| `signUpWithPhone` (alta con contraseña) | **REEMPLAZAR** por el mismo flujo de código |
| Campo "Contraseña" del acceso | **REEMPLAZAR** por campo de código de 6 cifras |
| Campo "Contraseña" del alta y su mínimo de 6 caracteres | **RETIRAR** |
| Pestañas "Iniciar sesión" / "Crear cuenta" | **RETIRAR** — con código no hay diferencia visible; una sola pantalla |
| Mensaje "Ese número ya tiene una cuenta" | **RETIRAR** — filtra qué números existen |
| `phoneToEmail` y `normalizePhone` | **ADAPTAR** — la normalización se endurece y pasa también al servidor |
| Detección de sesión guardada en la pantalla de inicio | **MANTENER** — funciona igual |
| Puerta de rutas protegidas | **MANTENER** |
| `/login` y `/registro` (redirigen al inicio) | **MANTENER** |

**Recuperación de contraseña: no existe hoy** en la aplicación. No hay que retirar nada; el acceso por código la vuelve innecesaria, y su sustituto es §16.

**Dependencias del correo:** ninguna real. El correo interno es un identificador derivado del teléfono, nunca se envía nada a él y no se muestra en ninguna pantalla. **Del formato `@monstore.local` no hay ni rastro en esta aplicación**; solo aparece en el backend de referencia y queda descartado.

**Aviso:** las contraseñas de sala de evento y las credenciales de cuentas en venta también se llaman "contraseña" en el código, pero **no tienen relación con el acceso** y no se tocan.

---

## 18. Componentes que pueden mantenerse temporalmente

Durante la transición conviene que el acceso con contraseña **siga funcionando en paralelo**, no se elimina nada hasta que el acceso por código esté probado con usuarios reales. El sistema de cuentas admite ambos a la vez sin conflicto. Se retira la contraseña cuando: el código funcione en producción, el crédito de SMS esté asegurado y el cambio de número por soporte esté operativo.

---

## 19. Riesgos

| Riesgo | Nivel | Mitigación |
|---|---|---|
| **Quedarse sin crédito de SMS deja a todos fuera** | **CRÍTICO** | Vigilar el crédito, avisar al administrador con antelación y mantener la contraseña como vía alterna durante la transición |
| Pérdida del teléfono = pérdida del saldo | **ALTO** | §16, obligatorio antes de producción |
| Ataque de gasto de SMS | **ALTO** | Límites del §14 y topes diarios |
| Teléfonos normalizados de forma distinta → cuentas duplicadas | **ALTO** | Una sola función de normalización, teléfono único en la base |
| SMS lento o no entregado en Cuba | **MEDIO** | 5 minutos de vigencia, reenvío a los 60 s, consulta del estado del envío |
| El sitio del proveedor no responde desde fuera de Cuba | **MEDIO** | Verificado hoy; los envíos saldrán del servidor y hay que comprobar que ese servidor sí alcanza el proveedor **antes** de depender de él |
| Códigos en claro en registros de diagnóstico | **ALTO** | Prohibido registrar el código; solo la huella |
| El testigo de sesión se filtra en la respuesta | **ALTO** | De un solo uso, vida muy corta, canjeado de inmediato |

---

## 20. Dependencias

1. Cuenta activa en zdSMS con crédito y su credencial (**no la pidas todavía**).
2. Que el servidor de la aplicación pueda alcanzar al proveedor — **hay que verificarlo**, hoy no responde desde este entorno.
3. Acceso de escritura al backend definitivo, que sigue siendo el bloqueo de la fase anterior.
4. Clave de servicio del backend en el entorno del servidor, para crear la sesión.
5. Ajuste del disparador de alta al formato de identidad aprobado.
6. Ajuste del WhatsApp de soporte, necesario para el §16.

---

## 21. Pasos antes de producción

1. Desbloquear el acceso al backend definitivo.
2. Crear la tabla de códigos y la de auditoría de intentos, cerradas al cliente.
3. Añadir los ajustes de límites y vigencia.
4. Guardar la credencial del proveedor como secreto del servidor.
5. Escribir las tres funciones de servidor.
6. Rehacer la pantalla de acceso: teléfono → código, una sola pantalla.
7. Probar: código correcto, incorrecto, caducado, reusado, reenvío antes de tiempo, superar límites, teléfono nuevo, teléfono migrado, dos peticiones simultáneas.
8. Comprobar que el servidor alcanza al proveedor y que llega un SMS real.
9. Poner en marcha el cambio de número por soporte (§16).
10. Vigilancia del crédito con aviso al administrador.
11. Convivencia con la contraseña durante un tiempo, y retirada solo después.

---

## Confirmaciones

**NO SE MIGRARON USUARIOS.**
**NO SE CAMBIÓ LA CONEXIÓN.**
**NO SE MODIFICÓ AUTH DE FORMA DESTRUCTIVA.**
**NO SE INTRODUJERON CREDENCIALES DE ZDSMS.**

Además: no se llamó a la API real del proveedor, no se creó ni modificó ninguna tabla, no se eliminó ninguna función, no se tocó el código de la aplicación y no se migraron billeteras ni catálogo. Lo único escrito en todo el turno son este documento y la lista de tareas.
