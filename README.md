# MonStore

MONSTORE — Plataforma Web de recargas, Wallet y comercio digital

INSTRUCCIONES GENERALES PARA LOVABLE

Quiero construir una plataforma Web profesional llamada MONSTORE, orientada inicialmente al mercado cubano y especializada en la venta de recargas y productos digitales para videojuegos.

La plataforma debe ser una Web App responsive, optimizada principalmente para teléfonos móviles, pero también completamente funcional en escritorio.

Quiero utilizar:

Lovable para construir el frontend y la aplicación.

Supabase como backend y base de datos.

G2Bulk API (api.g2bulk.com) como proveedor de productos digitales.

Una API Key privada de G2Bulk que proporcionaré mediante variables de entorno/secretos.

REGLA CRÍTICA DE SEGURIDAD

La API Key de G2Bulk es información privada.

NUNCA debe aparecer en:

Código JavaScript del frontend.

React components.

HTML.

Requests realizados directamente desde el navegador.

Variables públicas.

GitHub.

Logs visibles al usuario.

La API Key debe almacenarse exclusivamente como Secret/Environment Variable del backend.

El flujo correcto debe ser:

MONSTORE Web
      ↓
Supabase / Backend seguro
      ↓
G2Bulk API
      ↓
Respuesta de G2Bulk
      ↓
Backend MONSTORE
      ↓
Base de datos
      ↓
MONSTORE Web


Nunca:

Usuario → G2Bulk API directamente


OBJETIVO GENERAL

Crear una plataforma donde un usuario pueda:

Registrarse.

Iniciar sesión.

Consultar juegos disponibles.

Consultar las ofertas disponibles para cada juego.

Obtener el catálogo desde G2Bulk.

Ver los precios de venta establecidos por MONSTORE.

Seleccionar una oferta.

Introducir el ID/datos necesarios del jugador.

Pagar utilizando su Wallet.

Crear una orden.

Procesar automáticamente la recarga mediante G2Bulk.

Consultar el estado de la orden.

Consultar su historial.

Agregar fondos a su Wallet.

Solicitar retiros cuando corresponda.

Utilizar referidos.

Participar posteriormente en un mercado de cuentas de videojuegos.

Además, debe existir un Panel de Administración independiente para controlar todo el sistema.

PRINCIPIO FUNDAMENTAL DE DESARROLLO

No quiero que intentes construir toda la plataforma de una sola vez.

Quiero que la construyas por etapas, verificando cada etapa antes de comenzar la siguiente.

Después de terminar cada fase:

Comprueba que funciona.

Comprueba que no rompe funcionalidades anteriores.

Revisa errores.

Revisa seguridad.

Explica brevemente qué se construyó.

Espera a la siguiente instrucción antes de realizar cambios grandes.

No reemplaces funcionalidades existentes sin analizar primero cómo afectan al sistema.

FASE 0 — PLANIFICACIÓN Y ARQUITECTURA

Antes de crear funcionalidades complejas, analiza la arquitectura completa.

Define:

Frontend.

Backend.

Base de datos.

Autenticación.

Seguridad.

Integración G2Bulk.

Wallet.

Sistema de pedidos.

Sistema de pagos.

Panel Admin.

Storage.

Notificaciones.

La arquitectura debe ser escalable.

No quiero una aplicación construida como prototipo desechable.

FASE 1 — CREAR PROYECTO Y ESTRUCTURA BASE

Crear una Web App responsive con:

Navegación pública

Inicio.

Juegos.

Recargas.

Comercio de cuentas.

Login.

Registro.

Navegación del usuario autenticado

Inicio.

Recargas.

Wallet.

Mis pedidos.

Comercio.

Referidos.

Notificaciones.

Perfil.

Navegación administrativa

Dashboard.

Pedidos.

Usuarios.

Juegos.

Productos.

G2Bulk.

Pagos.

Wallets.

Depósitos.

Retiros.

Comercio.

Referidos.

Configuración.

Crear inicialmente las rutas y componentes básicos sin implementar todavía toda la lógica.

FASE 2 — SUPABASE Y AUTENTICACIÓN

Configurar Supabase.

Implementar:

