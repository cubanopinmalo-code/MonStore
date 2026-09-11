ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS saldo_conversion_rate numeric NOT NULL DEFAULT 2.8;