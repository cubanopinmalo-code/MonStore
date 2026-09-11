UPDATE public.games SET active = true WHERE active = false;
UPDATE public.products SET active = true WHERE active = false;
ALTER TABLE public.games ALTER COLUMN active SET DEFAULT true;
ALTER TABLE public.products ALTER COLUMN active SET DEFAULT true;
DROP POLICY IF EXISTS games_public_read ON public.games;
CREATE POLICY games_public_read ON public.games FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS products_public_read ON public.products;
CREATE POLICY products_public_read ON public.products FOR SELECT TO public USING (true);