Registro.

Login.

Logout.

Recuperación de acceso.

Sesiones persistentes.

Protección de rutas.

La estructura debe permitir identificar claramente:

Usuario normal

Puede:

Ver productos.

Comprar.

Administrar su wallet.

Crear solicitudes.

Ver sus propios datos.

Administrador

Puede acceder al Panel Admin y administrar el sistema.

Implementar Row Level Security (RLS).

Un usuario nunca debe poder consultar o modificar información privada de otro usuario.

FASE 3 — BASE DE DATOS

Crear una estructura relacional profesional.

Como mínimo:

profiles

id
name
phone
province
municipality
avatar
referral_code
referred_by
status
created_at
updated_at


games

id
g2bulk_id
name
slug
image_url
description
active
created_at
updated_at


products

id
game_id
g2bulk_product_id
name
description
image_url
g2bulk_cost
sale_price
currency
active
metadata
created_at
updated_at


orders

id
user_id
product_id
game_id
player_id
player_data
quantity
unit_price
total_amount
currency
payment_method
status
g2bulk_transaction_id
g2bulk_response
error_message
created_at
updated_at
completed_at


wallets

id
user_id
balance
currency
status
created_at
updated_at


wallet_transactions

id
wallet_id
user_id
type
amount
balance_before
balance_after
reference_type
reference_id
description
status
created_at


deposits

id
user_id
amount
payment_method
status
proof_image_url
payment_reference
reviewed_by
reviewed_at
rejection_reason
created_at


withdrawals

id
user_id
amount
fee
net_amount
payment_method
payment_destination
status
reviewed_by
reviewed_at
rejection_reason
created_at


payments

id
user_id
order_id
amount
method
status
reference
proof_image_url
created_at
updated_at


notifications

id
user_id
title
message
type
read
created_at


referrals

id
referrer_user_id
referred_user_id
status
created_at


game_accounts

id
seller_id
game_id
title
description
price
images
status
rejection_reason
created_at
updated_at


api_transactions

id
order_id
provider
request_data
response_data
provider_transaction_id
status
error_message
created_at
updated_at


La estructura puede modificarse si técnicamente existe una solución superior.

FASE 4 — INTEGRACIÓN CON G2BULK

Esta es una de las partes más importantes.

Quiero que investigues y utilices correctamente la documentación actual de la API de G2Bulk que proporcionaré.

No inventes endpoints ni parámetros.

Antes de implementar la integración, identifica:

Endpoint de autenticación, si corresponde.

Endpoint para obtener juegos.

Endpoint para obtener productos/ofertas.

Endpoint para realizar pedidos.

Endpoint para consultar el estado de pedidos.

Formato de respuesta.

Identificadores de juegos.

Identificadores de productos.

Campos obligatorios.

Manejo de errores.

Límites de solicitudes.

API KEY

La API Key será proporcionada posteriormente.

Debe almacenarse como secreto del backend.

Por ejemplo conceptualmente:

G2BULK_API_KEY


No la escribas directamente en el código.

FASE 5 — CATÁLOGO AUTOMÁTICO DE G2BULK

El catálogo principal de MONSTORE debe obtenerse desde G2Bulk.

Quiero que el sistema pueda consultar:

Juegos

Ejemplo:

Free Fire
Mobile Legends
Blood Strike
Delta Force
FC Mobile
Arena Breakout
etc.


No asumir que estos serán los únicos juegos.

Los juegos disponibles deberán proceder de la API de G2Bulk.

SINCRONIZACIÓN DEL CATÁLOGO

No quiero que el navegador consulte constantemente G2Bulk.

Crear un sistema de sincronización:

G2Bulk API
     ↓
Backend MONSTORE
     ↓
Supabase
     ↓
MONSTORE Web


El backend debe poder:

Obtener juegos.

Obtener productos.

Guardarlos en Supabase.

Actualizarlos.

Detectar productos nuevos.

Detectar productos eliminados.

Detectar cambios.

Guardar identificadores originales de G2Bulk.

Crear un campo para identificar claramente cada elemento:

g2bulk_id


FASE 6 — SISTEMA DE PRECIOS

