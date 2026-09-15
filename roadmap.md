# MONSTORE — hoja de ruta

## Fase 2 (en curso)

- [x] Autenticación con teléfono y contraseña, rutas protegidas, rol de administrador
- [x] Perfil, saldo, movimientos, notificaciones y referidos con datos reales
- [x] Sincronización del catálogo del proveedor (juegos y ofertas) sin exponer claves
- [x] Panel: juegos, ofertas, proveedor — datos reales, precios de venta en CUP
- [x] Catálogo público real: /juegos, /juegos/:slug, /recargas y /app/recargas
- [x] Compra con saldo: descuento atómico, pedidos duplicados imposibles, reembolsos solo del administrador
- [x] Agregar fondos: métodos de pago (saldo móvil, tarjeta CUP, USDT, Zelle) con datos de transferencia que escribe el administrador y aprobación del administrador
- [x] Asignación automática de líneas de recepción (3 números), bloqueo mientras hay pago en revisión, liberación al aprobar/rechazar o a mano, con historial
- [ ] Retiros con comisión y conversión por método, con aprobación del administrador
- [ ] Pantalla de compra conectada a la compra real (formulario de 4 pasos + saldo real)
- [ ] Mis pedidos y detalle de pedido con datos reales
- [ ] Panel: pedidos (ver, completar, reembolsar)
- [ ] Comercio (cuentas) con datos reales
- [x] Eventos con datos reales
- [ ] Conectar la clave del proveedor cuando el administrador la entregue

## Pendiente de decisiones

- Tasa de cambio USD → CUP para el margen (hoy el costo del proveedor se guarda en USD y la venta en CUP)

## Aspecto 2 — Métodos de pago y confirmación (hecho)
- Flujo por pasos: método → Transfermóvil/EnZona/iPhone → banco (BANDEC, BPA, Metropolitano/Mi Transfer) → importe y datos → confirmación.
- Destinos de pago configurables desde el panel (nada escrito en la aplicación).
- EnZona pide ID de transacción; iPhone exige captura (guardada de forma privada).
- La solicitud guarda canal, banco, destino, ID de transacción, número de origen, comprobante y estado del flujo.
- WhatsApp de atención configurable y botón en las notificaciones rechazadas.
- Pendiente: conciliación automática por SMS (estructura ya preparada).

## Convergencia al Supabase canónico (nklgztbukgaoycuaryzk)

- [x] Auditoría de la base actual y plan de convergencia (.lovable/plan.md)
- [x] Diagnóstico de solo lectura del catálogo (juegos, ofertas, duplicados, precios, G2Bulk)
- [ ] Configuración comercial de precios editable desde el panel (costo base + ganancia por USD)
- [ ] Proteger la sincronización de G2Bulk: solo columnas técnicas
- [ ] Snapshot de precio congelado en cada pedido
- [ ] Dry run de solo lectura contra el canónico — BLOQUEADO: falta acceso al proyecto nklgztbukgaoycuaryzk
- [ ] Datos reales de pago (líneas y destinos) — pendiente del usuario, no se migran los de ejemplo
- [ ] Migración real y cambio de conexión — solo tras aprobación explícita del dry run
- [x] Fase 2A: preparación técnica de solo lectura (modelo de fondos, precios, snapshot, auth, storage, catálogo, seguridad, rollback)
- [ ] Fase 2: ejecución — pendiente de aprobación explícita del usuario
- [x] Validación final read-only previa a Fase 2 (destino, pagos, seguridad, orden, rollback)
- [x] Auditoría de viabilidad de fusión en una sola web app (Customer App como app definitiva)
- [ ] Fase 1 — Preparación del backend definitivo (validar esquema, estructuras aditivas, buckets, seguridad) — BLOQUEADO: sin acceso de escritura ni lectura al proyecto nklgztbukgaoycuaryzk desde este proyecto
- [ ] Decisión pendiente: formato del correo interno (@telefono.monstore.cu vs @monstore.local)
- [x] Decisión aprobada: identidad canónica <telefono>@telefono.monstore.cu, sin prefijo 53
- [ ] Ajuste de WhatsApp de soporte en el backend definitivo — pendiente de acceso
- [ ] Cuatro depósitos privados (avatars, catalog, deposit-proofs, listings) en el backend definitivo — pendiente de acceso

## Fase 2.5 — Acceso sin contraseña por código SMS (zdSMS)

- [x] Análisis y diseño del acceso por teléfono + código SMS (FASE_2_5_AUTH_OTP_MONSTORE.md)
- [x] Confirmar endpoints reales de zdSMS (solo envío; no existe verificación nativa)
- [x] Diseñar validación del código en el servidor (sin guardar el código en claro)
- [x] Definir cómo convertir un código válido en sesión de la app (enlace de un solo uso) — pendiente de verificar en el destino
- [x] Clasificar los componentes actuales de contraseña (mantener/adaptar/reemplazar/retirar)
- [x] Recuperación de acceso ante pérdida del teléfono (cambio de número por soporte)
- [x] Cutover, rollback y checklist de preproducción (FASE_2_5_CUTOVER_AUTH.md)
- [ ] Verificar el mecanismo de sesión con una cuenta de prueba en el backend definitivo — BLOQUEADO: sin acceso
- [ ] Aprobación de los límites de uso y del tope global diario de SMS — pendiente del usuario
- [ ] Número de WhatsApp de soporte — pendiente del usuario


