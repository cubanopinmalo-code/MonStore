ALTER TABLE public.otp_limits ADD COLUMN IF NOT EXISTS block_seconds integer NOT NULL DEFAULT 28800;
UPDATE public.otp_limits SET max_per_phone_per_day = 3, block_seconds = 28800;

CREATE TABLE IF NOT EXISTS public.otp_phone_state (
  phone_e164 text PRIMARY KEY,
  request_count integer NOT NULL DEFAULT 0,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  blocked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.otp_phone_state TO service_role;

ALTER TABLE public.otp_phone_state ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_otp_phone_state_updated_at
BEFORE UPDATE ON public.otp_phone_state
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();