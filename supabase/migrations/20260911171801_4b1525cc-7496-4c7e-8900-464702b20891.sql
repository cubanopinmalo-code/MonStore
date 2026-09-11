DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT c.relname
    FROM pg_catalog.pg_class c
    WHERE c.relnamespace = 'public'::regnamespace
      AND c.relkind = 'r'
  LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', t.relname);
  END LOOP;
END $$;

GRANT SELECT ON TABLE public.games, public.products, public.game_accounts TO anon;

COMMENT ON TABLE public.games IS 'Catálogo de juegos. Lectura pública solo de activos (política RLS).';
COMMENT ON TABLE public.products IS 'Ofertas del catálogo. Lectura pública solo de activas (política RLS).';