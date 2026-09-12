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
- [ ] Eventos con datos reales
- [ ] Conectar la clave del proveedor cuando el administrador la entregue

## Pendiente de decisiones

- Tasa de cambio USD → CUP para el margen (hoy el costo del proveedor se guarda en USD y la venta en CUP)
