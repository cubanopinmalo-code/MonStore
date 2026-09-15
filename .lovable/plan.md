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

El proceso está protegido: la dirección que ejecuta activaciones, cobros, cancelaciones, devoluciones y avisos exige la credencial propia del proceso programado (la misma protección que ya usa el comercio de cuentas) y las operaciones internas de dinero solo son ejecutables por el propio proceso. Ningún cliente ni usuario autenticado puede lanzarla a mano: sin la credencial la llamada se rechaza sin procesar nada.

## 6. Estados operativos (fuente de verdad en el servidor)

Cinco estados visibles, cada uno con su propio color y etiqueta, iguales en tarjetas, listas, fichas, avisos, cliente y administración. El servidor decide siempre qué se permite; la pantalla solo refleja el estado.

1. Inscripciones activas — se puede inscribir con identificador de personaje y cancelar la inscripción; se ven precio o "Gratis", meta mínima, máximo y progreso; no se cobra nada y la sala no existe para el cliente.
2. Evento activo — solo al llegar la hora exacta y superar la evaluación final: se cobra, se confirma a quien pagó, se abre el acceso y la sala se muestra únicamente a participantes confirmados. Desde aquí los datos de sala quedan bloqueados y se usa la última versión guardada.
3. Evento iniciado — el administrador lo marca cuando la partida ya empezó, y solo es posible desde evento activo. Al pasar: se cierran inscripciones, compras y nuevos accesos; quienes ya estaban confirmados y dentro siguen participando; se guardan fecha, hora y administrador responsable. El servidor rechaza cualquier intento posterior de inscribirse, pagar o entrar con el mensaje "El evento ya comenzó y el acceso está cerrado.", aunque se llame la operación a mano.
4. Evento finalizado — solo desde evento iniciado y solo con ganador y recompensa registrados.
5. Evento cancelado — muestra siempre el motivo.

Cambios manuales permitidos: inscripciones activas → evento activo (únicamente si se cumplen las condiciones reales de activación), evento activo → evento iniciado, evento iniciado → evento finalizado, y cancelar desde inscripciones activas o evento activo. El servidor rechaza finalizar sin haber iniciado, iniciar sin haber estado activo, activar sin condiciones y editar la sala una vez bloqueada. Toda acción manual queda auditada con administrador, fecha/hora, estado anterior y nuevo.

## 7. Ganador, recompensa y resultados públicos

Al finalizar, el administrador escribe el identificador del personaje ganador y el sistema lo busca entre los participantes del evento. Antes de confirmar muestra nombre del usuario, foto de perfil, identificador interno, identificador y nombre del personaje, juego, evento y recompensa; si el identificador no pertenece a un participante válido, no se puede continuar. La recompensa se escribe explícitamente (tipo, descripción, valor cuando aplique) y queda asociada al evento y al ganador con fecha/hora y administrador responsable. Si la entrega usa una operación real de dinero, se ejecuta una sola vez, con su movimiento y estado; escribir el texto nunca marca por sí solo el premio como entregado.

Publicación del resultado: nombre del ganador, foto, nombre del personaje, juego, tipo de evento, recompensa, fecha y hora. Nunca se publican teléfono, identificadores internos, credenciales ni datos financieros. El nombre del personaje se guarda junto al identificador de la inscripción para no depender solo del número.

"Ganadores de la semana" es una vista filtrada del mismo historial (nunca una segunda copia), ordenada de más reciente a más antiguo y actualizada en vivo al publicarse un resultado. El historial permanente conserva ganador, juego, evento, premio, fecha, participante y estado de entrega para consulta administrativa. Un evento finalizado desaparece de "Eventos actuales" pero nunca se borra: sigue en historial, resultados, estadísticas, auditoría y panel.

## 8. Panel de administración

