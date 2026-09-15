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

Cada acceso a datos privados se autoriza en el servidor por rol y por propiedad de la publicación; el navegador nunca decide.

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

Comisión correcta por duración, cobro único, contraseña final distinta de la original, doble factor válido y código que cambia cada 30 segundos, publicación visible tras aprobar, ausencia total de datos privados en las vistas públicas, compra completa con entrega y temporizador, expiración sin venta que entrega al vendedor los datos actuales y el doble factor, republicación con nueva comisión, dos compradores simultáneos con una sola compra, y acceso denegado a cualquier cliente que no sea el propietario o el comprador.

## Fuera de alcance

No se toca autenticación, OTP, relay de SMS, roles, wallets, depósitos ni retiros, salvo la lectura de saldo y el registro de movimientos ya existentes.
