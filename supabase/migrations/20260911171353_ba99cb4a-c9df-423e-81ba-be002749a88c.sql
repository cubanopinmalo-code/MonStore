-- 1. Catálogo: el público solo ve juegos y productos activos
DROP POLICY IF EXISTS games_public_read ON public.games;
CREATE POLICY games_public_read ON public.games
  FOR SELECT TO public USING (active = true);

DROP POLICY IF EXISTS products_public_read ON public.products;
CREATE POLICY products_public_read ON public.products
  FOR SELECT TO public USING (active = true);

-- 2. Un único nombre de página por juego
CREATE UNIQUE INDEX IF NOT EXISTS games_slug_uq ON public.games (slug);
CREATE INDEX IF NOT EXISTS products_game_active_idx ON public.products (game_id, active);

-- 3. Imágenes del catálogo (bucket privado "catalog")
CREATE POLICY catalog_read ON storage.objects
  FOR SELECT TO public USING (bucket_id = 'catalog');

CREATE POLICY catalog_admin_insert ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'catalog' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY catalog_admin_update ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'catalog' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY catalog_admin_delete ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'catalog' AND public.has_role(auth.uid(), 'admin'));