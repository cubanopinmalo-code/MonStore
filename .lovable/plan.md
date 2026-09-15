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
- guardar y modificar libremente identificador y contraseña de sala en cualquier momento antes de la hora exacta de inicio (cada cambio queda auditado y se usa siempre la última versión guardada); al activarse el evento los datos quedan bloqueados;
- cerrar entrada, marcar en curso y finalizar;
- buscar participante por identificador de personaje (devuelve nombre, usuario, personaje, juego, evento y premio para confirmar) y registrar ganador solo si ese personaje pertenece a un participante del evento;
- entregar premio de forma idempotente, con reintento seguro que primero verifica que no se entregó;
- publicar el resultado automáticamente al confirmarse la entrega;
- cancelar evento: si no hubo cobros no devuelve nada; si hubo cobros devuelve a cada afectado su importe exacto una sola vez, con movimiento propio y aviso.

Cliente:
- inscribirse indicando el identificador del personaje: sin cobro, sin descuento y sin retención; se rechaza si el evento está lleno, cerrado o si ya está inscrito;
- cancelar su inscripción mientras el evento no se haya activado;
- entrar al evento: el servidor comprueba sesión, inscripción confirmada, cobro correcto, evento activo y ventana abierta antes de devolver la sala, y guarda la hora de entrada.

## 4. Cuándo se activa y cuándo se cobra (regla definitiva)

Alcanzar la meta mínima NO activa el evento y NO cobra nada. Solo significa que hay suficientes inscripciones preliminares: se marca meta alcanzada, se avisa al administrador y a los inscritos ("Meta alcanzada. El evento se mantiene pendiente de activación."), se muestra visualmente en la app, no se abre la sala ni se muestran sus datos, y las inscripciones siguen abiertas hasta la hora de inicio o hasta llenarse el máximo.

30 minutos antes: aviso a los inscritos "El evento comienza en 30 minutos."

15 minutos antes empieza la ventana de preparación, que nunca cancela nada:
- alerta prioritaria al administrador: "El evento comienza en 15 minutos. Configura la sala.", visible en el panel principal, en la lista de eventos y en la ficha, con nombre, juego, hora de inicio, inscritos, mínimo, máximo y estado de la sala;
- cuenta regresiva hasta 00:00 y botón de editar sala siempre disponible;
- si faltan datos se muestra "Faltan datos de la sala" como aviso, sin cancelar;
- cuando el administrador guarda ambos datos se le confirma: "La sala está configurada correctamente."

La activación real y el cobro ocurren únicamente al llegar la fecha y hora exactas configuradas. En ese instante, en una sola operación atómica e idempotente, se cierran las inscripciones, se bloquea la edición de la sala y se evalúan los últimos datos guardados:

1. Inscritos por debajo de la meta mínima → cancelación automática, sin cobros ni devoluciones. Aviso al administrador y a los inscritos: "El evento fue cancelado porque no se alcanzó la cantidad mínima de participantes."
2. Meta cumplida pero falta el identificador o la contraseña de sala → cancelación automática, sin cobros: "El evento fue cancelado porque los datos de acceso a la sala no fueron configurados antes de la hora de inicio." Esta es la única condición de sala que cancela un evento.
3. Meta cumplida y sala completa → en eventos de pago se cobra el precio de ese evento a cada inscrito: con saldo suficiente queda confirmado y con su movimiento registrado; sin saldo queda no confirmado, con el motivo guardado y sin acceso a la sala, nunca con un cobro parcial. Los eventos gratuitos no generan movimientos.
4. Si tras los cobros los confirmados quedan por debajo de la meta mínima → el evento se cancela, no se abre la sala y se devuelve el importe exacto, una sola vez, a quienes ya habían pagado, con movimiento propio y aviso.
5. Si los confirmados alcanzan la meta → el evento pasa a activo con la entrada abierta durante exactamente 15 minutos desde la activación; la sala solo se entrega a participantes confirmados y la entrada se cierra sola al agotarse la ventana.

Ejemplo con inicio a las 8:00 PM: 7:30 PM recordatorio a los inscritos; 7:45 PM alerta al administrador y apertura de la ventana de preparación; 7:45–8:00 PM el administrador puede poner y corregir el identificador y la contraseña cuantas veces necesite; 8:00 PM evaluación final con los últimos datos guardados, cobro, activación y entrega de sala; 8:00–8:15 PM ventana de acceso.

## 5. Proceso automático programado

Una tarea del servidor cada minuto, con la hora del servidor (zona America/Havana) como única fuente de verdad e independiente de que alguien abra la aplicación o el panel:
- abre inscripciones de los eventos programados que llegan a su fecha;
- marca meta alcanzada y avisa cuando se cruza el mínimo;
- envía el recordatorio de 30 minutos;
- a los 15 minutos genera la alerta administrativa y abre la ventana de preparación, sin cancelar nada;
- a la hora exacta ejecuta la evaluación final con sus cinco casos;
- avisa 5 minutos antes del cierre de entrada y al cerrarla;
- marca en curso y finalizado.

Todo con claves anti-duplicado para que no haya doble activación, doble cancelación, doble cobro, doble devolución ni doble aviso, aunque la tarea se repita, pierda conexión o se reinicie.

## 6. Panel de administración

