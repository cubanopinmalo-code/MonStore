# FASE 2.5 — VALIDACIÓN Y CIERRE DE ARQUITECTURA DE ACCESO POR CÓDIGO SMS

Documento de validación, análisis y diseño. **No se ejecutó ningún cambio.**
Fecha: 14 de septiembre de 2026.

Complemento operativo: `FASE_2_5_CUTOVER_AUTH.md` (cutover, rollback y pruebas).

---

## 1. ESTADO GENERAL

**LISTO CON BLOQUEADORES.**

El diseño técnico está cerrado y es suficiente para ejecutar la siguiente fase de forma controlada. Quedan cuatro bloqueadores, todos externos al diseño (§18): acceso de escritura al backend definitivo, credencial y crédito de zdSMS, alcance de red desde el servidor hacia el proveedor, y la clave de servicio del backend necesaria para convertir un código verificado en sesión.

---

## 2. AUTENTICACIÓN POR CÓDIGO

### Arquitectura

```text
Cliente (navegador)
   │ teléfono, después código
   ▼
Función de servidor de MonStore   ← aquí vive toda la lógica y el secreto
   ├──► zdSMS (envío del SMS)
   └──► Sistema de cuentas de MonStore (creación de la sesión)
```

Tres funciones de servidor. Ninguna llamada al proveedor desde el navegador. El secreto del proveedor vive solo en el entorno del servidor: nunca en el navegador, ni en variables públicas, ni en el repositorio, ni en tablas accesibles al cliente, ni en ninguna respuesta.

### Flujo completo

```text
teléfono → normalizar → comprobar límites → generar código → guardar solo la huella
  → zdSMS envía el SMS → el usuario escribe el código
  → comprobar huella, vigencia e intentos → invalidar el código
  → localizar o crear la cuenta → crear sesión → perfil, saldo y rol → entrar
```

La respuesta a la solicitud de código es **idéntica exista o no la cuenta**. La bifurcación (entrar / crear) ocurre **después** de verificar el código, nunca antes.

### Generación

Seis cifras, generador criptográfico, nunca secuencial ni predecible.

### Almacenamiento

**No se guarda el código.** Se guarda una huella con sal, como una contraseña. Además: teléfono normalizado, creación, vencimiento, intentos fallidos, marca de usado, huella de dispositivo y dirección de origen. La tabla no es accesible desde el navegador: cero permisos de lectura para el cliente.

### Validación

Comparación de huellas en tiempo constante. Al acertar, el código se marca usado **en la misma operación** que crea la sesión, de modo que dos peticiones simultáneas no pueden usarlo dos veces. Al pedir un código nuevo se invalidan todos los anteriores de ese teléfono: nunca hay dos vivos.

### Sesión

Ver §3. No se crea ningún sistema de sesión propio.

---

## 3. SESIÓN — MECANISMO EXACTO

**Recomendado:** enlace de acceso de un solo uso generado por la interfaz administrativa de cuentas, canjeado por el navegador por una sesión estándar.

- **A. Mecanismo.** La función de servidor, tras verificar el código, pide a la interfaz administrativa un enlace de acceso de un solo uso para la identidad interna `<telefono>@telefono.monstore.cu`, extrae de él el testigo de un solo uso y lo devuelve al navegador. El navegador lo canjea inmediatamente y obtiene una sesión normal, con `getSession()`, `getUser()`, `auth.uid()`, reglas por fila, roles, perfil, saldo, pedidos y rutas protegidas funcionando sin excepción.
- **B. Responsable.** Una única función de servidor de esta misma aplicación (`verificar código`). No hace falta ninguna función externa adicional.
- **C. Credenciales privilegiadas.** La clave de servicio del backend definitivo, presente solo en el entorno del servidor.
- **D. Cómo no exponerla.** Se lee dentro del cuerpo de la función, nunca a nivel de módulo, nunca en un archivo que el navegador pueda alcanzar, nunca en la respuesta ni en los registros. Lo único que viaja al navegador es el testigo de un solo uso.
- **E. Renovación.** La estándar del sistema de cuentas: renovación automática del testigo. No se toca nada.
- **F. Cierre de sesión.** El estándar. Sin cambios respecto a hoy.
- **G. Cambio de dispositivo.** No hay estado ligado al dispositivo: el usuario pide un código nuevo y entra. Las sesiones antiguas siguen válidas hasta que caduquen o se cierren, igual que hoy.
- **H. Varias solicitudes de código.** La última invalida a las anteriores; solo un código vive a la vez. La espera mínima entre reenvíos y los topes por teléfono y por origen limitan el gasto.
- **I. Reutilización imposible.** Marca de usado y creación de sesión en la misma operación atómica, más vencimiento comprobado en el servidor.

