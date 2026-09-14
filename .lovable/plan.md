# FASE 1 — PREPARACIÓN DEL BACKEND DEFINITIVO

## 0. Aviso previo: la Fase 1 no puede ejecutarse desde aquí

Regla 15 aplicada: me detengo y lo reporto antes de nada.

> **Desde este proyecto no tengo ninguna conexión al backend definitivo `nklgztbukgaoycuaryzk`: ni de lectura ni de escritura.**

Mis herramientas de base de datos apuntan exclusivamente al backend actual. Lo que sí puedo leer es el **código y las migraciones** del proyecto de referencia, que es donde vive ese backend. Todo el análisis que sigue sale de ahí.

Consecuencia concreta sobre las tareas que me pediste:

| Tarea | ¿Ejecutable aquí? |
|---|---|
| A. Validar el esquema destino **en vivo** | **No.** Solo puedo validarlo contra sus migraciones |
| B. Crear las estructuras que falten | **No.** Requiere escritura |
| C. Crear los cuatro depósitos de archivos | **No.** Requiere escritura |
| D. Auditoría de seguridad | **Sí**, sobre el código de las migraciones |
| E. Modelo de pedidos y dinero | **Sí** |
| F. Capacidad del catálogo | **Sí** |
| G. Análisis de migración de cuentas | **Sí** |
| H. Clasificación de funciones antiguas | **Sí** |
| I. Arquitectura del proveedor | **Sí** |

Las dos únicas salidas: **(A)** ejecutar los puntos A, B y C desde el proyecto de referencia, que sí tiene ese backend conectado — yo preparo el SQL exacto aquí y lo aplico allí; **(B)** autorizar la conexión externa de ese backend a este proyecto. Dime cuál.

Entrego el resto completo a continuación.

## 1. Qué estructuras ya estaban listas

Buena noticia: **la migración 005 ya creó casi todo lo que la auditoría marcaba como faltante.** Revisada línea por línea, el destino ya declara:

**Tablas canónicas presentes (33):** profiles, user_roles, wallets, wallet_transactions, balance_lines, fund_requests, withdrawal_requests, finance_entries, settings, audit_log, blocked_users, games, products, orders, order_status_history, events, event_participants, event_rooms, event_results, event_notification_log, account_listings, account_credentials, credential_access_log, account_sales, notifications, notification_campaigns, referrals, payment_methods_config, payment_destinations, payment_line_events, legacy_user_map, user_favorite_games, user_currency_prefs.

**De tu lista del punto A, están las 28.** No falta ninguna.

**Y de la lista del punto B, la 005 ya resolvió 8 de 9:**

| Estructura pedida | Estado |
|---|---|
| Favoritos | **Ya existe** (tabla propia, con reglas de acceso propias) |
| Preferencia de moneda | **Ya existe** |
| Provincia y municipio | **Ya existen** como columnas del perfil |
| Plataformas por juego | **Ya existe** como lista en el juego |
| Tarifa de publicación | **Ya existe** como ajuste, con valor 150 |
| Costo del proveedor en el pedido | **Ya existe**, en dólares, unitario y total |
| Correspondencia de usuarios antiguos | **Ya existe**, con marca del proyecto de origen y sin duplicados posibles |
| Configuración de métodos y destinos de pago | **Ya existe**, solo para administrador |
| Texto libre en los ajustes | **Ya existe** |

Además ya están cargados los ajustes comerciales: costo base 1.000, ganancia 150, tarifa de publicación 150, valor del saldo móvil 2,8 y reutilización de líneas.

## 2. Qué estructuras nuevas serían necesarias

Solo tres, todas menores y aditivas:

1. **Ajuste del WhatsApp de soporte.** El campo de texto existe, pero la clave no está creada. Es una sola línea.
2. **Los cuatro depósitos de archivos** (perfiles, catálogo, comprobantes, publicaciones). El destino **no define ninguno**. Hay que crearlos privados, con lectura y escritura solo para el dueño del archivo o el administrador, y acceso por enlace firmado desde el servidor.
3. **Nada más.** No hay que crear ni una tabla.

