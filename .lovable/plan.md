# AUDITORÍA DE VIABILIDAD — UNA SOLA WEB APP MONSTORE

Solo análisis. No se modificó ni un archivo, ni una tabla, ni una variable, ni la conexión. No se ejecutó SQL.

## 1. Resumen ejecutivo

La fusión es viable, y además es más sencilla de lo que el planteamiento supone, por un motivo que cambia el orden de todo:

> **Esta app de clientes ya contiene el panel administrativo, y es mucho más completo que el del proyecto de referencia.**

Cifras reales: aquí hay **16 pantallas de administración** (inicio, usuarios, wallets, pedidos, depósitos, retiros, pagos, juegos, productos, comercio, eventos, referidos, actividad global, proveedor, configuración). El proyecto Admin Panel tiene **5 pantallas** (finanzas, fondos, cuentas, eventos, ajustes) más su pantalla de acceso. No hay nada en su interfaz que aquí no exista en forma igual o más avanzada.

Conclusión: **no hay dos aplicaciones que fusionar, hay una aplicación (esta) y un backend (el del otro proyecto)**. El trabajo real no es mover pantallas: es cambiar de base de datos y traducir las consultas.

## 2. Viabilidad

| Criterio | Veredicto |
|---|---|
| Una sola app | **Ya se cumple**: esta app tiene `/app` y `/admin` en el mismo proyecto |
| Misma tecnología en ambos proyectos | Sí, idéntica (mismo tipo de proyecto, mismas librerías) |
| Una sola autenticación | Viable, con **un conflicto que hay que resolver antes** (§8) |
| Separación cliente/admin por roles | Ya implementada; hay que endurecerla (§8) |
| Un solo backend | Viable; es el 90% del esfuerzo |
| Riesgo de perder funcionalidad | Bajo si esta app es la base; **alto si se hace al revés** |

**Recomendación central: esta app es la aplicación final. El otro proyecto se usa solo como fuente del esquema de base de datos y se archiva.**

## 3. Inventario — esta app (cliente + admin)

**Cliente (`/app`):** inicio, recargas (lista y detalle por juego), tarjetas de regalo, pedidos (lista y detalle), wallet (saldo, depositar, retirar), comercio de cuentas (lista, detalle, publicar, mis publicaciones), eventos (lista y detalle), referidos, notificaciones, perfil, editar perfil.
**Públicas:** portada, acceso, registro, juegos, recargas, comercio.
**Admin (`/admin`):** inicio, usuarios, wallets, pedidos, depósitos, retiros, pagos, juegos, productos, comercio, eventos, referidos, actividad global, proveedor, configuración.

**Lógica de servidor:** catálogo, pedidos, pagos, favoritos, proveedor, credenciales. ~10.600 líneas de pantallas y lógica.

| Elemento | Destino |
|---|---|
| Todas las pantallas de cliente | **Se conservan**; solo cambian las consultas |
| Todas las pantallas de admin | **Se conservan** |
| Acceso por teléfono | **Se adapta** (§8) |
| Catálogo y precios | **Se adaptan** a la nueva estructura |
| Wallet, fondos, retiros | **Se adaptan** a las nuevas funciones |
| Pedidos (compra simulada en recargas) | **Se reemplaza** por la compra real |
| Conexión al backend actual | **Se reemplaza** al final |
| Datos de pago de ejemplo | **Se eliminan**, no se migran |
| Catálogo, perfil, wallet, favoritos | **Necesitan migración** |

**Referencias al backend antiguo:** solo dos sitios, ambos de configuración (`.env` y el archivo de configuración del backend). Ningún identificador está escrito dentro del código. Esto hace el cambio de conexión limpio.

## 4. Inventario — proyecto de referencia

Interfaz: acceso, finanzas, fondos, cuentas, eventos, configuración. Un menú inferior de 5 secciones. Sin catálogo, sin productos, sin pedidos, sin usuarios, sin referidos, sin notificaciones, sin auditoría, sin proveedor.

Lo valioso está fuera de la interfaz: **el esquema de base de datos y sus migraciones** (esquema base + 11 migraciones aplicadas, incluida la 005 de convergencia que ya crea configuración de métodos de pago, destinos y eventos de línea).

| Elemento | Qué hacer |
|---|---|
| Sus 5 pantallas | **No se trasladan**: aquí ya existen equivalentes mejores |
| Su esquema de base de datos | **Se adopta íntegro** — es el destino |
| Sus funciones de servidor (crear pedido, pagar, aplicar saldo, aprobar fondos, auditoría) | **Se adoptan**; esta app llamará a ellas |
| Su lectura de credenciales cifradas | **Se adopta**; sustituye al cifrado actual |
| Su forma de acceso | **Se descarta** (conflicto del §8) |
| Sus componentes visuales | **Se descartan**: son los mismos de origen |

