ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS usd_margin_cup numeric NOT NULL DEFAULT 150;

UPDATE public.platform_settings SET usd_to_cup = 1000, usd_margin_cup = 150 WHERE id = true;
INSERT INTO public.platform_settings (id, usd_to_cup, usd_margin_cup)
SELECT true, 1000, 150
WHERE NOT EXISTS (SELECT 1 FROM public.platform_settings WHERE id = true);