Lista con filtros por estado y buscador, y ficha de evento con:
- información: juego, región, tipo, fecha, hora, precio, premio, descripción, estado;
- resumen: participantes actuales, confirmados, mínimo, máximo, porcentaje, estado de la meta, sala configurada o no, hora de inicio, hora de cierre de entrada, cuenta regresiva hasta la hora exacta, ingresos por inscripción, premio y cuántos entraron;
- alertas visibles: "Meta alcanzada", "El evento comienza en 15 minutos. Configura la sala.", "Faltan datos de la sala" y "Faltan 14:59…" hasta 00:00;
- participantes en tiempo real ordenados por fecha de inscripción: nombre, identificador, teléfono, personaje, fecha/hora, estado, estado del cobro, hora de entrada y participación;
- sala: identificador y contraseña, editables cuantas veces se quiera hasta la hora exacta de inicio y bloqueados a partir de la activación;
- resultado: buscar y confirmar ganador por identificador de personaje, escribir la recompensa, finalizar, ver estado de entrega y reintentar si falló;
- acciones: crear, editar, marcar evento iniciado, finalizar y cancelar (con confirmación y motivo).

## 9. Aplicación del cliente

- Lista de eventos con precio o etiqueta de gratuito, participantes actuales/mínimo/máximo, barra de progreso y el estado operativo con su color, actualizada en vivo; los finalizados salen de "Eventos actuales".
- Ficha del evento: datos, premio, cuenta atrás hasta la hora exacta de inicio, inscripción con identificador del personaje, aviso claro de que solo se cobra al activarse el evento en su hora exacta, cancelar inscripción antes de la activación, "Cupos agotados" al llegar al máximo y botón "Entrar al evento" solo durante la ventana de acceso; con el evento iniciado se muestra "Evento iniciado — acceso cerrado" y con el cancelado, el motivo.
- La sala nunca aparece antes de la activación ni para quien no participa o no quedó confirmado.
- Sección de resultados: eventos finalizados con ganador, foto, personaje, premio, juego, tipo, fecha y hora, más el apartado público "Ganadores de la semana".

## 10. Dinero, avisos, mensajes de texto, auditoría y tiempo real

- Los cobros de inscripción, las devoluciones y los premios usan tipos de operación propios, separados de recargas, fondos, retiros y comercio de cuentas.
- Avisos en la aplicación, todos con clave única: meta alcanzada (administrador e inscritos), recordatorio de 30 minutos, alerta administrativa de 15 minutos, sala configurada correctamente, evento activo con sala disponible, evento iniciado, evento finalizado con resultado disponible, cancelación por falta de meta, cancelación por sala no configurada a tiempo, cancelación por confirmados insuficientes con su devolución, 5 minutos antes del cierre de entrada y cierre de la entrada. Cada uno queda registrado con evento, usuario, tipo, fecha/hora y estado.
- Mensaje de texto al pasar a evento iniciado: se envía a los inscritos que cumplen las condiciones de participación, con el texto "El evento [NOMBRE] ya comenzó. Entra a MonStore para consultar tu evento." Se usa exactamente la vía actual de MonStore (Lovable Cloud → relay propio → proveedor de SMS), sin tocar el relay ni sus credenciales y sin enviar nunca desde el navegador. Cada envío se registra con evento, usuario, teléfono, tipo, fecha/hora, estado, identificador de envío y clave anti-duplicado, de modo que repetir el cambio de estado no reenvía nada.
- Se audita creación, modificación, inscripción, cancelación de inscripción, meta alcanzada y su aviso, recordatorio de 30 minutos, alerta de 15 minutos, cada apertura y guardado de los datos de sala por el administrador (con administrador, fecha/hora, valor anterior y nuevo del identificador y de la contraseña, siempre protegidos y nunca visibles para clientes), evaluación final, activación, cada cambio manual de estado con administrador y estados anterior y nuevo, cancelaciones con su motivo, cobros, confirmaciones, apertura y cierre de entrada, acceso, mensajes de texto enviados, finalización, ganador, recompensa, publicación del resultado y devoluciones.
- Eventos, inscripciones y resultados se sincronizan en vivo en cliente y administración, sin recargar.

