# Comercio de cuentas — mejora visual de Fase 1

## Objetivo
Ampliar el prototipo visual del comercio sin activar cuentas reales, pagos reales ni persistencia.

## Cambios
- Mostrar el saldo actual de la Wallet en la esquina superior derecha del área de usuario, junto a notificaciones.
- Actualizar cada anuncio del comercio con foto principal, vendedor, juego, región, plataforma, precio y botón Comprar.
- Crear una pantalla de detalle por anuncio con galería de todas las imágenes públicas y resumen de compra simulado.
- Ampliar el formulario “Publicar cuenta” con juego administrable, precio, varias imágenes, plataforma según juego, correo, contraseña y descripción de acceso.
- Marcar correo, contraseña y descripción de acceso como datos privados; solo aparecerán en la revisión administrativa, nunca en las vistas públicas.
- Actualizar los datos simulados y la revisión administrativa para representar estos campos.

## Detalles técnicos
- Añadir campos de región, plataforma y credenciales privadas al modelo mock de publicaciones.
- Añadir una ruta dinámica de detalle para cada cuenta publicada y enlazar las tarjetas mediante navegación interna.
- Mantener la compra como una acción visual con aviso de simulación; no descontará saldo.
- Conservar los juegos del selector desde el catálogo mock que representa los juegos gestionados por administración.
- Verificar navegación, formulario, galería, saldo y vistas móvil/escritorio.

## Fuera de alcance
No se implementarán autenticación, base de datos, almacenamiento real de imágenes, cobros, transferencias, seguridad persistente ni integración externa. Todo seguirá en Fase 1 con datos simulados.
