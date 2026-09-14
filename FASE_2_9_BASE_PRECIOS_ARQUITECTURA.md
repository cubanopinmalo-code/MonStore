# FASE 2.9 — Arquitectura del sistema de Base de Precios

Fase exclusivamente de **diseño y preparación**. No se conectó G2Bulk, no se usó ninguna
clave del proveedor, no se sincronizó, no se recalculó ni modificó ningún precio, y no se
tocaron usuarios, wallets, pedidos, pagos, eventos ni comercio.

Estado del catálogo al cerrar la fase: 6.193 ofertas (5.070 `via_id`, 1.123 `codigo`,
0 `via_cuenta`), suma de precios de venta **293.721.871,45 CUP**, huella de precios
`99371317c55cff06c98f0317360f7457` — idéntica a la del inicio.

---

## 1. Modelo de datos propuesto

Cuatro piezas nuevas, todas aditivas:

```text
pricing_rules          reglas configurables por el administrador
pricing_rule_targets   a qué se aplica cada regla (juego, producto, modalidad, región…)
pricing_runs           cada ejecución masiva: quién, cuándo, con qué regla, resultado
pricing_run_items      detalle por producto: precio anterior, precio nuevo, regla aplicada
```

Y columnas aditivas en `products` para separar precio comercial de cálculo:

```text
products.price_source        manual | rule | initial
products.price_rule_id       regla que fijó el precio actual (nulo si manual)
products.price_updated_at    cuándo cambió por última vez el precio de venta
products.price_locked        el precio no puede ser tocado por ninguna ejecución masiva
products.auto_recalc         si esta oferta acepta recálculo automático al cambiar el coste
products.cost_changed_at     señal: el coste del proveedor cambió desde el último precio
```

Ninguna columna existente se renombra, cambia de tipo ni se elimina.

---

## 2. Campos necesarios

**`pricing_rules`**

| Campo | Uso |
| --- | --- |
| `id`, `name`, `description` | identificación |
| `active` | activa/inactiva |
| `priority` | número; mayor prioridad gana |
| `usd_rate_cup` | conversión USD → CUP |
| `margin_per_usd_cup` | recargo fijo por dólar de coste |
| `margin_pct` | margen porcentual alternativo o acumulable |
| `rounding_mode`, `rounding_step` | redondeo (ninguno, arriba, abajo, al más cercano; paso 1, 5, 10…) |
| `min_price`, `max_price` | topes opcionales |
| `starts_at`, `ends_at` | vigencia temporal opcional |
| `recalc_on_cost_change` | A) recalcula al cambiar el coste; B) mantiene hasta acción manual |
| `respect_price_locked` | si salta las ofertas bloqueadas (por defecto sí) |
| `created_by`, `created_at`, `updated_at` | trazabilidad |

Fórmula evaluada por la regla (no fijada en código; todos los términos vienen de la fila):

```text
base   = coste_usd * usd_rate_cup + coste_usd * margin_per_usd_cup
conmar = base * (1 + margin_pct/100)
final  = limitar(redondear(conmar, modo, paso), min_price, max_price)
```

Los valores hoy vigentes (1 USD = 1000 CUP + 150 CUP) serían simplemente la primera fila
de la tabla, no una constante del código.

**`pricing_rule_targets`**: `rule_id`, `target_type` (`global`, `game`, `product`,
`delivery_method`, `region`, `provider`, `category`, `cost_range`), `target_value`,
`cost_min_usd`, `cost_max_usd`. Una regla puede tener varios destinos.

---

## 3. Jerarquía de reglas

Para cada producto se recogen las reglas activas y vigentes cuyo destino lo alcanza, y se
resuelve en este orden (a igualdad, gana la de mayor `priority`; después, la más reciente):

```text
1. producto concreto
2. juego
3. categoría
4. región
5. modalidad (via_id / codigo)
6. rango de coste
7. regla global
```

La resolución es determinista y se calcula en el servidor; la vista previa muestra siempre
qué regla ganó para cada producto.

---

## 4. Coste técnico frente a precio comercial

| Dato | Dueño | Campo | Lo escribe la sincronización |
| --- | --- | --- | --- |
| Coste del proveedor (USD) | G2Bulk | `g2bulk_cost` | Sí |
| Disponibilidad técnica | G2Bulk | `available` | Sí |
| Referencias del proveedor | G2Bulk | `g2bulk_product_id`, `g2bulk_id` | Sí |
| Precio de venta | MonStore | `sale_price` | **Nunca** |
| Precio calculado por la regla | MonStore | resultado en vivo / `pricing_run_items` | No |
| Regla aplicada | MonStore | `price_rule_id` | No |
| Origen del precio | MonStore | `price_source` | No |
| Última actualización del precio | MonStore | `price_updated_at` | No |
| Descuentos, promociones, destacado, orden, activación | MonStore | columnas comerciales | **Nunca** |

Un cambio de coste no mueve el precio: como máximo escribe `cost_changed_at` y aparece en
el Panel Admin como "coste cambiado, precio pendiente de revisión".

---

## 5. Protección contra sobrescritura de G2Bulk

Tres capas, sin confiar en el frontend:

1. **Código de sincronización** — el `update` enumera solo columnas técnicas
   (`g2bulk_cost`, `available`, `last_synced_at`, referencias). Ya aplicado en la Fase 2.8.1
   y cubierto por pruebas automáticas.
2. **Base de datos** — un trigger `BEFORE UPDATE` en `products` que, cuando la sesión está
   marcada como sincronización (`set_config('monstore.sync', 'on', true)`), restaura los
   valores antiguos de `sale_price` y del resto de columnas comerciales aunque la sentencia
   intente cambiarlos. Es la garantía real.