## 5. Funcionalidades duplicadas

| Función | Aquí | Referencia | Se conserva | Motivo |
|---|---|---|---|---|
| Acceso | Teléfono → correo `@telefono.monstore.cu` | Teléfono → correo `@monstore.local` | **El de aquí**, pero hay que decidir (§8) | Es el que tiene los usuarios reales |
| Pantalla de fondos | Depósitos + retiros separados, con captura y líneas | Fondos en una sola pantalla | **La de aquí** | Más completa |
| Finanzas | Wallets + actividad global | Finanzas con asientos | **Ambas**: la de aquí más los asientos del otro | Se complementan |
| Cuentas en venta | Lista, aprobar, ver credenciales | Igual, más simple | **La de aquí** | Más completa |
| Eventos | Admin + cliente, con sala | Solo admin | **La de aquí** | El otro no tiene la parte cliente |
| Configuración | 748 líneas, precios, pagos, líneas, soporte | Ajustes básicos | **La de aquí** | Mucho más amplia |
| Catálogo, pedidos, usuarios, referidos, proveedor, auditoría | Sí | **No existen** | **Las de aquí** | Sin competencia |
| Protección de la zona admin | Capa de ruta con comprobación de rol | Comprobación dentro del componente | **La de aquí** | Se comprueba antes de pintar |

**No hay ni una sola función donde el proyecto de referencia gane en la interfaz.**

## 6 y 7. Dependencias del backend y compatibilidad

| Dependencia actual | Clase | Nota |
|---|---|---|
| perfiles, roles, comprobación de rol | **A. Compatible** | Existen igual; faltan provincia y municipio |
| notificaciones, eventos, participantes | **A. Compatible** | Estructura equivalente |
| juegos y ofertas | **B. Adaptación** | Nombres de columnas distintos; el costo del proveedor pasa a un campo interno |
| wallet y movimientos | **B. Adaptación** | El saldo solo cambia mediante función; se pierde un campo de saldo previo |
| depósitos y retiros | **B. Adaptación** | Pasan a solicitudes de fondos y de retiro |
| pedidos | **B. Adaptación** | Se separa en crear, pagar, procesar, con historial de estados |
| cuentas en venta y credenciales | **B. Adaptación** | Cifrado distinto: el actual **no se migra**, se vuelve a introducir |
| favoritos, preferencia de moneda, provincia/municipio, tarifa de publicación, WhatsApp de soporte | **C. Migración** | Necesitan añadirse al backend destino |
| métodos y destinos de pago de ejemplo, líneas de ejemplo | **D. No se trasladan** | Datos falsos |
| función de compra actual y de reembolso actual | **E. Riesgo crítico** | Si conviven con las nuevas, hay doble cobro |
| identificador del backend en configuración | **E. Riesgo crítico** | Debe cambiarse en un único momento, no a medias |
| 4 depósitos de archivos | **C. Migración** | Hay que crearlos privados en el destino |

## 8. Autenticación y roles

**Conflicto que hay que resolver antes de tocar nada:** los dos proyectos construyen un correo interno distinto a partir del mismo teléfono. Aquí termina en `@telefono.monstore.cu`; allí en `@monstore.local`, y además allí se antepone el 53 a los números de 8 cifras. **Un mismo teléfono da dos cuentas distintas.** Si no se unifica, el día del cambio nadie entra con su contraseña.

Decisión recomendada: conservar el formato de esta app y crear la cuenta administrativa en el destino con ese mismo formato. El otro proyecto quedaría archivado, así que su formato deja de importar.

**Roles.** Hoy: la zona admin comprueba el rol en el servidor antes de pintar, y el rol vive en su propia tabla, no en el perfil. Eso es correcto y se conserva. Lo que falta endurecer:

- Varias operaciones sensibles (aprobar retiros, aprobar cuentas, entrar a la sala de un evento) se llaman **desde el navegador**. Dependen solo de la comprobación interna de cada función. Debe moverse a funciones de servidor con verificación de rol, además de la comprobación interna.
- El backend destino ya trae comprobación de administrador integrada en sus tablas y funciones, lo que hace imposible escalar privilegios tocando el navegador. Es mejor que lo actual.

Veredicto: la arquitectura destino **sí permite** el modelo pedido; hay que adaptar las llamadas, no el modelo.

## 9. Arquitectura de rutas propuesta

La actual ya es la correcta y no debe cambiarse:

```text
/                      portada pública
/login  /registro      acceso
/juegos  /recargas  /comercio   escaparate público
/app/...               zona cliente  (requiere sesión)
/admin/...             zona admin    (requiere sesión + rol admin)
```

Un único punto de acceso, y dentro se decide a dónde va cada quien según su rol. **No conviene** separar en dos accesos ni en dos aplicaciones: multiplica sesiones y errores.