## 11. Pruebas de extremo a extremo

Se ejecutan las pruebas del pedido con un evento gratuito y uno de pago creados temporalmente:
- meta alcanzada temprano: sin cobro, sin sala visible y sin activación;
- recordatorio de 30 minutos y alerta administrativa de 15 minutos;
- a los 15 minutos con la sala vacía: el evento NO se cancela;
- cambios de identificador y contraseña a 10, 5 y 1 minuto del inicio: permitidos, se usa el último guardado;
- hora exacta con meta y sala: cobro, activación y sala disponible solo para confirmados;
- hora exacta sin identificador, sin contraseña o sin meta: cancelación sin cobros;
- participantes sin saldo: cobros válidos, los demás sin acceso, y si los confirmados quedan por debajo de la meta, cancelación con devolución exacta;
- intentar modificar la sala con el evento ya activo: bloqueado;
- pasar a evento iniciado: se envía el mensaje de texto, se cierran inscripciones, compras y accesos, y el servidor rechaza los intentos manuales;
- repetir el cambio a iniciado: sin reenviar mensajes ni duplicar avisos;
- finalizar: identificador de ganador válido devuelve nombre, foto y personaje; uno inválido se rechaza; con recompensa escrita el evento finaliza, se avisa, sale de "Eventos actuales", aparece el resultado público y el ganador entra en el ranking semanal sin datos privados, y el historial lo conserva;
- repetir la tarea programada: sin duplicar cobros, avisos, activaciones, cancelaciones ni devoluciones.

Al terminar se eliminan los datos de prueba y se revierten los saldos usados.

## 12. Nota técnica

Estados operativos añadidos al enum `event_status` (`evento_iniciado` junto a los existentes, con los actuales mapeados a las cinco etiquetas visibles); columnas nuevas en `events` (momento exacto de inicio calculado en zona America/Havana, apertura/cierre de entrada, gratuito/pago, estado del premio, ingreso cobrado, marcas de meta, alerta de 15 minutos, activación, inicio manual con administrador, cancelación con motivo, marcas de última edición de sala, ganador con personaje y recompensa) y en `event_subscriptions` (cobro, movimiento asociado, motivo de fallo, cancelación, nombre del personaje, unicidad usuario+evento); tablas nuevas mínimas `event_prize_deliveries` y `event_sms_log` (evento, usuario, teléfono, tipo, estado, identificador de envío, clave idempotente); funciones `SECURITY DEFINER` (`admin_create_event`, `admin_update_event`, `admin_set_event_room`, `admin_set_event_status`, `evaluate_event_activation`, `close_event_entry`, `finish_event`, `find_event_participant`, `register_event_winner`, `deliver_event_prize`, `cancel_event`, `cancel_event_subscription`, `process_event_schedule`) con `GRANT` explícitos por rol; `subscribe_event` y `enter_event_room` se endurecen manteniendo su firma y rechazan a partir de `evento_iniciado`; vista pública de resultados/ranking sin datos privados; movimientos con tipos `event_entry`, `event_refund`, `event_prize`; realtime en `events`, `event_subscriptions` y resultados; los mensajes de texto se envían desde una función del servidor que reutiliza el relay actual (`src/lib/sms-relay.server.ts`), nunca desde el navegador; tarea programada cada minuto en la ruta `src/routes/api/public/hooks/*` con `authenticateCronRequest` (Bearer `LOVABLE_CRON_SECRET`) y `process_event_schedule` revocada a `anon`/`authenticated`/`PUBLIC` y concedida solo a `service_role`, igual que el comercio de cuentas.

Nota sobre la frecuencia: la comprobación corre cada minuto (1440 veces al día) porque la activación y el cobro deben caer en el minuto exacto de inicio; comprobar tan seguido mantiene la base de datos activa aunque no haya eventos y puede aumentar algo el costo. La alternativa más económica sería revisar cada 5 minutos, con hasta 5 minutos de desfase en la activación.
