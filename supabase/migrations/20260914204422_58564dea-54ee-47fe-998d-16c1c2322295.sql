-- 1) La tabla de códigos deja de ser "de prueba" y pasa a ser la definitiva.
ALTER TABLE IF EXISTS public.otp_test_challenges RENAME TO otp_challenges;

CREATE INDEX IF NOT EXISTS otp_challenges_phone_created_idx
  ON public.otp_challenges (phone_e164, created_at DESC);
CREATE INDEX IF NOT EXISTS otp_challenges_ip_created_idx
  ON public.otp_challenges (request_ip, created_at DESC);
CREATE INDEX IF NOT EXISTS otp_challenges_open_idx
  ON public.otp_challenges (phone_e164, consumed_at, created_at DESC);

-- 2) Tablas del sistema de códigos: exclusivamente servidor.
REVOKE ALL ON TABLE public.otp_challenges FROM anon, authenticated;
REVOKE ALL ON TABLE public.otp_limits     FROM anon, authenticated;
REVOKE ALL ON TABLE public.otp_sms_log    FROM anon, authenticated;
GRANT ALL ON TABLE public.otp_challenges TO service_role;
GRANT ALL ON TABLE public.otp_limits     TO service_role;
GRANT ALL ON TABLE public.otp_sms_log    TO service_role;

ALTER TABLE public.otp_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.otp_limits     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.otp_sms_log    ENABLE ROW LEVEL SECURITY;

-- 3) Comprobación de rol con privilegios controlados (evita depender de la
--    visibilidad de user_roles dentro de las políticas).
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'::app_role
  )
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;

-- 4) Alta de cuenta idempotente: perfil + rol cliente + wallet a 0 CUP.
--    Solo el servidor puede invocarla. No genera movimientos financieros.
CREATE OR REPLACE FUNCTION public.provision_user_account(
  _user_id uuid,
  _phone text,
  _referral_code text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ref_id uuid;
  created_profile boolean := false;
  created_wallet boolean := false;
  created_role boolean := false;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'user_id requerido';
  END IF;

  IF _referral_code IS NOT NULL AND length(trim(_referral_code)) > 0 THEN
    SELECT id INTO ref_id FROM public.profiles
    WHERE referral_code = upper(trim(_referral_code));
    IF ref_id = _user_id THEN ref_id := NULL; END IF;
  END IF;

  INSERT INTO public.profiles (id, name, phone, referred_by)
  VALUES (_user_id, '', COALESCE(_phone, ''), ref_id)
  ON CONFLICT (id) DO NOTHING;
  created_profile := FOUND;

  -- El teléfono es la identidad de acceso: se mantiene sincronizado.
  UPDATE public.profiles
     SET phone = COALESCE(_phone, phone)
   WHERE id = _user_id AND COALESCE(phone, '') <> COALESCE(_phone, '');

  INSERT INTO public.user_roles (user_id, role)
  VALUES (_user_id, 'user'::app_role)
  ON CONFLICT (user_id, role) DO NOTHING;
  created_role := FOUND;

  INSERT INTO public.wallets (user_id, balance, currency)
  VALUES (_user_id, 0, 'CUP')
  ON CONFLICT (user_id) DO NOTHING;
  created_wallet := FOUND;

  IF ref_id IS NOT NULL THEN
    BEGIN
      INSERT INTO public.referrals (referrer_user_id, referred_user_id)
      VALUES (ref_id, _user_id)
      ON CONFLICT DO NOTHING;
    EXCEPTION WHEN foreign_key_violation OR unique_violation THEN
      NULL;
    END;
  END IF;

  RETURN jsonb_build_object(
    'profile_created', created_profile,
    'role_created', created_role,
    'wallet_created', created_wallet,
    'referred', ref_id IS NOT NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.provision_user_account(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provision_user_account(uuid, text, text) TO service_role;