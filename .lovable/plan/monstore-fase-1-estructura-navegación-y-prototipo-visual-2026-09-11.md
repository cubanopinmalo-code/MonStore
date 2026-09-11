# MONSTORE — Fase 1: estructura, navegación y prototipo visual

Prototipo visual completo de MONSTORE como Web App mobile-first, con datos simulados. Sin cuentas reales, sin base de datos, sin dinero y sin proveedor externo. Los datos de ejemplo usan los mismos nombres de campos que tendrán después, para cambiar solo la fuente y no rehacer pantallas.

## Identidad visual

- Fondo #07090D, superficies #111721, verde neón #00E28A, cian #22D3EE, todo como variables de diseño (sin colores fijos en componentes).
- Mobile-first, bordes modernos, tarjetas con profundidad sutil, neón con moderación, animaciones rápidas y buena legibilidad.
- Precios en CUP.

## Rutas

Públicas: `/`, `/juegos`, `/juegos/:slug`, `/recargas`, `/comercio`, `/login`, `/registro`.

Usuario: `/app`, `/app/recargas`, `/app/recargas/:slug`, `/app/pedidos`, `/app/pedidos/:id`, `/app/wallet`, `/app/wallet/depositar`, `/app/wallet/retirar`, `/app/comercio`, `/app/comercio/publicar`, `/app/comercio/mis-publicaciones`, `/app/referidos`, `/app/notificaciones`, `/app/perfil`.

Admin: `/admin` y sus secciones pedidos, usuarios, juegos, productos, g2bulk, pagos, wallets, depositos, retiros, comercio, referidos, configuracion.

En esta fase todas son navegables sin iniciar sesión, pero agrupadas para poder proteger `/app/*` y `/admin/*` en fases siguientes.

## Layouts

- AppShell público: cabecera con logo, navegación, botones iniciar sesión y registrarse, pie de página.
- UserShell: barra inferior en móvil (Inicio, Recargas, Comercio, Wallet, Perfil) y navegación superior/lateral en escritorio.
- AdminShell: menú lateral, cabecera, indicadores y migas de pan.

## Pantallas públicas

- Inicio: presentación, juegos destacados, categorías, cómo funciona, beneficios y llamadas a registrarse, recargas y comercio.
- Juegos: imagen, nombre, descripción corta, estado y número de ofertas.
- Detalle de juego: ofertas con precio, método de entrega y botón comprar, diferenciando entrega `via_id` y `via_cuenta`.
- Recargas: catálogo con buscador y filtros por juego, método de entrega y disponibilidad.

## Flujo de compra (visual)

Producto → datos del jugador (campos que cambian según el producto: player_id, server, region, account_data) → resumen (juego, producto, datos, precio, método de pago, total) → confirmación con estados simulados: pendiente, procesando, completado, error, reembolsado.

## Área de usuario

- Wallet: saldo en CUP, movimientos, depositar (saldo móvil ETECSA y tarjeta CUP) y retirar con cantidad, comisión, neto, método y destino.
- Pedidos: lista con ID, juego, producto, precio, fecha y estado; detalle con datos usados, método de pago, fechas y espacio para el identificador de transacción del proveedor.
- Comercio: anuncios simulados, publicar cuenta y mis publicaciones con estados (pendiente, aprobada, rechazada, vendida, desactivada) y motivo de rechazo.
- Referidos: código, enlace, botón copiar con confirmación, invitados y recompensas simuladas.
- Notificaciones: leídas/no leídas y tipos (pedido, depósito, retiro, publicación).
- Perfil: nombre, teléfono, provincia, municipio, avatar, código de referido y ajustes básicos.

## Panel administrativo

Dashboard con ventas de hoy y del mes, pedidos por estado, depósitos, retiros, usuarios, productos activos y tarjetas de costo del proveedor, ventas y margen estimado.

Productos: juego, producto, ID interno, id del proveedor, costo, precio MONSTORE, margen, moneda, método de entrega, estado y última sincronización. Costo y precio de venta son campos separados; el cliente solo ve el precio MONSTORE. Botones (activar, ocultar, editar precio, sincronizar) visuales por ahora.

G2Bulk: tarjetas de estado de conexión, última sincronización, juegos, productos, nuevos, actualizados y errores, con botones visuales. Sin claves ni llamadas reales.

Pagos: métodos ETECSA y tarjeta CUP con estado, datos de destino e instrucciones, tomados de datos configurables, nunca escritos dentro de los componentes.

Resto de secciones (pedidos, usuarios, juegos, wallets, depósitos, retiros, comercio, referidos, configuración) en versión visual con tablas y filtros.

## Estados de interfaz

Cada pantalla importante incluye carga (skeletons), vacío, error, éxito, no disponible y mantenimiento.

## Detalles técnicos

- Rutas por archivo en `src/routes/`; grupos separados para público, `app` y `admin`.
- Tokens de color, radios y sombras en `src/styles.css` en formato oklch.
- Datos simulados en `src/data/mock/` con los modelos: profiles, games, products, orders, wallets, wallet_transactions, deposits, withdrawals, payments, notifications, referrals, game_accounts, api_transactions, payment_settings.
- Capa de servicios en `src/services/` (`getGames`, `getProducts`, `getOrders`, `getWallet`, etc.) que hoy devuelve datos simulados y mañana consultará el backend; las pantallas solo hablan con esta capa.
- Tipos compartidos en `src/types/`; componentes reutilizables en `src/components/`.
- Cada página pública con su propio título, descripción y Open Graph.
- Revisión responsive en 360/375/390/430 px y 1280/1440/1920 px, sin scroll horizontal ni contenido tapado por la barra inferior.
- Accesibilidad: foco visible, áreas táctiles amplias, etiquetas claras y estados que no dependen solo del color.

## Qué NO se hace en esta fase

Base de datos, autenticación real, roles, wallet o pagos reales, integración con el proveedor, claves ni secretos.

## Qué revisar tú al terminar

Navegar las 20 pantallas del listado (pública, juegos, detalle, recargas, compra, wallet, pedidos, comercio, referidos, notificaciones, perfil y todo el panel admin), confirmar el estilo y avisarme antes de pasar a la Fase 2.