### Riesgos

El testigo de un solo uso es un secreto efímero: vida muy corta, canje inmediato, prohibido registrarlo. La clave de servicio es la pieza más sensible del sistema.

### Bloqueador

**Debe verificarse contra el backend definitivo** que la interfaz administrativa de cuentas está disponible con la clave de servicio y que el enlace de un solo uso puede generarse para una identidad de correo interna. Es la vía documentada y habitual, pero no puede comprobarse desde este proyecto (§18-B1). **Alternativa descartada:** el acceso por teléfono nativo del sistema de cuentas exige contratar un proveedor de SMS de su catálogo, y zdSMS no está en él.

---

## 4. IDENTIDAD

**Formato interno definitivo y bloqueado:** `<telefono>@telefono.monstore.cu`. No se usa `@monstore.local`. No se antepone 53 automáticamente.

**Normalización única y obligatoria**, aplicada en el navegador, en el servidor y en la base, antes de cualquier búsqueda:

1. Quitar espacios, guiones, paréntesis, puntos y el símbolo de suma; conservar solo cifras.
2. Si el resultado tiene 10 cifras y empieza por `53`, se quitan esas dos: `5312345678` → `12345678`.
3. Si tiene 8 cifras, se acepta tal cual: `12345678`.
4. Cualquier otra longitud se rechaza con un mensaje claro, sin enviar ningún SMS.

Es decir, `+5312345678`, `5312345678` y `12345678` resuelven todos a `12345678` y por tanto a la misma identidad. **Al proveedor se le entrega el número en el formato que exija para Cuba** (con prefijo país); lo que se almacena es siempre la forma normalizada.

**Preservación del identificador de usuario:** sí es posible y es lo que se hará — la interfaz administrativa permite crear la cuenta indicando su identificador, y se copia el del backend antiguo. Con eso quedan enlazados sin tocar nada: perfil, roles, billetera, movimientos, asientos financieros, fondos, retiros, pedidos, favoritos, referidos, notificaciones, publicaciones, eventos y auditoría. Solo si un identificador estuviera ocupado en el destino se recurriría a la tabla de correspondencia ya existente, reescribiendo referencias en una única operación y validando conteos y sumas. Preferencia clara: conservar el identificador.

---

## 5. TRANSICIÓN DE CONTRASEÑAS — RECOMENDACIÓN

| Opción | Valoración |
|---|---|
| A — solo código desde el primer día | Máxima simpleza y nada que retirar después, pero un fallo del proveedor o el agotamiento del crédito deja **a todos** fuera. Descartada sin un plan de contingencia. |
| B — código + contraseña en paralelo | Reduce el riesgo de quedarse fuera, pero mantiene viva la superficie de ataque que se quiere eliminar y obliga a una retirada posterior. |
| **C — código como único método + cambio de número por soporte** | **Recomendada.** Elimina la contraseña del producto, y el punto débil real (perder el número) se cubre con un procedimiento humano auditado (§6). |

**Recomendación: C, con una salvedad operativa.** C solo es aceptable si antes existen: cambio de número por soporte operativo, vigilancia del crédito de SMS con aviso anticipado al administrador, y una comprobación real de que el servidor alcanza al proveedor. Mientras esas tres piezas no estén, se mantiene B **de forma temporal y no anunciada**, y se pasa a C en cuanto estén. Esto corrige y sustituye la recomendación del documento anterior, que dejaba B abierta sin condición de salida.

---

## 6. RECUPERACIÓN O CAMBIO DE NÚMERO

1. **Quién lo solicita:** solo el titular, escribiendo al soporte por WhatsApp desde otro número.
2. **Comprobaciones:** últimos pedidos con importes, fecha aproximada de alta, saldo aproximado y, si existe, teléfono de respaldo del perfil. Mínimo dos coincidencias.
3. **Se conserva:** identificador de usuario, perfil, rol, saldo disponible y retenido, historial financiero, pedidos, referidos, favoritos, eventos, publicaciones y credenciales.
4. **Se modifica:** únicamente el teléfono del perfil y la identidad interna derivada de él.
5. **Antirrobo:** el nuevo número recibe un código y hasta que no se verifica no cambia nada; **los retiros quedan retenidos durante el proceso y 72 horas después**; el número anterior queda bloqueado para nuevas altas 30 días; ningún administrador puede completar el cambio sin la verificación del nuevo número.
6. **Auditoría:** entrada inmutable con número anterior, nuevo, administrador que autorizó, pruebas aportadas y momento.

