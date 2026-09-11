# MONSTORE — Fase 1: estructura y pantallas

Primera entrega: toda la navegación y las pantallas de MONSTORE, con datos de ejemplo. Sin cuentas de usuario, sin base de datos y sin conexión con el proveedor todavía. Así puedes ver y aprobar la app completa antes de conectar dinero real.

## Identidad visual

- Estilo gamer oscuro neón: fondo casi negro (#07090D), superficies (#111721), acento verde neón (#00E28A) y acento secundario cian (#22D3EE).
- Tipografía técnica para títulos, texto limpio para lectura.
- Diseño pensado primero para móvil: barra inferior con los accesos principales; en escritorio pasa a barra superior o lateral.
- Todos los precios en CUP.

## Pantallas públicas

- Inicio: presentación, juegos destacados, cómo funciona, llamada a registrarse.
- Juegos: lista de juegos con imagen y nombre.
- Detalle de juego: ofertas de recarga con nombre, imagen, descripción, precio y botón comprar.
- Recargas: catálogo general con buscador.
- Comercio de cuentas: listado de anuncios de ejemplo.
- Iniciar sesión y Registro: formularios visuales (aún sin funcionar).

## Pantallas del usuario

- Inicio del usuario: saldo, accesos rápidos, últimos pedidos.
- Recargas y compra: formulario de datos del jugador (ID, servidor, etc.) y pantalla de confirmación con producto, datos, método de pago y total.
- Wallet: saldo, historial de movimientos, agregar fondos (saldo móvil y tarjeta CUP) y solicitar retiro.
- Mis pedidos: lista con estados (pendiente, procesando, completado, error, reembolsado) y detalle.
- Comercio: publicar cuenta y mis publicaciones.
- Referidos: código, enlace e invitados.
- Notificaciones y Perfil.

## Panel de administración

Diseño propio tipo panel con menú lateral y estas secciones en versión visual:
Dashboard, Pedidos, Usuarios, Juegos, Productos, G2Bulk, Pagos, Wallets, Depósitos, Retiros, Comercio, Referidos y Configuración.

En Productos se ve la diferencia entre costo del proveedor, precio MONSTORE y margen (esa columna solo la ve el administrador).

## Detalles técnicos

- Rutas por archivo en `src/routes/`: públicas en la raíz; área de usuario bajo un grupo `app`; administración bajo un grupo `admin`. En esta fase todas son accesibles para poder revisarlas.
- Diseño con componentes reutilizables: `AppShell` público, `UserShell` con barra inferior móvil y `AdminShell` con menú lateral.
- Tokens de color y tipografía definidos en `src/styles.css` (formato oklch), sin colores fijos en los componentes.
- Datos simulados centralizados en `src/data/mock/*` con la misma forma que tendrán las tablas reales (games, products, orders, wallet, etc.), para que el cambio a datos reales sea sustituir la fuente, no reescribir pantallas.
- Cada página con su propio título y descripción para buscadores y para compartir.
- Sin claves ni llamadas al proveedor en esta fase.

## Qué NO se hace todavía

Cuentas reales, base de datos, roles y permisos, wallet funcional, pedidos reales e integración con el proveedor. Eso llega en las fases 2, 3 y 4, una por una.

## Qué revisar tú al terminar

Que la navegación funcione en móvil y escritorio, que el estilo te guste y que no falte ninguna pantalla de las que quieres.
