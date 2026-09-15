# Módulo de Eventos — implementación completa

Se reutiliza todo lo que ya existe (eventos, inscripciones, notificaciones, monedero, movimientos, usuarios y auditoría). No se crean tablas duplicadas ni datos ficticios: las pantallas actuales de eventos ya leen la base de datos real y se amplían.

## 1. Qué ya existe y se reutiliza

- Eventos: juego, región, tipo, fecha, hora, precio, mínimo/máximo, premio, descripción, banner, sala (identificador y contraseña), ventana de entrada, ganador, entrega del premio y publicación del resultado.
- Inscripciones: usuario, evento, identificador del personaje, estado, estado del cobro y hora de entrada.
- Vista pública de eventos que nunca expone la sala.
- Monedero, movimientos, notificaciones con clave anti-duplicado, y registro de auditoría con campo de evento.
- Inscribirse y entrar a la sala ya funcionan como operaciones del servidor.

## 2. Cambios en la base de datos (solo lo que falta)

Estados nuevos, sin duplicar los existentes: borrador, programado, entrada cerrada, en curso, ganador registrado y premio entregado. Se conservan inscripciones abiertas, meta alcanzada, sala activa (= entrada abierta), finalizado, cancelado y meta no alcanzada.

Campos nuevos en eventos:
- momento exacto de inicio (fecha + hora en zona correcta) para automatizar cierres y avisos;
- apertura y cierre de la ventana de entrada;
- evento gratuito o de pago (derivado del precio, 0 = gratuito);
- estado de entrega del premio: pendiente, en proceso, entregado, error, con mensaje de error;
- ingreso total cobrado por inscripciones;
- momentos de activación, cierre de entrada y cancelación.

Campos nuevos en inscripciones:
- momento del cobro y movimiento del monedero asociado;
- motivo de fallo de cobro;
- momento de cancelación por el cliente;
- clave única por usuario y evento (no permite doble inscripción).

Tabla nueva mínima: `event_prize_deliveries` (una fila por intento de entrega, con clave idempotente) para que un doble clic nunca entregue dos premios. Todo lo demás reutiliza tablas existentes.

## 3. Operaciones del servidor (toda la lógica y la autorización)

Administración (solo con rol de administrador, validado en el servidor):
- crear y editar evento con validación de campos (mínimo ≤ máximo, precio ≥ 0, fecha/hora válida, premio y juego obligatorios);
- activar evento manualmente cuando ya alcanzó la meta;
- cerrar entrada, marcar en curso y finalizar;
- buscar participante por identificador de personaje (devuelve nombre, usuario, personaje, juego, evento y premio para confirmar) y registrar ganador solo si ese personaje pertenece a un participante del evento;
- entregar premio de forma idempotente, con reintento seguro que primero verifica que no se entregó;
- publicar el resultado automáticamente al confirmarse la entrega;
- cancelar evento: si no hubo cobros no devuelve nada; si hubo cobros devuelve a cada afectado su importe exacto una sola vez, con movimiento propio y aviso.

Cliente:
- inscribirse indicando el identificador del personaje: sin cobro, sin descuento y sin retención; se rechaza si el evento está lleno, cerrado o si ya está inscrito;
- cancelar su inscripción mientras el evento no se haya activado;
- entrar al evento: el servidor comprueba sesión, inscripción confirmada, cobro correcto, evento activo y ventana abierta antes de devolver la sala, y guarda la hora de entrada.

Activación y cobro (una sola transacción, idempotente):
al alcanzarse el mínimo el evento pasa a meta alcanzada y activo; en eventos de pago se cobra el precio configurado de ese evento a cada participante confirmado, se registra un movimiento por inscripción y se marca cada cobro; quien no tiene saldo queda como no confirmado, con el fallo registrado y sin acceso, nunca con un cobro parcial; los eventos gratuitos no generan ningún movimiento.

## 4. Proceso automático programado