## 3. Qué cambios se realizaron

**Ninguno.** No se ejecutó ningún cambio, en ningún backend. No hay acceso de escritura al destino y no se tocó el actual.

## 4. Funciones creadas o modificadas

**Ninguna.**

## 5. Reglas de acceso creadas o modificadas

**Ninguna.**

## 6. Depósitos de archivos creados

**Ninguno.** Los cuatro siguen pendientes (§2).

## 7. Riesgos de seguridad detectados

Revisado el destino contra tu lista del punto D. El resultado es bueno: **el modelo del destino es más estricto que el actual.**

| Comprobación | Destino |
|---|---|
| Reglas de acceso activas en todas las tablas | **Sí** |
| El cliente no ve el costo del proveedor | **Sí**: queda fuera de las vistas públicas |
| El cliente no puede tocar su saldo | **Sí**: solo lectura; el saldo cambia únicamente por función |
| El cliente no puede aprobar ni rechazar nada | **Sí**: toda operación administrativa exige rol de administrador comprobado en el servidor |
| El cliente no puede ver credenciales de cuentas | **Sí**: sin ningún permiso, y cada lectura queda registrada |
| El cliente no ve datos de otros usuarios | **Sí**: todo acotado a su propio identificador |
| Las funciones sensibles fijan su ruta de búsqueda | **Sí** |
| Los registros de eventos de línea, historial de estados, movimientos y auditoría son inmutables | **Sí**, por disparador que aborta cualquier cambio o borrado |
| Las funciones internas están revocadas al cliente | **Sí** (por ejemplo el registro de eventos de línea) |

**Riesgos reales que quedan, todos en esta app, no en el destino:**

| Riesgo | Nivel | Solución |
|---|---|---|
| Aprobar retiros, aprobar cuentas y entrar a la sala de eventos se llaman **desde el navegador** | **ALTO** | Moverlos a funciones de servidor con verificación de rol, además de la comprobación interna |
| Varias operaciones usan la clave de servicio del servidor para llamar funciones que deberían actuar como el usuario | **MEDIO** | Revisar una a una al adaptar; la clave de servicio salta todas las reglas |
| Los depósitos de archivos del destino no existen: si se crean mal, serían públicos | **ALTO** | Crearlos explícitamente privados, nunca por omisión |
| Dos formatos distintos de correo interno | **CRÍTICO** | §8 |

## 8. Cómo migrar las cuentas (punto G — respuesta directa)

**La respuesta corta: las contraseñas sí pueden conservarse, pero no por una vía disponible desde aquí.**

Detalle técnico:

- Las contraseñas no se guardan en claro en ningún sitio: se guarda un **resumen criptográfico** irreversible. Nadie —ni yo, ni tú, ni el soporte— puede leerlas.
- Ese resumen **sí es transportable**: si se copia tal cual del sistema de autenticación antiguo al nuevo, junto con el identificador del usuario, la contraseña actual sigue funcionando sin que el cliente note nada.
- El obstáculo: copiar resúmenes de contraseña requiere acceso administrativo directo al sistema de autenticación de ambos proyectos, con la clave privada de cada uno. **En este entorno esas claves no son accesibles y no puedo pedírtelas.** Ni siquiera existe la conexión al destino.
- Con un solo usuario real hoy (tu cuenta, teléfono 5351115040), transportar el resumen es desproporcionado.

**Recomendación:** para este único usuario, crear la cuenta en el destino con el mismo identificador y una contraseña temporal que introduces tú, y cambiarla al primer acceso. El identificador debe ser **idéntico** al actual para que perfil, saldo, pedidos y referidos sigan enlazados. La tabla de correspondencia de usuarios antiguos ya existe en el destino y hace imposible duplicar a nadie.

