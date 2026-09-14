# FASE 2.8.3 — Reclasificación controlada del catálogo

Fecha/hora de ejecución: **14/09/2026, 17:55 UTC**.
Backend intervenido: el backend actual del Customer App (`yfimkckjhhvxkbkyxexd`).

Operación: **ejecutada correctamente.**

---

## 1. Conjunto afectado

Se usó exactamente el conjunto identificado en la FASE 2.8.2, con doble condición de
seguridad (clasificación **y** referencia del proveedor), nunca solo por el texto `via_cuenta`:

```sql
WHERE delivery_method = 'via_cuenta' AND g2bulk_product_id LIKE 'p:%'
```

Comprobación previa: el conjunto con doble condición devolvió **1.123** registros, idéntico
al total de `via_cuenta` (1.123) y coincidente con la auditoría. Ningún registro
`via_cuenta` quedaba fuera del criterio, y ningún registro fuera de ese criterio podía
entrar en la operación.

Lista completa de los registros afectados (id, referencia del proveedor, nombre):
`FASE_2_8_3_IDS_RECLASIFICADOS.csv` — 1.123 líneas.

Ejemplos: `0134278b-…` (`p:10`, *32400 Uc Voucher*), `e9d62ac6-…` (`p:100`, *160$ PSN KSA*),
`4547e20d-…` (`p:1000`, *PUBG G Coins - 1050*).

---

## 2. Cantidades

| Momento | via_id | codigo | via_cuenta | Total |
| --- | --- | --- | --- | --- |
| Antes | 5.070 | 0 | 1.123 | 6.193 |
| Después | 5.070 | **1.123** | **0** | 6.193 |

Registros modificados: **1.123**. Clasificación anterior: `via_cuenta`. Clasificación nueva: `codigo`.
Registros creados: 0. Registros eliminados: 0.

---

## 3. Ejecución

Una sola sentencia, atómica:

```sql
UPDATE public.products
SET delivery_method = 'codigo', updated_at = now()
WHERE delivery_method = 'via_cuenta' AND g2bulk_product_id LIKE 'p:%';
```

Solo se escribieron dos columnas: la clasificación y la marca de última modificación.

---

## 4. Validaciones posteriores

| Validación | Resultado |
| --- | --- |
| Los 1.123 registros tienen ahora `codigo` | OK (1.123) |
| No queda ninguno como `via_cuenta` | OK (0) |
| Total del catálogo sin cambios | OK (6.193) |
| `via_id` sin cambios | OK (5.070) |
| Huella de los campos comerciales y técnicos del conjunto afectado (precio de venta, coste del proveedor, disponibilidad, activo, nombre, referencia del proveedor) | Idéntica antes y después: `bfa02021080c8577f20409d280326088` |
| Huella del resto del catálogo (clasificación, precio, coste, disponibilidad, activo) | Idéntica antes y después: `0fb47cb4095f7c2dafa38742e4f957f8` |
| Otras tablas (juegos, usuarios, wallets, pedidos, pagos, eventos, comercio de cuentas, configuración) | No intervenidas; ninguna sentencia las tocó |

No se conectó la API de G2Bulk, no hubo sincronización ni recálculo de precios.

---

## 5. Anomalías

Ninguna.

---

## 6. Estado del modelo tras la fase

- `via_id` — recarga automática mediante ID de jugador (5.070 ofertas).
- `codigo` — producto automático que entrega código o tarjeta (1.123 ofertas).
- `via_cuenta` — reservado, hoy sin registros: queda libre para el futuro catálogo de
  ofertas personalizadas administradas y atendidas por WhatsApp.
- Comercio — marketplace independiente de cuentas de usuarios, en su propia tabla.
