# FASE 2.8 — Arquitectura del catálogo dinámico G2Bulk

Estado: **análisis y preparación técnica**. No se ejecutó ninguna sincronización,
no se conectó la API key de G2Bulk, no se cambió la conexión del Customer App,
no se migraron datos ni se modificaron precios.

Proyecto canónico de destino: `nklgztbukgaoycuaryzk` — https://nklgztbukgaoycuaryzk.supabase.co
Backend actualmente en uso por el Customer App: `yfimkckjhhvxkbkyxexd` (sin cambios).

---

## 1. Arquitectura de sincronización

```text
G2Bulk API (https://api.g2bulk.com/v1)
        |  solo servidor, con X-API-Key
        v
Servidor MonStore (server functions / ruta cron)
        |  service key, nunca al navegador
        v
Supabase canónico (tablas técnicas + comerciales + registro de sync)
        |  publishable key + RLS + vistas públicas
        v
Customer App  ·  Panel Admin
```

Reglas invariables:

- Toda llamada a G2Bulk ocurre en el servidor (`src/lib/g2bulk.server.ts`), nunca en el navegador.
- La API key se lee dentro del handler desde los secretos del backend; no aparece en
  frontend, HTML, variables `VITE_*`, logs ni respuestas al cliente.
- El resultado que llega al navegador es siempre un resumen (contadores, estado), nunca
  la respuesta cruda del proveedor.
- Disparadores previstos: manual desde Panel Admin y, más adelante, programado
  (endpoint bajo `/api/public/*` con secreto de cron verificado en el handler).

Estado actual del código: `syncProviderCatalog`, `syncGameOffers`, `syncMissingGameOffers`
y `getProviderStatus` ya existen en `src/lib/catalog.functions.ts` y apuntan al backend
actual. En Fase 2.9+ se reapuntarán al canónico, con los cambios descritos abajo.

---

## 2. Mapeo G2Bulk → Supabase

| Origen G2Bulk | Destino canónico | Notas |
| --- | --- | --- |
| `GET /category` | `games` (juegos de productos/tarjetas) | referencia `category:<id>` |
| `GET /games` | `games` (recargas por ID) | referencia `code` del proveedor |
| `GET /products` | `products` (tipo `codigo`) | referencia `product:<id>` |
| `POST /games/:code/catalogue` | `products` (tipo `via_id`) | referencia `topup:<code>:<offer_id>` |
| `POST /games/fields`, `/games/servers` | `games.metadata` | campos requeridos al comprar |
| `GET /getMe` | solo lectura de estado/saldo | no persiste catálogo |

Clave natural de deduplicación: **`provider_ref`** (hoy `g2bulk_product_id`), único por producto.
Para juegos: `provider_ref` propio (`category:<id>` o el `code` del proveedor).

---

## 3. Campos técnicos (propiedad de G2Bulk)

Actualizables en cada sincronización:

- `provider_ref` / `g2bulk_product_id`, `g2bulk_id` del juego
- `provider_cost` / `g2bulk_cost` (coste en USD)
- `available` (disponibilidad técnica)
- nombre y descripción de origen, imagen de origen
- categoría/juego de origen, campos requeridos del jugador (server, charname, etc.)
- `last_synced_at`, `provider_payload` (JSON crudo, server-only)

---

## 4. Campos comerciales (propiedad de MonStore)

**Nunca** los toca una sincronización:

- `sale_price`, moneda, margen aplicado
- descuento, promoción, `promo_starts_at`, `promo_ends_at`
- `active` (visibilidad comercial), `featured`, `sort_order`
- clasificación/etiquetas comerciales, nombre mostrado si fue editado manualmente
- reglas comerciales por juego/categoría

Recomendación de esquema: marcar los campos editados a mano con un flag
`price_locked` / `name_overridden` para que futuras reglas masivas los respeten.

---

## 5. Protección de precios

- `provider_cost` y `sale_price` son columnas distintas y nunca se igualan.
- El upsert de sincronización escribe **solo** la lista de campos técnicos (sección 3).
  El `ON CONFLICT DO UPDATE` enumera explícitamente esas columnas; no usa `SET (*)`.
- Un cambio de coste en G2Bulk genera, como máximo, una señal (`cost_changed_at`,
  diferencia registrada en el log) para que el administrador decida.
- El recálculo de precios es una acción separada y explícita del Panel Admin.

Nota: el código actual sí recalcula `sale_price` al sincronizar y al cambiar la tasa USD.
Ese comportamiento debe retirarse del camino de sincronización antes del cutover, quedando
disponible únicamente como acción manual "recalcular precios".

---

## 6. Estrategia futura de bases de precios (no implementar ahora)

```text
coste G2Bulk (USD) → regla de precio (Panel Admin) → precio de venta → promoción → precio final
```

Arquitectura preparada: una tabla `pricing_rules` con ámbito (global / juego / categoría /
producto), prioridad, tipo (factor sobre coste, margen fijo, redondeo) y parámetros.
El cálculo se ejecuta en el servidor y escribe `sale_price` únicamente cuando el
administrador lanza la acción, saltando los productos con `price_locked`.
Los valores actuales (1 USD = 1000 CUP + 150 CUP) pasarán a ser la regla global inicial.

---

## 7. Identificación y upsert

- Índice único sobre `products.provider_ref` y sobre `games.provider_ref`.
- Toda escritura de sincronización usa `upsert(..., { onConflict: 'provider_ref' })`.
- Los productos creados manualmente en MonStore llevan `provider_ref` nulo y quedan
  fuera del alcance de la sincronización.
- El vínculo `product.game_id` se resuelve por `provider_ref` del juego, nunca por nombre,
  para evitar huérfanos y duplicados por nombres repetidos.