3. **Permisos** — la sincronización corre en el servidor con un camino propio; ningún rol de
   cliente puede escribir `products`, y `price_locked` bloquea además las ejecuciones masivas.

---

## 6. Panel Admin — sección "Base de Precios"

Pantalla de lista: bases existentes con nombre, estado, prioridad, ámbito (a qué se aplica),
número de productos afectados y fecha de última aplicación.

Detalle de una base: formulario con tasa, margen por dólar, margen porcentual, redondeo,
precio mínimo/máximo, vigencia, comportamiento ante cambio de coste, y los destinos.

Tabla de impacto por producto: producto · coste del proveedor · regla aplicada · precio
actual · precio calculado · diferencia (absoluta y %) · última actualización · bloqueado.

Acciones: crear, editar, activar/desactivar, cambiar prioridad, asignar destinos,
previsualizar y aplicar.

---

## 7. Vista previa

Función de servidor de **solo lectura**: recibe el id de la regla (o una regla sin guardar),
resuelve los productos alcanzados, calcula el precio nuevo y devuelve el listado con
diferencias y un resumen (productos afectados, suben, bajan, sin cambio, bloqueados,
variación total). No escribe nada. Aplicar exige confirmación explícita del administrador
sobre ese mismo resultado.

---

## 8. Aplicación masiva

Una función de servidor `apply_pricing_rule(rule_id, confirmación)` que:

- se ejecuta dentro de una única transacción (todo o nada, sin actualizaciones parciales);
- abre una fila en `pricing_runs` (regla, actor, inicio) y escribe una fila por producto en
  `pricing_run_items` con precio anterior y nuevo;
- salta las ofertas con `price_locked`;
- actualiza `sale_price`, `price_source = 'rule'`, `price_rule_id`, `price_updated_at`;
- es idempotente: una segunda ejecución sin cambios no genera modificaciones;
- procesa por lotes con reanudación para las 6.193 filas, cerrando la transacción por lote y
  registrando el progreso en `pricing_runs`;
- está fuera del alcance de cualquier proceso de G2Bulk: la sincronización no puede invocarla.

---

## 9. Auditoría

`pricing_runs`: id, regla, actor (`auth.uid()`), inicio, fin, duración, modo
(vista previa/aplicación), total evaluado, modificados, bloqueados, errores, estado.
`pricing_run_items`: ejecución, producto, coste usado, precio anterior, precio nuevo, regla.
Lectura reservada al administrador; sin `GRANT` para el rol público.

---

## 10. Rollback

Cada ejecución guarda el precio anterior de cada producto, de modo que revertir es aplicar
`pricing_run_items` en sentido inverso mediante una acción explícita "Revertir ejecución",
también transaccional y registrada como una nueva ejecución. Además:

- la vista previa evita la mayoría de los errores antes de escribir;
- desactivar una regla no cambia precios (no hay recálculo implícito);
- `price_locked` protege de forma permanente los precios editados a mano.

---

## 11. Ejemplos de reglas (no aplicadas)

1. **Global actual** — prioridad 0, destino `global`, tasa 1000, margen por dólar 150,
   sin redondeo. Reproduce exactamente los precios de hoy.
2. **Tarjetas con redondeo** — prioridad 10, destino `delivery_method = codigo`,
   misma tasa, redondeo al múltiplo de 50 hacia arriba.
3. **Juego destacado** — prioridad 20, destino `game = Free Fire`, margen por dólar 100
   (más agresivo), precio mínimo 500 CUP.
4. **Micro-recargas** — prioridad 15, destino `cost_range` 0–1 USD, margen porcentual 25%.
5. **Promoción temporal** — prioridad 30, vigencia de una semana, margen por dólar 80.

Ninguna de estas reglas se creó ni se ejecutó.

---

## 12. Cambios de base de datos necesarios (siguiente fase)

Una migración aditiva: las cuatro tablas nuevas con sus `GRANT` y RLS (lectura y escritura
solo para administradores, `service_role` completo, sin acceso `anon`), las seis columnas
nuevas en `products` (todas anulables o con valor por defecto, sin tocar filas), índices por
regla y producto, y el trigger de protección comercial descrito en la sección 5.

---

## 13. Cambios de frontend necesarios

Nueva ruta de administración "Base de Precios" (lista, formulario de regla, destinos, tabla
de impacto, diálogo de confirmación) y un enlace en la navegación del Panel Admin. El
catálogo público y las pantallas de cliente no cambian: siguen leyendo `sale_price`.

---

## 14. Cambios de backend necesarios

Un módulo `pricing.functions.ts` con: listar/crear/editar/activar reglas, resolver la regla
ganadora por producto, `previewPricingRule` (solo lectura), `applyPricingRule`
(transaccional y auditada) y `revertPricingRun`. Todas con verificación de rol administrador
en el servidor. La sincronización de catálogo no obtiene acceso a ninguna de ellas.

---

## 15. Pendiente para la siguiente fase

1. Aplicar la migración aditiva (tablas, columnas, índices, RLS, trigger de protección).
2. Implementar el módulo de servidor con vista previa y aplicación transaccional.
3. Construir la pantalla "Base de Precios" del Panel Admin.
4. Crear la regla global inicial que reproduce los precios actuales, sin aplicarla.
5. Solo después: conectar la clave de G2Bulk y programar la sincronización.

---

## 16. Confirmaciones de cierre

- Los 6.193 productos mantienen exactamente sus precios: suma 293.721.871,45 CUP y huella
  `99371317c55cff06c98f0317360f7457`, sin variación.
- No se conectó G2Bulk.
- No se utilizó ninguna clave del proveedor.
- No se recalculó ningún precio.
- No se modificó ninguna otra área del sistema.
