# MONSTORE — Fase 2: backend real, cuentas y dinero

Objetivo: convertir el prototipo visual actual (datos simulados) en una aplicación real con base de datos, cuentas de usuario, wallet con saldo verdadero y panel administrativo con control total. La conexión con G2Bulk se prepara de forma segura, sin exponer nunca la clave.

## 1. Base de datos y cuentas

- Activar Lovable Cloud (base de datos, cuentas y funciones de servidor incluidas).
- Registro e inicio de sesión reales con teléfono + contraseña, manteniendo la pantalla actual de inicio.
- Perfil creado automáticamente al registrarse, con su código de referido único.
- Roles separados (usuario / administrador) en una tabla propia, nunca en el perfil, para evitar que alguien se dé permisos a sí mismo.
- El botón "usuario de prueba" se retira al final de esta fase.

## 2. Tablas que se crean

profiles, roles, games, products, orders, wallets, wallet_transactions, deposits, withdrawals, payments, payment_settings, notifications, referrals, game_accounts, events, event_subscriptions, api_transactions.

Cada tabla con reglas de acceso: cada cliente ve solo lo suyo; el administrador ve todo; los datos privados de las cuentas en venta (correo, contraseña, notas) solo son visibles para el administrador.

## 3. Wallet y dinero

- Saldo real por usuario, con historial de cada movimiento.
- Depósitos: el cliente envía el comprobante, el administrador aprueba y el saldo se acredita aplicando el bono configurado por método.
- Retiros: se descuenta al solicitar, con la conversión y comisión configuradas; si el administrador rechaza, se devuelve el importe.
- Todos los cálculos y descuentos pasan a hacerse en el servidor, no en el navegador, para que nadie pueda alterarlos.
- Protección contra cobros duplicados y saldo insuficiente.

## 4. Catálogo, pedidos y G2Bulk

- Juegos y productos administrados desde el panel y guardados en la base de datos.
- Compra: se descuenta el saldo, se crea el pedido y queda en seguimiento con sus estados.
- Integración con G2Bulk desde el servidor: la clave se guarda como secreto del backend, el navegador nunca la ve ni la llama.
- Registro de cada llamada a G2Bulk para auditoría en el panel.

## 5. Comercio de cuentas

- Publicaciones guardadas con imágenes reales subidas por el vendedor.
- Datos públicos visibles para todos; correo, contraseña y notas solo para el administrador.
- Compra con saldo y entrega gestionada por el administrador.

## 6. Eventos

- Eventos creados desde el panel, con metas, cupos, sala y estados reales.
- Inscripción con ID de cuenta bloqueado y único por evento.
- Cobro únicamente al entrar a la sala activa, con ventana de 15 minutos y sin cobros repetidos.
- Enlace de compartir sigue funcionando y lleva al registro o directo al evento.

## 7. Referidos y notificaciones

- Referidos registrados de verdad al entrar por un enlace, con progreso y recompensa al llegar a la meta.
- Notificaciones reales guardadas por usuario (pedidos, depósitos, retiros, eventos).

## 8. Panel administrativo

Todas las pantallas actuales pasan a operar sobre datos reales: aprobar depósitos y retiros, gestionar pedidos, usuarios, juegos, productos, comercio, eventos, referidos y los porcentajes de conversión y comisión.

## Fuera de alcance en esta fase

Pagos automáticos con pasarela externa, app móvil nativa y validación automática de ID por G2Bulk si su API no lo permite (quedaría manual).

## Nota técnica

Base de datos y funciones de servidor en Lovable Cloud; toda lógica sensible (saldo, pedidos, G2Bulk) en funciones de servidor con la clave en secretos; reglas de acceso por fila en todas las tablas.
