CREATE TABLE IF NOT EXISTS public.platform_settings (
  id boolean PRIMARY KEY DEFAULT true,
  usd_to_cup numeric NOT NULL DEFAULT 1150,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_settings_single_row CHECK (id),
  CONSTRAINT platform_settings_rate_positive CHECK (usd_to_cup > 0)
);

GRANT SELECT ON public.platform_settings TO authenticated;
GRANT SELECT ON public.platform_settings TO anon;
GRANT ALL ON public.platform_settings TO service_role;

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cualquiera puede leer los ajustes publicos"
  ON public.platform_settings FOR SELECT
  USING (true);

CREATE TRIGGER update_platform_settings_updated_at
  BEFORE UPDATE ON public.platform_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.platform_settings (id, usd_to_cup)
VALUES (true, 1150)
ON CONFLICT (id) DO NOTHING;

UPDATE public.products
SET sale_price = round(g2bulk_cost * 1150, 2),
    updated_at = now()
WHERE g2bulk_cost > 0;