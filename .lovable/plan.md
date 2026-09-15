# Solicitudes de cuentas y comercio de cuentas — implementación completa

## Lo que ya existe y se reutiliza

- Publicaciones: tabla de cuentas en venta con vendedor, juego, región, plataforma, precio, fotos, estado, días contratados, importe pagado, fecha de publicación y de vencimiento.
- Datos privados: tabla aparte de credenciales, ya cifrada con clave interna, accesible solo para administración.
- Cobro de publicación: la función que publica ya cobra de la wallet, registra el movimiento, notifica y devuelve el importe si se rechaza.
- Comisión de publicación: **ya existe** en Configuración como precio por día (`listing_fee_per_day`). Se reutiliza como base y se amplía a una tabla de comisiones por duración (1 a 5 días) sin crear un segundo parámetro paralelo.
- Wallet, movimientos, notificaciones, auditoría, almacenamiento privado de fotos y tiempo real sobre publicaciones ya están operativos.

## Cambios en la base de datos

1. Configuración: comisiones por duración (1–5 días) editables por el administrador; si una duración no está configurada se calcula con el precio por día actual.
2. Publicaciones: nuevos campos para inicio y vencimiento real de la publicación, comprador, fecha de venta, importe de venta, inicio y fin de las 24 horas de aseguramiento y entrega de datos al vendedor. Nuevos estados: publicación expirada y lista para republicar.
3. Datos privados: se separan **credenciales originales del vendedor** y **credenciales finales del administrador** (correo, contraseña, notas), más clave de doble factor y su estado (activo/inactivo). Todo cifrado igual que hoy.
4. Historial: tabla de eventos de la publicación (creada, pagada, corregida, contraseña cambiada, doble factor configurado, aprobada, publicada, vendida, entregada, expirada sin venta, republicada) con actor, estado anterior y nuevo. Vendida y expirada sin venta son estados distintos; nunca se usa "devolución" para una publicación que solo venció.
5. Cobros de publicación: registro por publicación con duración, comisión, importe, método, estado y clave de idempotencia para evitar cobros dobles.

Se mantiene el cifrado actual, RLS en todas las tablas y permisos por rol.

## Funciones del servidor

- Publicar / republicar: calcula la comisión desde Configuración según la duración elegida, cobra una sola vez con clave de idempotencia, guarda datos públicos y privados y deja la solicitud pendiente.
- Revisión del administrador: editar datos públicos, precio, fotos, región y juego; corregir o completar datos privados; fijar la contraseña final; aprobar (inicia el período pagado) o rechazar (devuelve el importe).
- Doble factor: generar clave, entregar el QR y la clave de configuración al administrador, comprobar un código, activar, desactivar y regenerar.
- Código actual: se calcula en el servidor a partir de la clave y la hora; nunca se guarda ningún código.
- Compra: verifica publicación activa, no vencida, no vendida, precio vigente y saldo disponible del comprador; bloquea la fila para que dos compradores simultáneos no puedan comprar la misma cuenta; descuenta el precio del saldo disponible del comprador y lo deja **retenido para esa venta**. El vendedor recibe 0 en ese momento.
- Entrega al comprador: forma parte de la misma operación de compra, sin paso manual. Al completarse el pago se marca vendida, se registra comprador y operación, se entregan credenciales finales y doble factor, arrancan las 24 horas, se audita y se notifica a ambas partes. La consulta posterior de esos datos solo la puede hacer el comprador de esa publicación.
- Vencimiento sin comprador: al pasar la fecha y solo si nadie compró, la publicación sale del comercio, cambia a "publicación expirada", el vendedor original recibe los datos actuales (los administrados por MonStore, no los originales) más la configuración y el código de doble factor, y se le notifica que puede asegurar la cuenta y volver a publicar pagando nueva comisión.
- Si la cuenta se vendió, el comprador pasa a ser el propietario y el vendedor pierde el acceso a credenciales y doble factor. Las 24 horas son solo el período inicial de aseguramiento: al terminar no devuelven la cuenta al vendedor. La cuenta vuelve a estar disponible para el vendedor únicamente cuando la publicación vence sin haber sido comprada.

## Doble factor de la cuenta del juego

El doble factor pertenece únicamente a la cuenta del videojuego en venta: no tiene ninguna relación con el acceso a MonStore, el código por SMS ni la entrada de administradores o clientes. La clave se guarda cifrada, los códigos de 6 dígitos nunca se almacenan y el código actual se calcula en el servidor con la clave y la hora.

Quién puede verlo, siempre comprobado en el servidor por identidad, rol y propiedad de la publicación:
- Antes de la venta: solo el administrador autorizado. El comprador ve exclusivamente información pública, sin contraseña, correo, clave, QR ni código.
- Después de la venta: solo el comprador de esa publicación, que además puede seguir consultando el código durante las 24 horas mientras cambia contraseña, correo, teléfono y recuperación.
- Publicación vencida sin venta: solo el vendedor original, que recibe la configuración actual y el código para volver a asegurar la cuenta antes de republicarla.

Vendida la cuenta, el vendedor pierde el acceso a credenciales finales, clave, QR y código.

## Dinero de la venta: retención de 8 horas

