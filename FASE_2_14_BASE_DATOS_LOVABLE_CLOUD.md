# FASE 2.14 — Auditoría y preparación de la base de datos de MonStore en Lovable Cloud

Fecha: 14/09/2026. Backend único: Lovable Cloud. No se migró ningún dato histórico, no se importaron
las 6.193 ofertas antiguas, no se crearon usuarios ni wallets, no se conectó G2Bulk ni zdSMS, no se
usó el proyecto externo ni el backend antiguo, no se ejecutó ningún cobro, retiro ni cálculo de
precios, y no se tocó GitHub.

---

## 1. Inventario inicial

29 tablas, 22 funciones de servidor, protección por filas activa en todas las tablas, 4 almacenes
privados (`avatars`, `catalog`, `deposit-proofs`, `listings`) y 15 reglas de acceso a archivos.
Contenido: 0 usuarios, 0 wallets, 0 ofertas, 0 pedidos, 0 eventos. Los importes ya usaban tipo
decimal exacto (14 enteros, 2 decimales), nunca coma flotante; solo el importe de publicación de
cuentas estaba sin precisión fijada.

## 2. Modelo final y 3. Comparación por dominios

| Dominio | Estado inicial | Acción de esta fase |
| --- | --- | --- |
| A. Acceso, perfiles, teléfonos, roles, códigos | existe y es suficiente | ninguna |
| B. Wallet (saldo, retenido, movimientos, auditoría) | existe, faltaba idempotencia real | ampliado |
| C. Fondos (solicitudes, métodos, destinos, comprobantes, líneas, estados) | existe y es suficiente | ninguna |
| D. Retiros (importe, comisión, neto, retención, métodos, línea) | existía sin línea ni retención | ampliado |
| E. Catálogo (técnico del proveedor vs. comercial de MonStore) | faltaba la capa comercial | ampliado |
| F. Pedidos (estados, pagos, reembolsos, idempotencia) | faltaba historial de estados | creado |
| G. Eventos (inscripción, meta, sala, ventana, ganador, premio) | faltaba ganador/premio/resultado | ampliado |
| H. Comercio de cuentas (publicación, credenciales cifradas, aprobación) | existe y es suficiente | ninguna |
| I. Configuración (parámetros, valores económicos, reglas) | faltaba comisión de retiro global | ampliado |
| J. Notificaciones (individuales, masivas, anti-duplicado) | faltaban campañas y anti-duplicado | creado |
| K. Referidos (relaciones, premios, estado) | existe y es suficiente | ninguna |
| L. Auditoría (actor, recurso, antes/después, nota) | faltaban importe, línea, evento, afectado | ampliado |
| Sistema de precios administrable | no existía | creado |
| Tiempo real | no existía | habilitado |

## 4. Tablas existentes (reutilizadas, sin duplicar)

Perfiles, roles, wallets y movimientos, depósitos, retiros, líneas de pago y sus eventos, ajustes de
plataforma, ajustes y destinos de pago, juegos, ofertas, pedidos, transacciones del proveedor,
eventos e inscripciones, comercio de cuentas y sus credenciales cifradas, notificaciones, referidos,
favoritos, preferencia de moneda, auditoría y las tres tablas del sistema de códigos.

## 5. Tablas creadas (4)

- **Reglas de precio**: alcance por oferta, juego, categoría, región, modalidad, rango de coste o
  global, con prioridad, margen porcentual y fijo, redondeo, precio mínimo y máximo, vigencia y nota.
- **Historial de precios**: lote, oferta, regla aplicada, coste, precio anterior y nuevo, origen,
  reversión, responsable y nota — permite previsualizar, aplicar y revertir por lotes.
- **Historial de estados de pedido**: estado anterior y nuevo, responsable y nota; se rellena
  automáticamente al crear un pedido y en cada cambio de estado.
- **Campañas de notificación**: título, mensaje, público, estado, destinatarios y entregados.

## 6. Columnas añadidas

- **Ofertas**: región, proveedor, descuento, precio y fechas de promoción, destacado, orden, origen
  del precio, regla aplicada y última actualización de precio.
- **Retiros**: línea asignada, número de línea, liberación de línea, importe retenido, fecha de
  procesado e identificador de la operación.
- **Líneas de pago**: moneda, límite pendiente y notas.
- **Eventos**: ganador, inscripción ganadora, nota del resultado, entrega del premio y publicación.
- **Ajustes de plataforma**: comisión de retiro global, con valor inicial 15% y administrable.
- **Notificaciones**: campaña y clave anti-duplicado.
- **Movimientos de wallet**: clave de idempotencia.
- **Auditoría**: usuario afectado, importe, línea, evento y datos adicionales.
- **Comercio**: el importe de publicación pasa a decimal exacto como el resto del dinero.

## 7. Funciones existentes y creadas

Las 22 funciones anteriores se conservan intactas: pedidos con saldo, reembolso, depósitos v1 y v2,
retiros, revisión administrativa de fondos, retiros y publicaciones, liberación de línea, publicación
y lectura cifrada de cuentas, inscripción y entrada a sala, referidos, moneda, recargas más vendidas,
comprobación de rol y utilidades de fecha y cifrado. Todas comprueban la sesión y el rol dentro de la
propia función.

