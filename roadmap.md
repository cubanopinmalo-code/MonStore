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