**Si en el futuro hay muchos usuarios**, el flujo correcto es: exportar los resúmenes con acceso administrativo, importarlos conservando identificadores, verificar con un acceso de prueba y, solo si algo falla, caer al restablecimiento por código de un solo uso enviado por WhatsApp y verificado en el servidor. Hoy **no existe recuperación de acceso** en ninguno de los dos proyectos: hay que construirla antes de tener volumen.

**Conflicto que bloquea todo esto (ya señalado):** los dos proyectos derivan un correo interno distinto del mismo teléfono — aquí termina en `@telefono.monstore.cu`, allí en `@monstore.local` y además antepone el 53 a los números de 8 cifras. Hay que decidir cuál se usa **antes** de crear ninguna cuenta. Recomiendo el de esta app, que es la que tiene los usuarios reales.

## 9. Funciones antiguas: qué pasa con cada una

| Función actual | Destino | Motivo |
|---|---|---|
| `place_wallet_order` | **REEMPLAZAR** por crear pedido + pagar pedido | El destino separa crear y pagar, con historial de estados y bloqueo de ofertas vía cuenta |
| `refund_wallet_order` | **REEMPLAZAR** por el reembolso administrativo | El del destino deja asiento contable y exige rol |
| `request_deposit_v2` | **REEMPLAZAR** por la solicitud de fondos canónica | El destino ya tiene configuración de métodos, destinos y líneas |
| `review_deposit` | **REEMPLAZAR** por aprobar/rechazar fondos | Separadas y con asiento |
| `request_withdrawal` | **REEMPLAZAR** por crear solicitud de retiro | Mismo flujo, tabla distinta |
| `review_withdrawal` | **REEMPLAZAR** por completar/rechazar retiro | Igual |
| `release_payment_line` | **ADAPTAR** | En el destino se expresa como evento de línea; la lógica se conserva |
| `claim_referral_reward` | **ADAPTAR** | No existe equivalente; hay que reescribirla sobre la función de saldo del destino |
| `publish_game_account` / `review_game_account` | **REEMPLAZAR** por las de publicaciones del destino | El destino tiene además registro de acceso a credenciales |
| `read_account_credentials` | **REEMPLAZAR** | El destino usa otro cifrado, gestionado en el servidor |
| `subscribe_event` / `enter_event_room` | **REEMPLAZAR** | El destino separa sala, participantes y resultados |
| `set_display_currency` | **ADAPTAR** | La tabla de preferencia ya existe; falta la función |
| `top_recharged_games` / `event_participant_counts` | **ADAPTAR** | Consultas simples sobre las nuevas tablas |
| `has_role` | **CONSERVAR** | Idéntica en ambos |
| `handle_new_user` | **ADAPTAR** | El destino crea además el código de referido |
| `update_updated_at_column` | **CONSERVAR** | Idéntica |
| `encrypt_account_credentials` / `keep_profile_phone` | **ELIMINAR** (no migrar) | El destino resuelve ambas de otro modo |
| Lógica del proveedor (en el servidor de la app) | **ADAPTAR** | §10 |

**Nada se elimina todavía.** La revocación de `place_wallet_order` y `refund_wallet_order` en el backend antiguo se hace el día del cambio de conexión, no antes: es la única protección real contra el doble cobro mientras conviven.

## 10. Proveedor externo (punto I)

Arquitectura futura verificada como correcta: **app → función de servidor → proveedor**. La clave vive solo en el servidor, en un único archivo, y se envía en una cabecera. No llega al navegador, no está en variables públicas, no está en ninguna tabla, no aparece en ninguna respuesta.

Sobre la protección de precios: el destino **ya la tiene implementada**. Un disparador aborta cualquier intento de la sincronización de modificar precio, precio promocional, fechas de promoción, activo, destacado u orden, y la función de sincronización solo escribe columnas técnicas (costo, disponibilidad, identificadores, última sincronización). Esto es exactamente lo que pediste y ya está hecho. No hay que tocar nada.

