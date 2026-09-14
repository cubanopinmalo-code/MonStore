# FASE 2.8.2 — Auditoría de reclasificación del catálogo (solo lectura)

Alcance: auditoría **exclusivamente de lectura** sobre el backend actual del Customer App
(`yfimkckjhhvxkbkyxexd`). No se ejecutó ningún `UPDATE`, `INSERT` ni `DELETE`. No se conectó
G2Bulk, no se sincronizó, no se modificó ningún precio ni ninguna clasificación.

Fecha de la auditoría: 14/09/2026.

---

## 1. Modelo conceptual definitivo

| Concepto | Significado | Origen |
| --- | --- | --- |
| `via_id` | Recarga automática que requiere el ID del jugador | G2Bulk |
| `codigo` | Producto automático que entrega un código o tarjeta digital | G2Bulk |
| `via_cuenta` | **Modalidad de recarga personalizada**, gestionada por el administrador y atendida por WhatsApp. Catálogo propio de MonStore, no depende de G2Bulk | MonStore (Panel Admin) |
| Comercio | Marketplace de cuentas de juego publicadas por usuarios y aprobadas por administración. **Sistema independiente**, no es un tipo de entrega del catálogo | Usuarios |

"Vía cuenta" no es venta de cuentas. El marketplace vive en su propia tabla
(`game_accounts`) con su propio flujo: publicar → revisar → aprobar/rechazar → vender.

---

## 2. Situación actual del catálogo

| Tipo de entrega | Registros |
| --- | --- |
| `via_id` | 5.070 |
| `via_cuenta` | 1.123 |
| `codigo` | 0 |
| **Total** | **6.193** |

Marketplace (`game_accounts`): **0 registros** en este backend. El comercio de cuentas no
tiene ninguna fila que pudiera haberse guardado por error dentro del catálogo.

---

## 3. Análisis de los 1.123 registros marcados hoy como `via_cuenta`

Señales examinadas para cada registro:

| Señal | Resultado |
| --- | --- |
| Referencia del proveedor (`g2bulk_product_id`) | 1.123 de 1.123 con prefijo `p:` — provienen del endpoint `/products` de G2Bulk |
| Registros sin referencia de proveedor (creados a mano) | 0 |
| Registros con referencia de recarga por ID (`topup:…`) | 0 |
| Campos de jugador requeridos (`metadata.fields`) | 0 registros tienen alguno → ninguno pide ID de jugador |
| Marca de sincronización (`last_synced_at`) | 1.123 de 1.123, todos con la misma pasada: 12/09/2026 23:38 UTC |
| Menciones a WhatsApp o atención personalizada (nombre/descripción) | 0 |
| Palabras propias de cuentas (cuenta, account, login, email) | 0 |
| Categoría del juego asociado | 1.123 de 1.123 en "Tarjetas y códigos" |
| Productos sin juego asociado | 0 |

Estado comercial: 1.123 activos, 646 disponibles técnicamente, 154 juegos implicados.

Juegos con más registros: Itunes USA (25), Google Play Indonesia (22), Google Play Saudi
Arabia (21), Google Play UAE (19), Amazon Saudi Arabia (18), Apple iTunes Turkey (18),
Apple iTunes Saudi Arabia (16), Steam Taiwan (16), Apple iTunes Russia (16), Yalla Ludo (16),
PlayStation Network GiftCards (16), Razer Gold Turkey (15).

---

## 4. Resultado por categoría de la regla de auditoría

| Categoría | Criterio | Registros |
| --- | --- | --- |
| **A — candidato a `codigo`** | Producto automático de G2Bulk (`p:…`), sin campos de jugador, juego de "Tarjetas y códigos" | **1.123** |
| **B — mantener `via_cuenta`** | Modalidad personalizada por WhatsApp creada por el administrador | **0** |
| **C — candidato a `via_id`** | Recarga automática que pide ID del jugador | **0** |
| **D — pertenece a Comercio** | Cuenta de usuario guardada por error en el catálogo | **0** |
| **E — requiere revisión manual** | Sin información suficiente | **0** |

Conclusión: el uso actual de `via_cuenta` en el catálogo es **íntegramente un error de
clasificación heredado** del código anterior, que marcaba así todo lo que llegaba del
endpoint `/products` de G2Bulk. Ninguno de esos 1.123 registros es una oferta personalizada
por WhatsApp ni una cuenta de usuario.

### Registros concretos afectados

El conjunto afectado es identificable de forma exacta y reproducible con este criterio
(consulta de solo lectura):

```sql
SELECT id, name, g2bulk_product_id, game_id
FROM public.products
WHERE delivery_method = 'via_cuenta'
  AND g2bulk_product_id LIKE 'p:%';
-- 1.123 filas; coincide con el total de via_cuenta
```

Ejemplos verificados: `Itunes 500$ US GiftCard` (`p:29`), `Itunes 400$ US GiftCard` (`p:28`),
`Itunes 300$ US GiftCard` (`p:27`), `Itunes 150$ US GiftCard` (`p:24`),
`Itunes 70$ US GiftCard` (`p:22`), `Itunes 40$ US GiftCard` (`p:19`),
`Itunes 30$ US GiftCard` (`p:18`), `Itunes 15$ US GiftCard` (`p:15`),
`24300 Uc Voucher` (`p:9`), `32400 Uc Voucher` (`p:10`).

---

## 5. Consecuencia para la arquitectura

- El catálogo automático debe quedar con dos tipos: `via_id` y `codigo`.
- `via_cuenta` queda libre para su uso real: el futuro catálogo de ofertas personalizadas
  con juego, región, descripción, precio, condiciones, imagen e información adicional, y
  con enlace a WhatsApp desde la ficha del cliente. Ese catálogo no se alimenta de G2Bulk.
- El Comercio sigue siendo un sistema independiente sobre `game_accounts`; no debe
  representarse nunca como un tipo de entrega del catálogo.

---

## 6. Pendiente de autorización (no ejecutado)

1. Reclasificar los 1.123 registros de categoría A de `via_cuenta` a `codigo` (cambio de datos).
2. Crear el catálogo de ofertas "Vía cuenta" administradas (esquema, Panel Admin y vista de
   cliente con enlace a WhatsApp).
3. Ajustar los filtros públicos para que "Por cuenta" muestre únicamente ese nuevo catálogo.

No se realizó ninguna de estas acciones. Me detengo aquí a la espera de autorización.