Único añadido sugerido: al entrar, un administrador debería poder elegir entre las dos zonas, y un cliente ni siquiera ver el enlace.

## 10. Archivos

| Tipo | Depósito | Hoy | Destino |
|---|---|---|---|
| Fotos de perfil | avatares | privado, 1 archivo | migrar el archivo |
| Portadas del catálogo | catálogo | privado, **0 archivos** | crear vacío; las 249 portadas son enlaces externos y se copian como texto |
| Comprobantes de pago | comprobantes | privado, 0 archivos | crear vacío |
| Fotos de cuentas en venta | publicaciones | privado, 0 archivos | crear vacío |
| Imágenes de eventos | enlace externo | — | sin cambios |

El destino **no define ningún depósito todavía**: hay que crear los cuatro, privados, con lectura solo por enlace firmado desde el servidor. Prácticamente no hay archivos que mover: un avatar.

## 11. Proveedor externo (G2Bulk)

Verificado: la clave vive **solo en el servidor**, en un único archivo de lógica de servidor, y se envía en una cabecera. No aparece en el navegador, ni en variables públicas, ni en ninguna tabla, ni en ninguna respuesta. **En este punto no hay nada que arreglar.**

Lo que sí hay que corregir: hoy la sincronización **sobrescribe el precio de venta y la disponibilidad** en cada pasada. En el destino existe ya una protección que aborta cualquier intento del proceso de sincronización de tocar precio, promoción, fechas, activo, destacado u orden. Al adoptar el destino, hay que limitar la sincronización a costo, disponibilidad técnica, identificadores y fecha de última sincronización.

## 12. Catálogo

Hoy: 386 juegos, 6.193 ofertas, clasificadas con dos valores (5.070 automáticas por ID, 1.123 marcadas "vía cuenta"). Esas 1.123 **no son ventas manuales**: todas tienen identificador de proveedor, son tarjetas y códigos automáticos. Clasificación correcta al migrar: **5.070 por ID, 1.123 código, 0 vía cuenta**. Los precios se copian tal cual, sin recalcular; el costo del proveedor queda como dato interno, nunca visible al cliente.

Adaptaciones necesarias: identificador único por oferta, región obligatoria, y el costo guardado en dólares dentro del bloque técnico en vez de una columna propia.

## 13. Riesgos

| Riesgo | Nivel | Solución |
|---|---|---|
| Dos formas distintas de crear el correo interno → nadie entra | **CRÍTICO** | Unificar el formato antes del cambio (§8) |
| La función de compra actual conviviendo con la nueva → doble cobro | **CRÍTICO** | Revocar la antigua el mismo día del cambio |
| Cambio de conexión a medias (unas pantallas en una base, otras en otra) | **CRÍTICO** | Cambio único y atómico, nunca parcial |
| Sincronización del proveedor borrando precios comerciales | **CRÍTICO** | Limitarla a columnas técnicas + protección del destino |
| Pérdida de sesiones al cambiar de base | **ALTO** | Avisar; todos vuelven a entrar una vez |
| Reclasificar mal las 1.123 ofertas → pasarían a atención manual | **ALTO** | Ya verificado: van a "código" |
| Credenciales de cuentas con cifrado incompatible | **ALTO** | No se migran; se vuelven a introducir (hoy hay 0 filas) |
| Operaciones sensibles llamadas desde el navegador | **ALTO** | Moverlas a funciones de servidor |
| Datos sin destino (favoritos, moneda, provincia, municipio, plataformas, tarifa, soporte) | **MEDIO** | Migraciones aditivas al destino |
| Exposición del costo del proveedor | **MEDIO** | El destino ya lo excluye de las vistas públicas; verificar |
| Doble creación de pedido por reintento | **MEDIO** | Clave de idempotencia derivada del código de pedido |
| Pérdida de imágenes | **BAJO** | Un solo archivo real; el resto son enlaces externos |
| Rutas o componentes en conflicto | **BAJO** | No se traslada interfaz del otro proyecto |
| Variables de entorno incompatibles | **BAJO** | Mismos nombres en ambos proyectos |

## 14–17. Qué se conserva, adapta, reemplaza y elimina

**Conservar:** toda la interfaz de esta app (cliente y admin), acceso por teléfono, creación automática de perfil y wallet al registrarse, traducción de nombres de ofertas, reglas de acceso por juego, aviso de horarios, cálculo de precio, saldo retenido, imágenes firmadas, protección de la zona admin por capa de ruta.

**Adaptar:** todas las consultas al backend, catálogo a la nueva estructura, wallet a la función de aplicación de saldo, depósitos y retiros a solicitudes, pedidos al flujo crear→pagar→procesar, lecturas públicas a las vistas públicas, llamadas sensibles a funciones de servidor, sincronización del proveedor.