## 11. Pedidos y dinero (punto E)

El modelo del destino es: **crear → pagar → procesar → entregar / fallar → reembolsar**, con estados cerrados y un historial inmutable.

| Protección pedida | Estado en el destino |
|---|---|
| Doble cobro | **Cubierto**: pagar solo avanza desde pendiente de pago |
| Doble pedido | **Cubierto**: clave de operación; si se repite, devuelve el pedido existente sin crear otro |
| Doble entrega | **Cubierto**: el cambio de estado pasa por una única función con transiciones validadas |
| Reintentos | **Cubierto**: la clave de operación también comprueba que el pedido sea del mismo usuario |
| Transiciones inválidas | **Cubierto**: disparador que aborta saltos no permitidos |
| Saldo negativo | **Cubierto**: restricción en el saldo, no solo comprobación en código |
| Manipulación del precio desde el navegador | **Cubierto**: el precio se lee de la oferta en el servidor; el navegador no lo envía |
| Ofertas vía cuenta que generen pedido | **Cubierto**: la función aborta explícitamente |

Además, cada pedido congela nombre del juego, nombre de la oferta, precio unitario, total, costo unitario, costo total, costo del proveedor en dólares y la configuración comercial usada. Cambiar la configuración no altera pedidos históricos.

**Este punto está completo y no requiere ningún trabajo.**

## 12. Catálogo (punto F)

El esquema destino puede recibir los 386 juegos y las 6.193 ofertas. Puntos a resolver en la futura migración, no ahora:

- La clasificación admite los tres tipos. La prevista 5.070 / 1.123 / 0 encaja sin cambios de esquema.
- Cada oferta necesita un identificador único propio: se derivará del identificador del proveedor.
- La región es obligatoria: las que no la tengan usarán un valor general.
- El costo del proveedor se guarda en dólares dentro del bloque técnico, y en CUP en su columna.
- Los precios se copian exactamente, sin recalcular.

**No se migró ni se modificó ningún dato del catálogo.**

## 13. Conflictos con las migraciones existentes

**No detecté ningún conflicto** con las migraciones 002, 003, 004 ni 005. Todo lo que la auditoría pedía añadir, la 005 ya lo añadió de forma aditiva y con nombres compatibles. No hay nada que improvisar ni que decidir en este punto.

## 14. Qué falta para empezar la migración de datos

1. **Acceso al backend definitivo** desde donde se vaya a ejecutar (§0). Es el bloqueador principal.
2. **Decisión sobre el formato del correo interno** (§8).
3. **Crear los cuatro depósitos de archivos**, privados.
4. **Añadir el ajuste del WhatsApp de soporte.**
5. **Contraseña temporal del administrador**, que introduces tú.
6. **Datos reales de pago**: tarjetas, líneas de saldo, dirección de criptomoneda y correo. Los actuales son de ejemplo y no se migran.

## 15. Confirmaciones finales

- **Qué NO se tocó:** absolutamente nada. Ni el backend actual, ni el definitivo, ni el proyecto de referencia, ni el código de esta app, ni las variables de entorno, ni los precios, ni el catálogo.
- **Esta app sigue conectada al backend antiguo.** Confirmado: `.env` y el archivo de configuración siguen apuntando a `yfimkckjhhvxkbkyxexd`, sin cambios.
- **Ningún dato del backend antiguo fue modificado.** No se ejecutó ninguna escritura de ningún tipo.
- **No se migraron usuarios, juegos, productos, saldos, pedidos ni archivos.**
- **No se introdujo ninguna clave del proveedor** ni ningún secreto.
- **El proyecto de referencia sigue intacto**; solo se leyó una copia descartable.

**Me detengo aquí. No avanzo a la Fase 2.** Necesito de ti la decisión del §0 (cómo dar acceso al backend definitivo) y la del §8 (formato del correo interno).
