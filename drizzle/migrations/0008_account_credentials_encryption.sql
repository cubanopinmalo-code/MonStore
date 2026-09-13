-- Fase 0.5 / migración 9: cifrado de las credenciales de cuentas publicadas.
-- Aditiva: añade columnas cifradas, no borra las columnas en claro.
-- La clave maestra vive en un esquema privado sin ningún permiso para anon ni authenticated;
-- solo la alcanzan funciones SECURITY DEFINER. Nunca viaja al frontend.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
REVOKE ALL ON SCHEMA private FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS private.crypto_keys (
  name text PRIMARY KEY,
  key_value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE private.crypto_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.crypto_keys FROM PUBLIC, anon, authenticated;

INSERT INTO private.crypto_keys (name, key_value)
SELECT 'account_credentials', encode(extensions.gen_random_bytes(32), 'hex')
WHERE NOT EXISTS (SELECT 1 FROM private.crypto_keys WHERE name = 'account_credentials');

ALTER TABLE public.game_account_secrets
  ADD COLUMN IF NOT EXISTS account_email_enc bytea,
  ADD COLUMN IF NOT EXISTS account_password_enc bytea,
  ADD COLUMN IF NOT EXISTS admin_access_notes_enc bytea;

CREATE OR REPLACE FUNCTION public.encrypt_account_credentials()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_key text;
BEGIN
  SELECT key_value INTO v_key FROM private.crypto_keys WHERE name = 'account_credentials';
  IF v_key IS NULL THEN
    RAISE EXCEPTION 'No se pudo proteger las credenciales de la cuenta.';
  END IF;
  NEW.account_email_enc := extensions.pgp_sym_encrypt(COALESCE(NEW.account_email, ''), v_key);
  NEW.account_password_enc := extensions.pgp_sym_encrypt(COALESCE(NEW.account_password, ''), v_key);
  NEW.admin_access_notes_enc := extensions.pgp_sym_encrypt(COALESCE(NEW.admin_access_notes, ''), v_key);
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.encrypt_account_credentials() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS game_account_secrets_encrypt ON public.game_account_secrets;
CREATE TRIGGER game_account_secrets_encrypt
BEFORE INSERT OR UPDATE ON public.game_account_secrets
FOR EACH ROW EXECUTE FUNCTION public.encrypt_account_credentials();

-- Backfill de las filas existentes (dispara el cifrado del trigger).
UPDATE public.game_account_secrets SET account_email = account_email;

CREATE OR REPLACE FUNCTION public.read_account_credentials(p_account uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_key text;
  v_row record;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión.';
  END IF;
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Solo el administrador puede ver estas credenciales.';
  END IF;

  SELECT * INTO v_row FROM public.game_account_secrets WHERE account_id = p_account;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT key_value INTO v_key FROM private.crypto_keys WHERE name = 'account_credentials';
  IF v_key IS NULL THEN
    RAISE EXCEPTION 'No se pudieron leer las credenciales.';
  END IF;

  RETURN jsonb_build_object(
    'account_email', extensions.pgp_sym_decrypt(v_row.account_email_enc, v_key),
    'account_password', extensions.pgp_sym_decrypt(v_row.account_password_enc, v_key),
    'admin_access_notes', extensions.pgp_sym_decrypt(v_row.admin_access_notes_enc, v_key)
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.read_account_credentials(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.read_account_credentials(uuid) TO authenticated;