**Reemplazar:** la compra simulada de la pantalla de recargas por la compra real, la función de compra y la de reembolso actuales por las del destino, el cifrado actual de credenciales, la conexión al backend.

**Eliminar (nunca migrar):** los datos de pago de ejemplo (3 líneas, 5 destinos, números de tarjeta, dirección de criptomoneda y correo inventados). Nada de código de esta app se elimina.

## 18. Plan de fusión recomendado

El orden propuesto se corrige: **la interfaz no se integra (ya está integrada), y el backend va primero.**

1. **Decisión del formato de correo interno** y de la cuenta administrativa. Bloquea todo lo demás.
2. **Migraciones aditivas al destino** para lo que no tiene sitio: favoritos, moneda, provincia y municipio, plataformas por juego, tarifa de publicación, WhatsApp de soporte, costo del proveedor en el pedido, correspondencia de usuarios antiguos.
3. **Crear los cuatro depósitos de archivos**, privados.
4. **Cuenta administrativa** en el destino, con contraseña temporal que introduces tú.
5. **Configuración**: base de precios (1.000 + 150), métodos de pago reales que debes confirmarme.
6. **Catálogo**: 386 juegos y luego 6.193 ofertas, con los precios copiados tal cual y la clasificación 5.070 / 1.123 / 0.
7. **Validación de cifras** contra los totales conocidos. Cualquier desviación detiene el proceso.
8. **Adaptar esta app** a la nueva estructura, todavía apuntando al backend antiguo para lo que se pueda, sin cambiar la conexión.
9. **Conectar la compra real** y mover las llamadas sensibles al servidor.
10. **Limitar la sincronización del proveedor** a datos técnicos.
11. **Pruebas completas** contra el destino en un entorno de prueba.
12. **Cambio de conexión**, en un único momento, revocando la función de compra antigua a la vez.
13. **Pruebas en producción** y vigilancia.
14. **Archivar el proyecto de referencia** (no borrarlo) y mantener el backend antiguo congelado 30 días.

## 19. Rollback

- **Código**: cada fase queda como versión aparte; volver atrás es restaurar la versión anterior de esta app.
- **Conexión**: se revierte devolviendo las tres variables y el archivo de configuración a los valores actuales. Es el punto de retorno rápido y funciona en minutos.
- **Datos**: el backend antiguo **solo se lee**, nunca se escribe, y queda intacto y congelado 30 días. Volver a él es volver al estado exacto de hoy.
- **Datos escritos en el destino**: cada fila migrada lleva marca de origen; deshacer es borrar exclusivamente esas filas, sin tocar nada preexistente.
- **Acceso**: al volver atrás, las sesiones vuelven a ser válidas en el backend antiguo; se pide entrar de nuevo.
- **Archivos**: no se borra ningún archivo en ningún momento, solo se copia.
- **Punto de no retorno**: la revocación de la función de compra antigua. Hasta ahí, todo es reversible.

## 20. Pruebas obligatorias

Entrar con teléfono y contraseña · un cliente intentando abrir la zona admin (debe rebotar) · un cliente intentando llamar una operación administrativa directamente (debe fallar en el servidor) · ver catálogo sin que aparezca ningún costo interno · compra por ID con verificación fallida y correcta · compra de código con error del proveedor y devolución · reintento con la misma clave (no debe cobrar ni entregar dos veces) · depósito con y sin captura · aprobar y rechazar depósito · retiro aprobado y rechazado · publicar cuenta y leer credenciales solo como administrador · intentar ver datos de otro usuario · sincronizar el catálogo comprobando que ningún precio cambia · cuadre final de juegos, ofertas y sumas.

## 21. Bloqueadores antes de ejecutar

1. **Sin acceso de escritura al backend destino desde este proyecto.** Mis herramientas de base de datos apuntan solo al actual. Salidas: ejecutar los pasos 2 a 7 desde el proyecto de referencia, que sí lo tiene conectado, o autorizar una conexión externa aquí.
2. **Formato del correo interno** sin decidir (§8).
3. **Datos reales de pago** sin confirmar: tarjetas, líneas de saldo, dirección de criptomoneda y correo.
4. **Contraseña temporal del administrador**, que introduces tú fuera de aquí.
5. **Confirmación** de la clasificación 5.070 / 1.123 / 0 y de los valores 1.000 / 150.

## 22. Recomendación final

Adelante con la fusión, con una corrección de fondo: **no fusiones dos aplicaciones. Quédate con esta, que ya es la aplicación completa, y llévala al backend definitivo.** El otro proyecto ha cumplido su función — definir el esquema — y debe archivarse, no integrarse. Así no se pierde ninguna pantalla, no aparecen componentes duplicados y el riesgo se concentra en un solo punto controlable: el día del cambio de conexión.

**Me detengo aquí. Nada fue modificado.** Necesito tu decisión sobre los 5 bloqueadores del §21, empezando por el primero.