G2Bulk proporciona el costo del producto.

MONSTORE necesita tener su propio precio de venta.

Por lo tanto:

Costo G2Bulk
        +
Margen MONSTORE
        =
Precio de venta


El precio mostrado al cliente debe ser el precio de MONSTORE, no necesariamente el precio recibido de G2Bulk.

El Panel Admin debe permitir modificar los precios.

Ejemplo:

Costo G2Bulk: 15.00
Precio MONSTORE: 19.00


El usuario solamente debe ver:

19.00

El administrador puede visualizar ambos valores.

También quiero poder establecer posteriormente reglas automáticas de margen.

FASE 7 — PÁGINA DE CATÁLOGO

Crear una página moderna:

Recargas

Mostrar:

Juegos.

Imagen.

Nombre.

Productos disponibles.

Al seleccionar un juego:

Free Fire


mostrar sus ofertas disponibles.

Cada producto debe mostrar:

Nombre.

Imagen.

Descripción.

Precio.

Estado disponible/no disponible.

Botón Comprar.

Los datos deben proceder de Supabase, que a su vez se sincroniza con G2Bulk.

FASE 8 — COMPRA

Cuando el usuario seleccione un producto:

Mostrar un formulario dinámico según el juego/producto.

Ejemplo:

ID del jugador
Servidor
Región
Nickname


No todos los juegos necesariamente necesitan los mismos campos.

Por eso el sistema debe ser flexible y permitir definir los campos requeridos por producto.

Antes de confirmar:

Mostrar:

Producto
Precio
Datos del jugador
Método de pago
Total


FASE 9 — WALLET

Crear una Wallet interna para cada usuario.

Ejemplo:

Saldo disponible

5,000 CUP


La Wallet debe permitir:

Ver saldo.

Agregar fondos.

Comprar productos.

Ver historial.

Solicitar retiro cuando esté habilitado.

REGLA CRÍTICA

El saldo nunca debe modificarse directamente desde el frontend.

El frontend solamente solicita una operación.

El backend valida y ejecuta.

FASE 10 — COMPRA UTILIZANDO WALLET

Flujo:

Usuario
↓
Selecciona producto
↓
Confirma datos
↓
Backend verifica saldo
↓
Backend reserva/descuenta fondos
↓
Crea orden
↓
Envía pedido a G2Bulk
↓
Recibe respuesta


Si G2Bulk tiene éxito:

Orden = COMPLETADA


El dinero queda consumido.

Si G2Bulk falla:

Orden = ERROR


El importe debe ser reembolsado al wallet.

Ejemplo:

Wallet
5,000 CUP


Compra:

1,500 CUP


Se reserva:

3,500 CUP disponibles


Si la operación falla:

+1,500 CUP


Wallet:

5,000 CUP


Todo movimiento debe quedar registrado en wallet_transactions.

FASE 11 — PREVENCIÓN DE DOBLE COBRO

Implementar protección contra:

Doble clic.

Recarga de página.

Reenvío de formulario.

Solicitudes duplicadas.

Reintentos automáticos.

Cada operación debe tener un identificador único.

No debe ser posible cobrar dos veces al usuario por una sola orden.

FASE 12 — DEPÓSITOS DE WALLET

Implementar:

Saldo móvil ETECSA

Mostrar:

Número de destino.

Importe.

Instrucciones.

Botón copiar.

Botón "He pagado".

Crear solicitud:

PENDING


hasta verificar el pago.

Tarjeta CUP

Mostrar:

Número de tarjeta.

Número de móvil asociado.

Instrucciones.

Importe.

Carga de comprobante.

Crear solicitud pendiente.

El administrador podrá aprobar o rechazar.

FASE 13 — CONFIGURACIÓN DE MÉTODOS DE PAGO

Crear una tabla:

payment_settings

Con campos como:

id
payment_method
destination_number
card_number
phone_number
instructions
active
updated_at


El administrador podrá cambiar:

Número de saldo móvil.

Número de tarjeta.

Número de teléfono.

Instrucciones.

El frontend debe obtener estos datos dinámicamente.

Nunca escribir estos valores directamente en el código.

FASE 14 — PANEL ADMIN