---

## 8. Clasificación via_id / codigo / via_cuenta

| Origen | Clasificación |
| --- | --- |
| `/products` (entrega de código o tarjeta) | `codigo` |
| `/games/:code/catalogue` (requiere ID de jugador) | `via_id` |
| Comercio de cuentas entre usuarios | `via_cuenta` |

`via_cuenta` queda reservado al comercio real entre usuarios; la sincronización nunca
crea productos con ese tipo. El código actual marca los productos de `/products` como
`via_cuenta`: debe corregirse a `codigo` en la implementación sobre el canónico.

---

## 9. Gestión de disponibilidad

- Campo técnico `available` (boolean) separado de `active` (comercial).
- Producto que desaparece del listado del proveedor → `available = false`,
  `unavailable_since` con fecha; se conserva precio, promoción, orden e historial.
- Reaparición → `available = true`, `unavailable_since` a nulo, sin tocar lo comercial.
- Nunca se elimina automáticamente en esta fase.
- Las vistas públicas filtran por `active AND available`.

---

## 10. Nuevos productos

- Se detectan por `provider_ref` ausente en la base.
- Se crean con datos técnicos completos y configuración comercial por defecto:
  `active = false` (o el valor que decida el administrador), sin promoción,
  `sale_price` calculado por la regla vigente en el momento del alta.
- El log de sincronización los cuenta como `products_new` para revisión en el Panel Admin.

---

## 11. Productos modificados o desaparecidos

Cada ejecución clasifica: nuevos, actualizados (cambió algún dato técnico),
sin cambios, no disponibles (ausentes en esta pasada), reaparecidos.
Sin borrado físico. Un producto ausente durante N pasadas se puede marcar
`archived` manualmente desde el Panel Admin, preservando pedidos e historial.

---

## 12. Registro de sincronizaciones

Tabla propuesta `catalog_sync_runs` (server-only, lectura solo admin):

`id`, `started_at`, `finished_at`, `duration_ms`, `trigger` (manual/cron),
`status` (ok/parcial/error), `games_processed`, `products_processed`,
`products_new`, `products_updated`, `products_unavailable`, `errors_count`,
`error_detail` (texto saneado, sin claves), `notes`.

Tabla opcional `catalog_sync_events` para el detalle por producto cuando haga falta auditar.
Última sincronización exitosa = último `status = 'ok'`. El Panel Admin mostrará este historial.

---

## 13. Seguridad

- Secretos separados y todos server-only: `G2BULK_API_KEY`,
  `MONSTORE_DB_SERVICE_KEY`, `MONSTORE_OTP_PEPPER`, secreto de cron.
- La publishable key es la única que llega al navegador; el acceso público pasa por
  RLS y por las vistas `games_public` / `products_public`.
- Las vistas públicas no exponen coste del proveedor, identificadores internos
  sensibles, payload crudo, notas internas ni datos administrativos.
- `catalog_sync_runs`, `provider_payload` y los costes quedan sin GRANT para `anon`.
- Los errores del proveedor se registran saneados: nunca la cabecera con la clave.

---

## 14. Riesgos

1. Sobrescritura de precios comerciales por la sincronización — mitigado con upsert de
   columnas técnicas enumeradas y retirada del recálculo automático.
2. Duplicados por cambios de nombre del proveedor — mitigado con `provider_ref` único.
3. Clasificación errónea `via_cuenta` heredada del código actual — corregir a `codigo`.
4. Volumen: ~386 juegos y ~6.193 productos; la sincronización debe ir por lotes con
   reanudación (ya existe el patrón de lotes en `syncMissingGameOffers`).
5. Caídas o límites de G2Bulk → ejecución parcial registrada, sin marcar masivamente
   productos como no disponibles si la pasada no se completó.
6. Catálogo canónico hoy vacío: la primera sincronización crea todo; conviene hacerla
   con los productos inactivos comercialmente hasta revisión.
7. Coste en USD y tasa: un cambio de tasa no debe propagarse solo a los precios.

---

## 15. Pruebas necesarias (antes de sincronizar de verdad)

1. Ejecución en seco contra el canónico: contar altas/actualizaciones sin escribir.
2. Verificar que una segunda pasada no crea duplicados (mismo `provider_ref`).
3. Editar manualmente precio, promoción, destacado y orden; sincronizar; comprobar
   que siguen intactos y que solo cambiaron coste/disponibilidad.
4. Simular desaparición de un producto: `available = false`, historial intacto.
5. Simular reaparición: vuelve a disponible sin perder configuración comercial.
6. Comprobar la clasificación `codigo` / `via_id` y que no se crea ningún `via_cuenta`.
7. Confirmar que la vista pública no expone coste ni campos internos.
8. Confirmar que la API key no aparece en respuestas, HTML ni logs.
9. Verificar el registro en `catalog_sync_runs` (contadores, duración, errores).
10. Prueba de lote grande con reanudación tras interrupción.

---

## 16. Propuesta técnica de implementación (fases siguientes)

- **2.9** Migración aditiva en el canónico: columnas técnicas/comerciales separadas,
  índices únicos sobre `provider_ref`, `catalog_sync_runs`, GRANT y RLS correspondientes.
- **2.10** Reescritura del servicio de sincronización: upsert por lotes, sin tocar campos
  comerciales, clasificación corregida, marcado de disponibilidad, registro de la ejecución.
- **2.11** Configuración de la API key de G2Bulk como secreto y primera sincronización
  controlada con productos inactivos.
- **2.12** Panel Admin: historial de sincronizaciones y acción manual de recálculo.
- **2.13** Sistema de bases de precios (`pricing_rules`) y su interfaz.

Pendiente de autorización explícita antes de cualquiera de estas fases.