Se recomienda además ofrecer un teléfono de respaldo opcional en el perfil.

---

## 7. ZDSMS

**Endpoints confirmados** contra las bibliotecas oficiales publicadas del proveedor; el sitio no responde desde este entorno (la conexión expira, probablemente restringido a redes cubanas). Base `https://zdsms.cu/api/v1`, credencial de portador en la cabecera.

| Uso | Método y ruta | Cuerpo |
|---|---|---|
| Datos de cuenta y crédito | `GET /me` | — |
| **Enviar un SMS** | `POST /message/send` | `recipient`, `mstext` |
| Estado de un envío | `GET /message/{id}/status` | — |
| Listados | `GET /message/`, `GET /message/paginated?page=N` | — |
| Campañas | `POST /campaign/send`, `GET /campaign/` | — |

**Declaración explícita: la documentación disponible NO ofrece endpoint alguno de generación ni de verificación de códigos.** zdSMS envía mensajes, no verifica. No se inventó ningún endpoint. Toda la validación es de MonStore (§2).

**Disponibilidad y errores.** Tiempo máximo de espera 10 segundos; un solo reintento automático ante error de red o 5xx, nunca ante rechazo del número o credencial. Fallos contemplados: crédito agotado, número inválido o fuera de Cuba, credencial rechazada, límite del proveedor, servicio caído.

**Regla de integridad:** el código se guarda **antes** de llamar al proveedor y, si el envío falla, la solicitud se marca como fallida y se libera el intento del límite. Un fallo del proveedor **nunca** crea, modifica ni toca cuentas, perfiles ni saldos: en el flujo de solicitud no existe ninguna escritura sobre esas tablas.

**Qué ve el usuario:** "No pudimos enviarte el mensaje ahora mismo. Inténtalo de nuevo en un momento." Nunca el texto crudo del proveedor. **Qué registra el sistema:** teléfono, origen, código de error del proveedor, identificador del envío y momento, en el registro del servidor y en la auditoría.

**Bloqueadores:** credencial y crédito (no solicitados todavía) y comprobación de que el servidor alcanza al proveedor.

---

## 8. G2BULK

Arquitectura confirmada y sin cambios: **aplicación → función de servidor → proveedor**. La clave vive en un único archivo del servidor y viaja en la cabecera. Nunca en el navegador, ni en código público, ni en tablas accesibles al cliente. No se conectó, no se introdujo ninguna clave, no se hicieron llamadas reales.

**Protección comercial ya implementada en el backend definitivo:** un disparador aborta cualquier intento de la sincronización de modificar precio de venta, precio promocional, fechas de promoción, activo, destacado u orden. La sincronización solo puede escribir coste, disponibilidad, identificadores técnicos y fecha de última sincronización. Los precios quedan bajo control administrativo exclusivo.

---

## 9. BILLETERA — COMPATIBILIDAD

Compatible. Se copian tal cual saldo disponible, saldo retenido, estado e identificador antiguo de referencia: sin recalcular, sin redondear, sin recrear movimientos; el historial conserva sus saldos anteriores y posteriores. El destino impone saldo no negativo por restricción de tabla y no permite al cliente modificar su saldo. Validación obligatoria tras copiar: suma total y número de movimientos deben coincidir **exactamente** con el origen; si no cuadra, se revierte.

---

## 10. PEDIDOS — COMPATIBILIDAD, IDEMPOTENCIA Y ANTIDOBLE COBRO

Modelo canónico: **crear → pagar → procesar → entregar o fallar → reembolsar**. Verificado en el destino: idempotencia por clave de intento, transiciones inválidas rechazadas, historial de estados inmutable, saldo no negativo, precio calculado en el servidor, bloqueo de ofertas de tipo "vía cuenta", asiento financiero y auditoría. Cada pedido congela nombre de juego y oferta, precios, costes, coste del proveedor en dólares y la configuración comercial vigente.

**Idempotencia:** el navegador genera una clave por intento de compra y la envía; el servidor la guarda junto al pedido con unicidad garantizada por la base. Un reintento con la misma clave devuelve el mismo pedido, **sin volver a descontar**. Un reintento tras un fallo de red, un doble clic o dos pestañas abiertas producen un solo cargo.

**Antidoble cobro en el cutover:** el riesgo real no es la función nueva, sino la convivencia. Regla: el día del cambio, en el backend antiguo se revocan `place_wallet_order` y `refund_wallet_order` **en el mismo paso** en que la aplicación pasa a apuntar al destino. Nunca las dos vías abiertas a la vez, ni un minuto.

