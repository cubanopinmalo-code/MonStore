# FASE 2.8.1 — Corrección de lógica del catálogo antes de G2Bulk

Alcance ejecutado: solo protección de precios en la sincronización y clasificación
`via_id` / `codigo` / `via_cuenta`. No hubo sincronización real, ni conexión de la API key
de G2Bulk, ni cutover, ni migración de datos, ni cambios en Auth, OTP, wallets, pedidos,
depósitos, retiros, eventos, comercio de cuentas, Storage, RLS ni conexión del Customer App.
No se modificó ningún precio ni ningún dato del catálogo.

---

## 1. Problemas detectados

**P1 — Precios.** La sincronización con el proveedor recalculaba `sale_price` a partir del
coste recibido, tanto al crear como al **actualizar** ofertas ya existentes. Cualquier cambio
de coste en G2Bulk sobrescribía el precio comercial de MONSTORE.

**P2 — Clasificación.** Los productos automáticos del proveedor (`/products`, que entregan
un código o tarjeta) se guardaban con `delivery_method = "via_cuenta"`, tipo que debe quedar
reservado al comercio de cuentas entre usuarios. Además el tipo `codigo` no existía.

---

## 2. Causa

- El mismo camino de código servía para "alta de oferta nueva" y para "actualización
  periódica", sin separar dato técnico (coste) de dato comercial (precio).
- El tipo de entrega en base de datos solo tenía dos valores (`via_id`, `via_cuenta`),
  así que los productos de código se metían en el cajón equivocado.

---

## 3. Cambios realizados

**Base de datos (aditivo, sin tocar filas):**
- `drizzle/migrations/0010_add_codigo_delivery_method.sql`: añade el valor `codigo` al tipo
  `public.delivery_method`. No borra, no renombra, no modifica datos ni RLS.

**`src/lib/catalog.functions.ts`:**
- La actualización de ofertas existentes durante la sincronización ya **no** escribe
  `sale_price`. Solo escribe `g2bulk_cost`, `available` y `last_synced_at`.
- Los productos automáticos del proveedor se crean con `delivery_method: "codigo"`.
- `priceFromCost` queda documentada como precio **inicial sugerido**: se aplica al dar de
  alta una oferta nueva (la columna de precio es obligatoria) y en la acción manual del
  administrador de recalcular precios; nunca en la actualización de ofertas existentes.
- El editor de ofertas del Panel Admin ya solo permite `via_id` o `codigo`.

**Tipos e interfaz:**
- `src/types/index.ts`: `DeliveryMethod = "via_id" | "codigo" | "via_cuenta"`.
- Nuevo `src/lib/delivery.ts` con las etiquetas "Por ID" / "Por código" / "Por cuenta".
- Textos actualizados en Panel Admin (lista y editor de ofertas), detalle de pedido,
  página de recargas por juego, catálogo público y filtros de recargas (nuevo filtro "Por código").

---

## 4. Reglas definitivas

| Dato | Dueño | Se actualiza en la sincronización |
| --- | --- | --- |
| Coste del proveedor | G2Bulk | Sí |
| Disponibilidad técnica | G2Bulk | Sí |
| Identificadores del proveedor | G2Bulk | Sí |
| Precio de venta | MONSTORE | **No** |
| Margen, descuentos, promociones y fechas | MONSTORE | **No** |
| Activo/inactivo comercial, destacado, orden | MONSTORE | **No** |

Clasificación:
- `via_id` — recarga automática que requiere el ID del jugador.
- `codigo` — producto automático que entrega un código o tarjeta digital.
- `via_cuenta` — exclusivo del comercio de cuentas entre usuarios; la sincronización
  automática nunca lo asigna.

---

## 5. Pruebas

`src/lib/catalog-sync.test.ts` — 7 pruebas, todas en verde:

1. La actualización de ofertas durante la sincronización no incluye `sale_price`.
2. Sí actualiza coste y disponibilidad como datos técnicos.
3. La sincronización no crea ningún producto `via_cuenta`.
4. Los productos con código se clasifican como `codigo`.
5. Las recargas con ID siguen siendo `via_id`.
6. Las etiquetas distinguen los tres tipos.
7. La clave del proveedor no aparece en el módulo del catálogo (sigue solo en
   `src/lib/g2bulk.server.ts`, leída desde los secretos del servidor).

Comprobación de tipos del proyecto: sin errores.

---

## 6. Resultado

- Un cambio de coste en G2Bulk ya no altera el precio de venta de MONSTORE.
- El futuro sistema de bases de precios del Panel Admin podrá calcular precios de forma
  centralizada sin tocar producto por producto, usando el coste técnico ya almacenado.
- `via_cuenta` queda libre para el comercio de cuentas.
- La API key de G2Bulk sigue siendo exclusivamente de servidor; no se añadió ninguna clave real.

**Pendiente de autorización (fuera de este alcance):** los productos automáticos ya existentes
en el backend actual siguen guardados como `via_cuenta`. Su reclasificación a `codigo` es un
cambio de datos y no se ejecutó.