Crear un dashboard profesional.

Mostrar:

Ventas

Ventas de hoy.

Ventas del mes.

Número de pedidos.

Pedidos completados.

Pedidos pendientes.

Pedidos con error.

Finanzas

Dinero recibido mediante saldo móvil.

Dinero recibido mediante tarjeta CUP.

Total recibido.

Fondos agregados.

Retiros.

Ganancias estimadas.

G2Bulk

Saldo/costo disponible si la API permite consultarlo.

Productos sincronizados.

Última sincronización.

Errores de API.

Pedidos enviados.

Pedidos completados.

FASE 15 — ADMINISTRACIÓN DEL CATÁLOGO G2BULK

El administrador debe poder visualizar:

Juego
Producto
ID G2Bulk
Costo G2Bulk
Precio MONSTORE
Margen
Estado
Última sincronización


Permitir:

Activar/desactivar productos.

Modificar precio.

Modificar margen.

Ocultar productos.

Actualizar catálogo.

Sincronizar manualmente.

No modificar el g2bulk_id accidentalmente.

FASE 16 — PEDIDOS

Crear una sección:

Pedidos

Mostrar:

ID.

Usuario.

Juego.

Producto.

Precio.

Método de pago.

Estado.

ID G2Bulk.

Fecha.

Filtros:

Pendiente.

Procesando.

Completado.

Error.

Cancelado.

Reembolsado.

El administrador debe poder abrir una orden y ver el historial completo de la operación.

FASE 17 — HISTORIAL FINANCIERO

Cada movimiento debe ser auditable.

No modificar registros financieros anteriores de forma destructiva.

Registrar:

Saldo anterior.

Movimiento.

Saldo posterior.

Motivo.

Referencia.

Fecha.

Usuario.

Administrador responsable.

FASE 18 — REFERIDOS

Crear:

Código de referido.

Enlace de referido.

Usuarios referidos.

Estadísticas.

La arquitectura debe permitir agregar posteriormente recompensas o comisiones.

FASE 19 — COMERCIO DE CUENTAS

Crear sección:

Comercio

Los usuarios podrán:

Publicar cuenta.

Elegir juego.

Subir imágenes.

Describir cuenta.

Establecer precio.

Enviar publicación.

Estado inicial:

PENDING


Administrador:

APPROVED
REJECTED


Si se rechaza:

rejection_reason


El usuario debe recibir una notificación.

FASE 20 — NOTIFICACIONES

Implementar notificaciones internas.

Eventos:

Pedido creado.

Pago confirmado.

Recarga completada.

Recarga fallida.

Reembolso.

Depósito aprobado.

Depósito rechazado.

Retiro aprobado.

Retiro rechazado.

Publicación aprobada.

Publicación rechazada.

FASE 21 — DISEÑO

Quiero un diseño:

Moderno.

Profesional.

Gamer.

Minimalista.

Rápido.

Responsive.

Debe funcionar correctamente en:

iPhone.

Android.

Tablet.

PC.

Priorizar experiencia móvil.

El usuario debe poder completar una compra con pocos pasos.

FASE 22 — OPTIMIZACIÓN

La aplicación debe:

Cargar rápido.

Utilizar imágenes optimizadas.

Evitar consultas innecesarias.

Utilizar caché cuando sea conveniente.

No llamar a G2Bulk directamente desde el navegador.

Utilizar Supabase como fuente de datos para el frontend.

FASE 23 — SEGURIDAD

Implementar:

Supabase RLS.

Roles.

Validación server-side.

Protección de endpoints.

Protección de API Keys.

Validación de precios.

Validación de wallet.

Protección contra órdenes duplicadas.

Protección contra manipulación del frontend.

El precio utilizado para cobrar debe provenir del backend/base de datos y no confiar en el precio enviado por el navegador.

El usuario tampoco debe poder modificar:

balance
order_status
payment_status
g2bulk_transaction_id
sale_price


desde el frontend.

FASE 24 — AUDITORÍA

Crear registros de acciones administrativas.

Por ejemplo:

Administrador
Acción
Elemento afectado
Valor anterior
Valor nuevo
Fecha
IP/device si resulta apropiado y legal