- Al comprar, el precio sale del saldo disponible del comprador y queda retenido para esa venta concreta. Ejemplo: con 15.000 y una cuenta de 10.000, el comprador queda con 5.000 disponibles y 10.000 retenidos, y el vendedor recibe 0.
- La retención se registra vinculada a publicación, comprador, vendedor, operación, importe, moneda, hora de compra, hora de liberación, estado y clave de idempotencia. Se reutiliza el mecanismo de saldo retenido y de movimientos que ya usa la wallet, distinguiendo por tipo para no mezclarla con la retención de retiros.
- La entrega de la cuenta no espera las 8 horas: ocurre en cuanto el pago queda retenido.
- Ocho horas después de la compra, el servidor comprueba que la venta sigue válida y que los fondos no se liberaron antes; entonces libera la retención, acredita al vendedor, crea el movimiento, cierra la retención, audita y notifica.
- Dos temporizadores independientes: 8 horas para el dinero del vendedor y 24 horas para que el comprador asegure la cuenta.
- Notificaciones: al vender, "tu cuenta fue vendida, el pago está retenido y se acreditará en 8 horas"; al liberar, "el pago de tu venta ya fue acreditado", con importe, fecha y operación.
- Liberación idempotente: si el estado ya es "fondos liberados" no se vuelve a acreditar, ni al reintentar, ni por dos administradores, ni por un proceso duplicado.
- Si la liberación falla, el dinero permanece retenido, nunca se acredita a medias, el estado queda como "liberación pendiente" y se puede reintentar con verificación previa.
- Panel: el dashboard muestra fondos retenidos por comercio de cuentas (número de ventas, importe total, próximas liberaciones, liberaciones pendientes e incidencias), separado de la retención por retiros. En Fondos e historial se distinguen depósito, retiro, compra de cuenta y liberación de venta.
- Auditoría financiera completa de compra y liberación, con actor, estado anterior y nuevo, para poder reconstruir cada CUP.

## Cuentas vendidas (historial permanente)

Al confirmarse la compra se avisa de inmediato a las dos partes. Al vendedor: "tu cuenta fue vendida", con juego, precio, fecha y hora, pago "retenido" y hora estimada de liberación, sin decir en ningún caso que ya recibió el dinero. Al comprador: "compra completada, la cuenta ya está disponible y tienes 24 horas para asegurarla", con fecha y hora, precio pagado, estado de la transferencia, inicio y fin de las 24 horas, y el aviso de que sus datos de acceso y el doble factor están en su área privada. Sin avisos duplicados.

La cuenta sale del comercio pero nunca se borra: queda como registro comercial permanente, con sus fotos conservadas. Estados propios de la venta —vendida, fondos retenidos, fondos liberados— separados de los estados de publicación.

Nueva sección "Cuentas vendidas" en el panel:
- Lista con foto principal, juego, región, precio, vendedor, comprador, fecha de venta y estado del pago.
- Ficha con la información pública completa (todas las fotos, juego, región, plataforma, descripción, características, precio, fechas de publicación y venta, días contratados), vendedor y comprador con nombre, identificador y teléfono, finanzas (importe, retenido, hora de compra, liberación programada, liberación real, estado) y transferencia (credenciales entregadas, estado de entrega, inicio y fin de las 24 horas, aseguramiento).
- Filtros por fecha, juego, región, vendedor, comprador, precio, estado de fondos y estado de transferencia, y búsqueda por teléfono, nombre o identificador de operación.

El registro está conectado con Fondos: la misma venta aparece en las retenciones de comercio de cuentas y su estado financiero se actualiza solo al liberarse. Todo se refresca en vivo (solicitudes, publicaciones, cuentas vendidas, retenciones, próximas liberaciones y actividad) sin recargar. Los teléfonos y cualquier dato privado solo los ve un administrador autorizado, comprobado en el servidor.

## Pantallas

**Vendedor**
- Publicar: elige duración y ve claramente duración, comisión y total según la configuración vigente.
- Mis publicaciones: estado, tiempo restante en vivo, aviso de expiración, acceso privado a los datos actuales de su cuenta y botón "Volver a publicar" (permite cambiar precio, fotos y descripción antes de pagar la nueva comisión).

**Administrador**
- Solicitudes de cuentas: lista con pendientes, publicadas, vendidas, expiradas y devueltas, en tiempo real.
- Ficha de revisión: edición completa de datos públicos y privados, contraseña final, panel de doble factor con QR, clave, código actual y cuenta atrás, y acciones de aprobar, rechazar y retirar. La entrega al comprador solo se consulta, no se ejecuta a mano; existe un "reintentar entrega" idempotente para fallos técnicos que nunca entrega dos veces.

**Comprador**
- Comercio y detalle: solo información pública.
- Tras comprar: área privada con credenciales finales, configuración de doble factor, código actual con cuenta atrás y temporizador de 24 horas.

## Configuración

Nueva sección en Configuración para las comisiones de 1 a 5 días, reutilizando el parámetro existente como valor por día de referencia.

## Pruebas que se realizarán

Comisión correcta por duración, cobro único, contraseña final distinta de la original, doble factor válido y código que cambia cada 30 segundos, publicación visible tras aprobar, ausencia total de datos privados en las vistas públicas, compra que deja al comprador con el saldo correcto y el importe retenido con el vendedor en cero, entrega inmediata con temporizador de 24 horas, liberación a las 8 horas que acredita al vendedor una sola vez incluso ejecutándola dos veces, expiración sin venta que entrega al vendedor los datos actuales y el doble factor, republicación con nueva comisión, dos compradores simultáneos con una sola compra, y acceso denegado a cualquier cliente que no sea el propietario o el comprador.

## Fuera de alcance

No se toca autenticación, OTP, relay de SMS, roles, wallets, depósitos ni retiros, salvo la lectura de saldo y el registro de movimientos ya existentes.
