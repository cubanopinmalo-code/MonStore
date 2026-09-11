CREATE UNIQUE INDEX IF NOT EXISTS games_g2bulk_id_uq
  ON public.games (g2bulk_id)
  WHERE g2bulk_id <> '';

CREATE UNIQUE INDEX IF NOT EXISTS products_g2bulk_product_id_uq
  ON public.products (g2bulk_product_id)
  WHERE g2bulk_product_id <> '';

CREATE INDEX IF NOT EXISTS products_active_sale_idx
  ON public.products (active, sale_price);