Lista con filtros por estado y buscador, y ficha de evento con:
- información: juego, región, tipo, fecha, hora, precio, premio, descripción, estado;
- resumen: participantes actuales, confirmados, mínimo, máximo, porcentaje, estado de la meta, sala configurada o no, hora de inicio, hora de cierre de entrada, cuenta regresiva hasta la hora exacta, ingresos por inscripción, premio y cuántos entraron;
- alertas visibles: "Meta alcanzada", "El evento comienza en 15 minutos. Configura la sala.", "Faltan datos de la sala" y "Faltan 14:59…" hasta 00:00;
- participantes en tiempo real ordenados por fecha de inscripción: nombre, identificador, teléfono, personaje, fecha/hora, estado, estado del cobro, hora de entrada y participación;
- sala: identificador y contraseña, editables cuantas veces se quiera hasta la hora exacta de inicio y bloqueados a partir de la activación;
- resultado: registrar ganador por identificador de personaje con pantalla de confirmación, entregar premio, ver estado de entrega y reintentar si falló;
- acciones: crear, editar, cerrar entrada, finalizar y cancelar (con confirmación y motivo).

## 7. Aplicación del cliente

- Lista de eventos con precio o etiqueta de gratuito, participantes actuales/mínimo/máximo, barra de progreso y estado (incluida la marca de meta alcanzada), actualizada en vivo.
- Ficha del evento: datos, premio, cuenta atrás hasta la hora exacta de inicio, inscripción con identificador del personaje, aviso claro de que solo se cobra al activarse el evento en su hora exacta, cancelar inscripción antes de la activación, "Cupos agotados" al llegar al máximo y botón "Entrar al evento" solo durante la ventana de acceso.
- La sala nunca aparece antes de la activación ni para quien no participa o no quedó confirmado.
- Nueva sección de resultados: eventos finalizados con ganador, premio, juego, tipo, fecha y hora.

## 8. Dinero, avisos, auditoría y tiempo real

- Los cobros de inscripción, las devoluciones y los premios usan tipos de operación propios, separados de recargas, fondos, retiros y comercio de cuentas.
- Avisos, todos con clave única: meta alcanzada (administrador e inscritos), recordatorio de 30 minutos, alerta administrativa de 15 minutos, sala configurada correctamente, evento activo con sala disponible, cancelación por falta de meta, cancelación por sala no configurada a tiempo, cancelación por confirmados insuficientes con su devolución, 5 minutos antes del cierre de entrada y cierre de la entrada. Cada uno queda registrado con evento, usuario, tipo, fecha/hora y estado.
- Se audita creación, modificación, inscripción, cancelación de inscripción, meta alcanzada y su aviso, recordatorio de 30 minutos, alerta de 15 minutos, cada apertura y guardado de los datos de sala por el administrador (con administrador, fecha/hora, valor anterior y nuevo del identificador y de la contraseña, siempre protegidos y nunca visibles para clientes), evaluación final, activación, cancelaciones con su motivo, cobros, confirmaciones, apertura y cierre de entrada, acceso, finalización, ganador, premio, publicación del resultado y devoluciones, con administrador o usuario, estado anterior y nuevo, fecha/hora y operación relacionada.
- Eventos e inscripciones se sincronizan en vivo en cliente y administración, sin recargar.

## 9. Pruebas de extremo a extremo

Se ejecutan las pruebas del pedido con un evento gratuito y uno de pago creados temporalmente:
- meta alcanzada temprano: sin cobro, sin sala visible y sin activación;
- recordatorio de 30 minutos y alerta administrativa de 15 minutos;
- a los 15 minutos con la sala vacía: el evento NO se cancela;
- cambios de identificador y contraseña a 10, 5 y 1 minuto del inicio: permitidos, se usa el último guardado;
- hora exacta con meta y sala: cobro, activación y sala disponible solo para confirmados;
- hora exacta sin identificador, sin contraseña o sin meta: cancelación sin cobros;
- participantes sin saldo: cobros válidos, los demás sin acceso, y si los confirmados quedan por debajo de la meta, cancelación con devolución exacta;
- intentar modificar la sala con el evento ya activo: bloqueado;
- repetir la tarea programada: sin duplicar cobros, avisos, activaciones, cancelaciones ni devoluciones.

Al terminar se eliminan los datos de prueba y se revierten los saldos usados.

## 10. Nota técnica

Estados añadidos al enum `event_status`; columnas nuevas en `events` (momento exacto de inicio calculado en zona America/Havana, apertura/cierre de entrada, gratuito/pago, estado del premio, ingreso cobrado, marcas de meta, alerta de 15 minutos, activación y cancelación con motivo, y marcas de última edición de sala) y en `event_subscriptions` (cobro, movimiento asociado, motivo de fallo, cancelación, unicidad usuario+evento); tabla `event_prize_deliveries`; funciones `SECURITY DEFINER` (`admin_create_event`, `admin_update_event`, `admin_set_event_room`, `evaluate_event_activation`, `close_event_entry`, `finish_event`, `find_event_participant`, `register_event_winner`, `deliver_event_prize`, `cancel_event`, `cancel_event_subscription`, `process_event_schedule`) con `GRANT` explícitos por rol; `subscribe_event` y `enter_event_room` se endurecen manteniendo su firma; movimientos con tipos `event_entry`, `event_refund`, `event_prize`; realtime en `events` y `event_subscriptions`; tarea programada cada minuto vía la ruta pública de cron ya usada por el comercio de cuentas.

Nota sobre la frecuencia: la comprobación corre cada minuto (1440 veces al día) porque la activación y el cobro deben caer en el minuto exacto de inicio; comprobar tan seguido mantiene la base de datos activa aunque no haya eventos y puede aumentar algo el costo. La alternativa más económica sería revisar cada 5 minutos, con hasta 5 minutos de desfase en la activación.