---

## 11. CATÁLOGO

No se migró nada. Mapeo previsto: 386 juegos, 6.193 ofertas, **5.070 → vía identificador**, **1.123 → código** (hoy marcadas como "vía cuenta" siendo en realidad códigos automáticos), **0 → vía cuenta**. Se copian exactamente el precio de venta, promociones, activo, destacado y orden; **no se recalcula nada**. Se conservan identificador antiguo, proveedor e identificador de producto del proveedor.

**Casos especiales, todos a revisión manual, sin fusión automática:** Free Fire, Call of Duty, DLS26 y Neo Monster (internos, sin identificador de proveedor); 8 juegos con proveedor y sin ofertas; y los 7 pares de nombres duplicados — EAFC 24, Honor of Kings, Magic Chess Gogo, Valorant Indonesia, Valorant Malaysia, Valorant Philippines, Yalla Ludo. Se migran tal cual, sin fusionar ni renombrar.

Detalles cerrados: identificador único por oferta derivado del proveedor; región obligatoria con valor general cuando falte; coste en dólares en el bloque técnico y en CUP en su columna.

---

## 12. ALMACENAMIENTO DE ARCHIVOS

Los cuatro depósitos previstos — avatars, catalog, deposit-proofs, listings — **fueron preparados desde el Admin Panel según el informe anterior y no se vuelven a crear**. Desde este proyecto no pueden inspeccionarse; no se asume que falten.

Compatibilidad de esta aplicación con depósitos privados: toda lectura debe pasar por **enlaces temporales generados en el servidor**; ninguna pantalla puede construir una dirección pública directa. Las subidas de avatar, comprobante de depósito y fotos de publicación siguen funcionando igual (el propietario escribe lo suyo). Al adaptar habrá que revisar cada lugar donde hoy se compone una dirección pública de imagen y sustituirlo por enlace temporal. Ninguna imagen se copió.

---

## 13. FUNCIONES — CLASIFICACIÓN

| Función | Clasificación |
|---|---|
| `has_role`, `update_updated_at_column` | **CONSERVAR** |
| `release_payment_line`, `claim_referral_reward`, `set_display_currency`, `top_recharged_games`, `event_participant_counts` | **ADAPTAR** |
| `handle_new_user` | **ADAPTAR** — alinear con `<telefono>@telefono.monstore.cu` (ajuste de una línea) |
| `place_wallet_order`, `refund_wallet_order` | **REEMPLAZAR** por `create_order`/`pay_order`/`admin_refund_order`; revocar el día del cutover |
| `request_deposit`, `request_deposit_v2`, `review_deposit`, `request_withdrawal`, `review_withdrawal` | **REEMPLAZAR** por las administrativas del destino |
| `publish_game_account`, `review_game_account`, `read_account_credentials`, `subscribe_event`, `enter_event_room` | **REEMPLAZAR** |
| `encrypt_account_credentials`, `keep_profile_phone` | **RETIRAR POSTERIORMENTE** |
| `create_order`, `pay_order`, `cancel_order`, `admin_set_order_status`, `admin_refund_order` (destino) | **CONSERVAR** — son el modelo canónico |

Componentes de acceso de esta aplicación: `signInWithPhone` y `signUpWithPhone` → **REEMPLAZAR**; campos de contraseña y su mínimo, pestañas de acceso/alta y el mensaje "ese número ya tiene cuenta" → **RETIRAR**; `phoneToEmail` y `normalizePhone` → **ADAPTAR** con la regla de §4; detección de sesión guardada, puerta de rutas protegidas y las rutas `/login` y `/registro` → **MANTENER**. No existe recuperación de contraseña: nada que retirar.

**Ninguna función fue eliminada ni modificada.**

---

## 14. SEGURIDAD

| Amenaza | Defensa |
|---|---|
| Fuerza bruta del código | 6 cifras, 5 intentos, al quinto el código muere |
| Códigos simultáneos | Pedir uno nuevo invalida los anteriores |
| Reutilización / repetición | Marca de usado en la misma operación que crea la sesión |
| Código caducado | Vencimiento en el servidor, nunca en el navegador |
| Enumeración de usuarios | Respuesta idéntica exista o no la cuenta |
| Código legible en la base | Solo huella con sal |
| Comparación por tiempo | Comparación en tiempo constante |
| Fuga del secreto del proveedor | Solo en el entorno del servidor |
| Abuso automatizado y spam | Límites por teléfono y por origen, más bloqueo temporal |
| Gasto malicioso de SMS | Tope diario por teléfono y tope global con aviso al administrador |
| Códigos en registros de diagnóstico | Prohibido registrar el código; solo la huella |