Una tarea del servidor cada 5 minutos, independiente de que alguien abra la aplicación:
- abre inscripciones de eventos programados que llegan a su fecha;
- activa y cobra los eventos que alcanzaron la meta;
- cierra inscripciones 5 minutos antes de la hora de inicio;
- abre la ventana de entrada de 15 minutos y la cierra al agotarse;
- marca en curso y finalizado;
- envía los avisos: 30 minutos antes, evento activo, quedan 5 minutos y acceso cerrado, cada uno con clave anti-duplicado.

## 5. Panel de administración

Lista con filtros por estado y buscador, y ficha de evento con:
- información: juego, región, tipo, fecha, hora, precio, premio, descripción, estado;
- resumen: participantes actuales, mínimo, máximo, porcentaje, tiempo restante, hora de inicio, hora de cierre de entrada, ventana de acceso, ingresos por inscripción, premio y cuántos entraron;
- participantes en tiempo real ordenados por fecha de inscripción: nombre, identificador, teléfono, personaje, fecha/hora, estado, estado del cobro, hora de entrada y participación;
- sala: identificador y contraseña, editables;
- resultado: registrar ganador por identificador de personaje con pantalla de confirmación, entregar premio, ver estado de entrega y reintentar si falló;
- acciones: crear, editar, activar, cerrar entrada, finalizar y cancelar (con confirmación y motivo).

## 6. Aplicación del cliente

- Lista de eventos con precio o etiqueta de gratuito, participantes actuales/mínimo/máximo, barra de progreso y estado, actualizada en vivo.
- Ficha del evento: datos, premio, cuenta atrás, inscripción con identificador del personaje, aviso claro de que no se cobra al inscribirse, cancelar inscripción antes de la activación, "Cupos agotados" al llegar al máximo y botón "Entrar al evento" solo durante la ventana de acceso.
- La sala nunca aparece antes de la activación ni para quien no participa.
- Nueva sección de resultados: eventos finalizados con ganador, premio, juego, tipo, fecha y hora.

## 7. Dinero, avisos, auditoría y tiempo real

- Los cobros de inscripción, las devoluciones y los premios usan tipos de operación propios, separados de recargas, fondos, retiros y comercio de cuentas.
- Cada aviso queda registrado con evento, usuario, tipo, fecha/hora, estado y clave única.
- Se audita creación, modificación, inscripción, cancelación de inscripción, meta alcanzada, activación, cobro, acceso, cierre, finalización, ganador, premio, publicación del resultado, cancelación y devoluciones, con administrador o usuario, estado anterior y nuevo, fecha/hora y operación relacionada.
- Eventos e inscripciones se sincronizan en vivo en cliente y administración, sin recargar.

## 8. Pruebas de extremo a extremo

Se ejecutan las 17 pruebas del pedido con un evento gratuito y uno de pago creados temporalmente (crear, inscribir, no cobrar antes de la meta, alcanzar meta y cobrar, llenar cupos, sala oculta y visible, accesos denegados, ganador válido e inválido, entrega única, reintento sin duplicar, publicación del resultado, cancelación con devoluciones e idempotencia). Al terminar se eliminan los datos de prueba y se revierten los saldos usados.

## 9. Nota técnica

Estados añadidos al enum `event_status`; columnas nuevas en `events` y `event_subscriptions`; tabla `event_prize_deliveries`; funciones `SECURITY DEFINER` (`admin_create_event`, `admin_update_event`, `activate_event`, `close_event_entry`, `finish_event`, `find_event_participant`, `register_event_winner`, `deliver_event_prize`, `cancel_event`, `cancel_event_subscription`, `process_event_schedule`) con permisos por rol y `GRANT` explícitos; `subscribe_event` y `enter_event_room` se endurecen manteniendo su firma; movimientos con tipos `event_entry`, `event_refund`, `event_prize`; realtime en `events` y `event_subscriptions`; tarea programada cada 5 minutos vía la ruta pública de cron ya usada por el comercio de cuentas.