## Fase 2.6 — Prueba de acceso por SMS (hecha)
- [x] Prueba técnica completa: código por SMS -> sesión real de Supabase (APROBADA, ver FASE_2_6_AUTH_OTP_TEST.md)
- [ ] Fase 2.7: credenciales reales de zdSMS, tope diario de SMS y prueba con envío real (pendiente de tu decisión)
- [ ] Eliminar al cerrar: tabla temporal otp_test_challenges, usuario de prueba 55550001 y la ruta /prueba-otp

## Fase 2.6.1 — Preparación de producción para zdSMS (hecha)
- [x] Límites del código movidos a configuración del servidor (otp_limits), 5 por número/24 h, 60 s, 6 dígitos, 5 min, 5 intentos, 10 por origen/hora
- [x] Cliente del proveedor con credenciales de entorno (ZDSMS_EMAIL / ZDSMS_PASSWORD), token, envío y estado
- [x] Manejo de errores sin detalles técnicos (src/lib/otp-messages.ts)
- [x] Registro de consumo de SMS sin guardar el código (otp_sms_log)
- [x] Comprobación de conectividad: zdsms.cu resuelve pero no responde desde este entorno (FASE_2_6_1_ZDSMS_PREPARACION.md)
- [ ] Tope diario de SMS — pendiente de tu decisión
- [ ] Credenciales reales de zdSMS — pendientes, no solicitadas todavía

## Fase 2.6.4 — Preparación controlada del canónico

- [x] Comprobar que el proyecto canónico responde (sí; falta credencial, no conectividad)
- [x] Mapa de compatibilidad completo (tablas, funciones, reglas, archivos) — FASE_2_6_4_PREPARACION_CANONICO.md
- [x] Plan de catálogo, usuarios, dinero, pedidos, proveedor, archivos y variables
- [x] Procedimiento del día del cambio, vuelta atrás y pruebas obligatorias
- [ ] BLOQUEADO: sin claves del proyecto canónico (pública y de servidor)
- [x] Fase 2.6.5 — Documentación de credenciales necesarias para el canónico (FASE_2_6_5_CREDENCIALES_CANONICO.md)
- [x] Límites OTP aprobados definitivamente: 5/teléfono/24h, 60s, 6 dígitos, 5 min, 5 intentos, único, 10/IP/hora
- [ ] Pendiente: usuario configura credenciales del canónico + zdSMS + OTP_PEPPER
- [ ] Pendiente: tope diario de SMS del proyecto (daily_sms_cap)

## Panel administrativo (fase actual)
- [x] Navegación agrupada: Dashboard, Finanzas, Fondos, Solicitudes de cuentas, Eventos, Configuración, Operación
- [x] Dashboard con indicadores reales, centro de alertas accionables y actividad reciente
- [x] Actualización en tiempo real (fondos, retiros, cuentas, eventos, pedidos, saldos, auditoría)
- [x] Finanzas: ganancias por período, USD vendidos, cobros por método, líneas 1/2/3 separadas
- [x] Fondos: centro de operaciones completo (detalle, aprobar/rechazar con motivo, retiro completado, retenciones, líneas 1/2/3, historial con filtros, auditoría, realtime)
- [ ] Siguiente: Solicitudes de cuentas (fotos/WhatsApp), Eventos (sala, ganador, premio) y Configuración de valores dinámicos


- [x] Eventos: activacion/cobro solo 15 min antes de la hora; cancelacion automatica si falta meta o sala; recordatorios 30/5 min idempotentes.
- [x] Eventos (ajuste): activacion y cobro en la hora exacta; 15 min antes solo alerta admin + ventana de preparacion de sala con cuenta regresiva; zona America/Havana.
- [x] Eventos (ajuste 2): sala editable hasta la hora exacta, sin cancelar en los 15 min; auditar cada cambio de sala; bloqueo al activarse.
- [x] Eventos: proceso programado solo para el sistema; clientes no pueden invocarlo; idempotencia ante reintentos.
- [x] Eventos: 5 estados operativos (inscripciones/activo/iniciado/finalizado/cancelado) con validacion server-side.
- [x] Eventos: SMS via relay al pasar a INICIADO, idempotente y registrado; bloqueo de inscripciones/accesos.
- [x] Eventos: ganador validado con nombre/foto/personaje, recompensa, resultado publico, ranking semanal e historial.
- [x] Eventos: auditoria de sala sin valores (solo que se modifico ID/contrasena); SMS de inicio solo a inscritos confirmados.
- [x] Eventos: activacion solo automatica en la hora exacta; admin solo activo->iniciado->finalizado y cancelar.

## Auditorias de validacion (fase actual)
- [ ] Auditoria de validacion de Configuracion (comision unica, nuevos parametros, integracion cliente, seguridad, historico) — solo informe
- [ ] Diagnostico de Metodo de pago -> Saldo movil: 3 lineas, almacenamiento, asignacion, numeros editables, hardcodes — solo informe
- [ ] Lineas de saldo movil: ciclo de vida ocupada/libre; liberacion automatica y atomica al pasar la solicitud a estado terminal (aprobado, rechazado, cancelado, expirado)
