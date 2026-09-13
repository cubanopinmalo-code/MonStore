-- Fase 0.5 / migración 1: creación fiable de usuario.
-- Reversión (consciente): DROP TRIGGER on_auth_user_created ON auth.users;
--   Advertencia: revertir vuelve a dejar a los usuarios nuevos sin perfil, wallet ni rol.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  ref_code TEXT;
  ref_id UUID;
BEGIN
  ref_code := NEW.raw_user_meta_data ->> 'referral_code';
  IF ref_code IS NOT NULL THEN
    SELECT id INTO ref_id FROM public.profiles WHERE referral_code = upper(ref_code);
  END IF;

  INSERT INTO public.profiles (id, name, phone, referred_by)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'name', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'phone', ''),
    ref_id
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user') ON CONFLICT DO NOTHING;
  INSERT INTO public.wallets (user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;

  IF ref_id IS NOT NULL THEN
    -- Tolerancia acotada: solo errores esperados del referido.
    -- Cualquier otro error se propaga y aborta el alta, para que sea detectable.
    BEGIN
      INSERT INTO public.referrals (referrer_user_id, referred_user_id)
      VALUES (ref_id, NEW.id)
      ON CONFLICT DO NOTHING;
    EXCEPTION
      WHEN foreign_key_violation OR unique_violation THEN
        RAISE WARNING 'Referido no aplicado para el usuario % (codigo invalido o duplicado)', NEW.id;
    END;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();