Esto será especialmente importante para:

Wallet.

Pagos.

Retiros.

Productos.

Precios.

Usuarios.

FASE 25 — PWA

Configurar la aplicación como Progressive Web App cuando sea compatible con el stack elegido.

Debe permitir:

Instalarse desde el navegador.

Tener icono.

Tener nombre MONSTORE.

Tener splash/loading apropiado.

Funcionamiento responsive.

FASE 26 — ESTRUCTURA FINAL

La arquitectura final debería tener aproximadamente:

                    MONSTORE WEB
                         │
                         ▼
                 FRONTEND / UI
                         │
                         ▼
                SUPABASE BACKEND
                  /      |      \
                 /       |       \
                ▼        ▼        ▼
           DATABASE    AUTH     STORAGE
                │
                ▼
          SERVER FUNCTIONS
                │
        ┌───────┴────────┐
        ▼                ▼
     G2BULK           PAGOS
        │
        ▼
     RECARGAS


FASE 27 — FLUJO COMPLETO DE UNA COMPRA

El flujo final deseado es:

Usuario entra a MONSTORE
        ↓
Selecciona Free Fire
        ↓
Selecciona oferta
        ↓
Introduce ID
        ↓
Sistema muestra precio MONSTORE
        ↓
Usuario selecciona Wallet
        ↓
Backend verifica saldo
        ↓
Backend crea reserva/transacción
        ↓
Backend crea orden
        ↓
Backend llama G2Bulk
        ↓
G2Bulk procesa
        ↓
      ÉXITO
        ↓
Orden completada
        ↓
Dinero confirmado como gastado
        ↓
Usuario recibe notificación


En caso de error:

G2Bulk
   ↓
ERROR
   ↓
Orden ERROR
   ↓
Reembolso
   ↓
Wallet + importe
   ↓
Notificación al usuario


FASE 28 — PRINCIPIOS QUE DEBES RESPETAR

1. Seguridad antes que velocidad

No sacrificar seguridad para implementar rápidamente una funcionalidad.

2. Backend para operaciones sensibles

Todo lo relacionado con:

Wallet.

Pagos.

G2Bulk.

Precios.

Reembolsos.

Retiros.

debe validarse en backend.

3. Base de datos como fuente de verdad

El frontend nunca debe considerarse una fuente confiable para información financiera.

4. API G2Bulk como proveedor

El catálogo inicial debe obtenerse desde G2Bulk.

No crear manualmente una lista fija de productos si existe información equivalente disponible mediante la API.

5. Separar costo y precio

Guardar:

g2bulk_cost
sale_price


por separado.

6. Preparar escalabilidad

La arquitectura debe permitir agregar más proveedores en el futuro.

Por ejemplo:

G2Bulk
Otro proveedor
Otro proveedor futuro


sin reconstruir MONSTORE desde cero.

FASE 29 — FORMA DE TRABAJO CONMIGO

Estoy aprendiendo a construir aplicaciones y quiero que el proceso sea comprensible.

Por eso, cuando una fase sea compleja:

Explícame qué vamos a hacer.

Explícame por qué.

Implementa la funcionalidad.

Comprueba errores.

Muéstrame qué quedó creado.

Indica qué debo comprobar.

No avances automáticamente a otra fase grande.

Si encuentras un problema de arquitectura, no lo ocultes.

Explícalo y propón la solución.

Si existen varias alternativas, compara las opciones y recomienda la más adecuada para MONSTORE.

RESULTADO FINAL

El objetivo es crear una plataforma Web profesional llamada:

MONSTORE

que permita:

Catálogo G2Bulk → Productos MONSTORE → Wallet → Compra → G2Bulk → Recarga → Historial → Administración

y que posteriormente pueda convertirse en una plataforma mucho más grande de productos digitales y comercio gamer.

La aplicación debe estar construida con una arquitectura profesional, segura, escalable y preparada para producción.

No quiero solamente una interfaz visual.

Quiero que el sistema completo funcione correctamente desde el frontend hasta el backend y la integración con G2Bulk.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/3ad183a9-52c5-48fa-8f3e-29794fc54b1e).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