Auditoría inmutable, visible solo al administrador, con teléfono, origen, resultado y momento de cada solicitud e intento.

### Límites propuestos

| Límite | Valor | Estado |
|---|---|---|
| Vigencia del código | 5 minutos | **Recomendado** |
| Espera mínima entre reenvíos | 60 segundos | **Recomendado** |
| Intentos fallidos por código | 5 | **Recomendado** |
| Máximo por teléfono y hora | 3 | **Requiere tu aprobación** |
| Máximo por teléfono y día | 10 | **Requiere tu aprobación** |
| Máximo por origen y hora | 10 | **Requiere tu aprobación** |
| Bloqueo temporal tras superarlos | 30 minutos | **Requiere tu aprobación** |
| Tope global diario de mensajes | configurable, aviso al 80 % | **Requiere tu aprobación (coste)** |

Todos administrables desde los ajustes, nunca escritos en el código, y comprobados **en el servidor antes de llamar al proveedor**.

---

## 15. CUTOVER

Procedimiento completo, con orden y dependencias, en `FASE_2_5_CUTOVER_AUTH.md` §1.

---

## 16. ROLLBACK

Procedimiento completo y punto de no retorno en `FASE_2_5_CUTOVER_AUTH.md` §2.

---

## 17. PRUEBAS

Lista obligatoria de preproducción en `FASE_2_5_CUTOVER_AUTH.md` §3.

---

## 18. BLOQUEADORES

- **B1 — Sin acceso al backend definitivo.** Este proyecto solo alcanza `yfimkckjhhvxkbkyxexd`. No puede verificarse el mecanismo de sesión (§3), ni el estado de los depósitos, ni aplicarse la preparación pendiente. **Sigue pendiente tu decisión del informe de Fase 1:** aplicar el SQL desde el proyecto de referencia, o autorizar la conexión directa.
- **B2 — El proveedor no responde desde este entorno.** Hay que comprobar que **el servidor de la aplicación** sí lo alcanza antes de depender de él.
- **B3 — Credencial y crédito de zdSMS.** No solicitados, por instrucción. Sin crédito, nadie entra.
- **B4 — Clave de servicio del backend definitivo** en el entorno del servidor, imprescindible para crear la sesión (§3-C).
- **B5 — WhatsApp de soporte** sin definir; imprescindible para §6.

**Contradicciones detectadas entre el Customer App y las migraciones 002–005: ninguna.** La única discrepancia previa (formato de identidad) quedó resuelta por tu decisión a favor de `@telefono.monstore.cu`, y se materializa como ajuste de una línea en `handle_new_user` (§13).

---

## 19. DECISIONES QUE REQUIEREN TU APROBACIÓN

1. **Opción C** de transición, con B temporal hasta que estén sus tres condiciones (§5).
2. Los cinco límites marcados "requiere aprobación" en §14, en especial el tope global diario, que es una decisión de **coste**.
3. Desbloqueo de B1: cómo aplicar la preparación en el backend definitivo.
4. Número de WhatsApp de soporte.
5. Confirmación de la regla de normalización de §4, en particular que `5312345678` y `12345678` son la misma persona.
6. Confirmación de que el cambio de número retiene los retiros durante el proceso y 72 horas después.

---

## 20. SIGUIENTE FASE RECOMENDADA

**Fase 3 — Preparación ejecutable en el backend definitivo, sin migrar datos:** aplicar la preparación pendiente de Fase 1, crear la tabla de códigos y la de auditoría (cerradas al cliente), añadir los ajustes de límites, y **verificar el mecanismo de sesión de §3 con una cuenta de prueba**. Esa verificación es el requisito que desbloquea todo lo demás; hasta que no esté hecha, no debe programarse el cutover.

---

## CONFIRMACIONES

**NO SE MIGRARON USUARIOS.**
**NO SE CAMBIÓ LA CONEXIÓN.**
**NO SE MODIFICÓ AUTH DE FORMA DESTRUCTIVA.**
**NO SE INTRODUJERON CREDENCIALES DE ZDSMS.**
**NO SE INTRODUJERON CREDENCIALES DE G2BULK.**

Además: no se llamó a ninguna API real, no se creó ni modificó ninguna tabla, depósito, función, usuario, saldo, pedido ni precio, no se cambió ninguna variable de entorno y no se realizó ninguna operación irreversible. Lo único escrito en este turno son este documento, `FASE_2_5_CUTOVER_AUTH.md` y la lista de tareas.
