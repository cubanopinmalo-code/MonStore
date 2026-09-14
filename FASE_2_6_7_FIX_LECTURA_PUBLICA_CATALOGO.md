# FASE 2.6.7 — Bloqueador de lectura pública del catálogo (proyecto canónico)

Proyecto: `nklgztbukgaoycuaryzk` (https://nklgztbukgaoycuaryzk.supabase.co)
Alcance: SOLO diagnóstico + preparación del permiso mínimo. **No se ejecutó ningún cambio** (ver "Bloqueador de ejecución").
Conexión del Customer App: sin cambios (sigue en el backend actual).

## 1. Causa exacta

Las políticas RLS de `games`, `products`, `events`, `settings` y `account_listings` invocan
`public.is_admin()`. Esa función **no tiene `EXECUTE` concedido a `anon`** (ni previsiblemente a
`authenticated`), por lo que PostgREST falla al evaluar la política:

```
401 {"code":"42501","message":"permission denied for function is_admin"}
```

Verificación aislada:

| Llamada | publishable key | service key |
|---|---|---|
| `POST /rest/v1/rpc/is_admin` | 42501 permission denied | `false` (OK) |

Las vistas `games_public` / `products_public` son `security_invoker`, por lo que heredan el fallo
de la tabla base. No es un problema de las vistas ni de los `GRANT SELECT` de tabla.

## 2. Estado actual del rol público (auditoría de seguridad, 36 recursos)

- Falla por `is_admin`: `games`, `games_public`, `products`, `products_public`, `events`, `settings`, `account_listings`.
- Denegado por tabla (correcto, debe seguir así): `orders`, `order_status_history`, `account_credentials`, `credential_access_log`, `event_rooms`.
- Accesible pero filtrado por RLS a 0 filas: `profiles`, `wallets`, `wallet_transactions`, `fund_requests`,
  `withdrawal_requests`, `finance_entries`, `balance_lines`, `audit_log`, `user_roles`, `referrals`,
  `notifications`, `blocked_users`, etc.
- Vistas públicas ya operativas: `payment_methods_public`, `payment_destinations_public` (200).

Campos expuestos por las vistas públicas (sin costos de proveedor ni datos administrativos):
- `games_public`: id, slug, name, description, image_url, banner_url, category, fields, is_active, sort_order.
- `products_public`: id, game_id, sku, name, description, image_url, topup_kind, region, amount, unit,
  `list_price_cup`, `price_cup`, offer_active, offer_starts_at, offer_ends_at, fields, is_active.
  No incluye coste del proveedor, credenciales, notas internas ni identificadores de API.

## 3. Cambio mínimo propuesto (pendiente de ejecución)

```sql
-- Permiso mínimo: permitir EVALUAR la función usada por las políticas RLS.
-- is_admin() devuelve false para anon; no concede ningún privilegio administrativo.
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated;
```

Antes / después:

| Objeto | Antes | Después |
|---|---|---|
| `public.is_admin()` EXECUTE | solo propietario / service_role | + `anon`, `authenticated` |
| Políticas RLS | sin cambios | sin cambios |
| GRANT de tablas | sin cambios | sin cambios |
| Vistas públicas | sin cambios | sin cambios |

No se modifican Auth, OTP, perfiles, wallets, depósitos, retiros, pedidos, eventos, comercio de
cuentas, Storage, datos del catálogo ni precios.

## 4. Bloqueador de ejecución

Este entorno solo tiene acceso al canónico por API REST (publishable + service key). La API REST
**no permite ejecutar DDL/GRANT**. El `GRANT` debe aplicarse como migración desde el proyecto
Lovable que está conectado a `nklgztbukgaoycuaryzk` (el Admin Panel de referencia), o mediante un
conector con acceso al esquema.

## 5. Pruebas a repetir tras aplicar el GRANT

1. `GET /rest/v1/games_public?select=*` con publishable key → 200.
2. `GET /rest/v1/products_public?select=*` con publishable key → 200, sin campos de coste.
3. `GET /rest/v1/products?select=cost*` con publishable key → debe seguir restringido por RLS/columnas.
4. `GET /rest/v1/orders`, `/account_credentials`, `/event_rooms` con publishable key → deben seguir en 401.
5. Lectura administrativa con service key → 200.
6. `rg` sobre el código: la service key no aparece en fuentes ni en variables `VITE_*`.
