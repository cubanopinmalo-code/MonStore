# FASE 2.6.7 — Verificación post-GRANT (solo lectura)

Proyecto canónico: `nklgztbukgaoycuaryzk`. Cambio aplicado por el usuario:
`GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated;`
No se ejecutó ningún cambio adicional en esta fase.

## 1. Lectura pública del catálogo (publishable key, sin sesión)

| Recurso | Antes | Ahora |
|---|---|---|
| `games_public` | 401 / 42501 `permission denied for function is_admin` | 200 |
| `products_public` | 401 / 42501 | 200 |
| `events` | 401 / 42501 | 200 |
| `settings` | 401 / 42501 | 200 (filas públicas de configuración) |
| `account_listings` | 401 / 42501 | 200 |

Las vistas devuelven `[]` porque el catálogo canónico aún está vacío
(conteo con clave de servicio: games 0, products 0, events 0, account_listings 0).
El bloqueo de permisos está resuelto; solo falta la migración de datos.

## 2. `is_admin()` para visitante

`POST /rest/v1/rpc/is_admin` con publishable key → `false`. Ejecutable, no otorga privilegios.

## 3. Sin privilegios administrativos para el rol público

- `INSERT` en `games` → 401 / 42501 (sin GRANT de escritura).
- `INSERT` en `settings` → 401 (`new row violates row-level security policy`).

## 4. Recursos privados: siguen bloqueados

Denegados a nivel de tabla (401 / 42501): `orders`, `order_status_history`,
`account_credentials`, `credential_access_log`, `event_rooms`.

Accesibles al endpoint pero filtrados por RLS a 0 filas: `wallets`,
`wallet_transactions`, `fund_requests`, `withdrawal_requests`, `finance_entries`,
`user_roles`, `audit_log`, `profiles`. Sin sesión no devuelven ninguna fila.

## 5. Campos de las vistas públicas

Consultas de columnas sensibles sobre `products_public` y `games_public` devuelven
`42703 column does not exist` para: `cost`, `cost_usd`, `provider_cost`, `g2bulk_id`,
`api_key`, `credentials`, `internal_notes`, `admin_notes`.
Los campos públicos (`id`, `name`, `price_cup`, …) responden sin error.

## 6. Clave de servicio

- No aparece en el código fuente (solo comparaciones de prefijo `sb_secret_` en los clientes generados).
- Ninguna variable `VITE_*` contiene secretos administrativos.
- Se lee únicamente desde el entorno del servidor; no se imprime en registros.

## Resultado

Arreglo verificado y correcto. Sin cambio de conexión, migración, cutover ni
modificaciones de Auth, OTP, G2Bulk, wallet o pedidos.