Se creó **una sola** función nueva: el registro automático del historial de estados de pedido. No es
invocable desde el navegador (permiso de ejecución revocado); solo la ejecuta la base de datos.

## 8. Protección por filas

33 tablas con protección activa y 55 reglas de acceso. Las cuatro tablas nuevas quedan cerradas: las
reglas de precio, el historial de precios y las campañas solo son accesibles al administrador; del
historial de pedidos cada cliente ve únicamente los suyos y el administrador ve todos. Las tres
tablas del sistema de códigos siguen sin ninguna regla, es decir, accesibles solo desde el servidor.

Un cliente no puede modificar su saldo, cambiar su rol, aprobar fondos ni retiros, cambiar precios,
registrar un ganador ni ejecutar operaciones administrativas: todo eso pasa por funciones seguras.

## 9. Almacenamiento

Los cuatro almacenes siguen **privados**, con lectura mediante enlaces temporales firmados. Cada
cliente solo escribe y lee sus propios avatares, comprobantes y fotos de publicaciones; el catálogo
solo lo modifica el administrador. No se hizo público ninguno.

## 10. Tiempo real

Habilitado en 10 tablas: fondos, retiros, eventos, inscripciones, notificaciones, ajustes de
plataforma, ajustes de pago, wallets, movimientos y pedidos. Todo dentro de Lovable Cloud, sin
ninguna dependencia externa.

## 11. Seguridad y 20. Pruebas

Comprobado tras los cambios: claves foráneas y restricciones válidas; protección por filas activa en
todas las tablas; el administrador conserva sus funciones; ningún dato se creó ni se alteró (0
ofertas, 0 pedidos, 0 wallets); no hay tablas duplicadas. Los duplicados financieros quedan impedidos
por dos claves únicas nuevas: una por clave de idempotencia del movimiento y otra por
referencia+tipo, que hace imposible un segundo reembolso, un segundo abono de depósito o un segundo
premio sobre la misma operación. El revisor de seguridad no añadió ningún aviso nuevo por estos
cambios.

## 12–18. Estado por área

- **Wallet**: saldo y saldo retenido, movimientos inmutables con saldo antes y después, bloqueo de
  fila durante cada operación, saldo negativo imposible e idempotencia garantizada. Listo.
- **Fondos**: solicitudes con método, destino, comprobante, línea asignada, estados y revisión con
  motivo. Listo.
- **Retiros**: importe, comisión, neto, retención, método, destino, línea, fechas y devolución
  automática al rechazar. Comisión configurable (15% inicial). Listo.
- **Catálogo**: separación firme entre datos técnicos del proveedor y datos comerciales de MonStore;
  la futura sincronización no puede tocar precio, descuentos, promociones, destacados ni orden.
  Clasificación `via_id`, `codigo` y `via_cuenta` (esta última reservada a recargas personalizadas por
  WhatsApp, nunca al comercio de cuentas). Vacío, pendiente del proveedor.
- **Eventos**: inscripción sin cobro, meta mínima y máximo, cobro solo al entrar a la sala, ventana de
  acceso, sala y contraseña, y ahora ganador, premio, resultado y publicación. Listo.
- **Comercio**: publicación con fotos, juego, región, propietario, aprobación o rechazo con devolución
  del importe, y credenciales guardadas cifradas y legibles solo por el administrador. Listo.
- **Configuración**: base de conversión, margen, conversión de saldo, coste de publicación, reutilización
  de líneas, contacto de soporte y comisión de retiro. Listo, pendiente de cargar valores iniciales.

## 19. Riesgos

R1 — La base está vacía: sin la configuración inicial y sin catálogo no se puede operar.
R2 — El envío de códigos por SMS sigue simulado, así que los clientes reales aún no pueden entrar.
R3 — Las reglas de precio y las campañas masivas ya tienen soporte en la base, pero todavía no
existen pantallas de administración ni la aplicación transaccional de precios.
R4 — El ganador y la entrega del premio se registran, pero el flujo de cierre de evento aún no está
implementado en la aplicación.
R5 — Las líneas ya son independientes y con límite, pero las vistas individual y consolidada de cada
línea todavía no existen en el panel.

## 20. Pendientes

Cargar la configuración inicial; construir la administración de reglas de precio con previsualización
y reversión; construir campañas masivas; cerrar el flujo de resultado de evento; vistas por línea;
activar el envío real de SMS; integrar el proveedor del catálogo.

---

## VEREDICTO

🟡 **BASE DE DATOS LISTA CON PENDIENTES**

La estructura ya soporta la arquitectura definitiva completa: acceso, wallet, fondos, retiros,
catálogo con precios administrables, pedidos con historial, eventos con ganador y premio, comercio,
configuración, notificaciones masivas, referidos, auditoría enriquecida, tiempo real y almacenamiento
privado. Lo que queda no es estructura de base de datos, sino contenido inicial y pantallas.

Fase detenida. Espero autorización expresa para continuar.
