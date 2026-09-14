-- FASE 2.6.1 — Preparación de producción para zdSMS.
-- Estructuras SOLO SERVIDOR: sin permisos para anon ni authenticated.

CREATE TABLE IF NOT EXISTS public.otp_limits (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  code_length int NOT NULL DEFAULT 6,
  ttl_seconds int NOT NULL DEFAULT 300,
  max_attempts int NOT NULL DEFAULT 5,
  resend_cooldown_seconds int NOT NULL DEFAULT 60,
  max_per_phone_per_day int NOT NULL DEFAULT 5,
  max_per_ip_per_hour int NOT NULL DEFAULT 10,
  daily_sms_cap int,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.otp_limits (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

GRANT ALL ON public.otp_limits TO service_role;
ALTER TABLE public.otp_limits ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.otp_sms_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  phone_hash text NOT NULL,
  phone_masked text NOT NULL,
  ip_hash text,
  outcome text NOT NULL,
  provider_mode text,
  provider_message_id text,
  error_code text
);

CREATE INDEX IF NOT EXISTS otp_sms_log_created_idx ON public.otp_sms_log (created_at DESC);
CREATE INDEX IF NOT EXISTS otp_sms_log_phone_idx ON public.otp_sms_log (phone_hash, created_at DESC);

GRANT ALL ON public.otp_sms_log TO service_role;
ALTER TABLE public.otp_sms_log ENABLE ROW LEVEL SECURITY;