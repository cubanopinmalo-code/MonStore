-- 1. Estados nuevos
ALTER TYPE public.listing_status ADD VALUE IF NOT EXISTS 'expirada';
ALTER TYPE public.listing_status ADD VALUE IF NOT EXISTS 'retirada';

-- 2. Configuración: comisiones por duración
ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS listing_fee_days jsonb NOT NULL DEFAULT '{}'::jsonb;

INSERT INTO public.platform_settings (id)
SELECT true WHERE NOT EXISTS (SELECT 1 FROM public.platform_settings);

-- 3. Publicaciones: venta, entrega, dinero, vencimiento y retiro
ALTER TABLE public.game_accounts
  ADD COLUMN IF NOT EXISTS buyer_id uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS sold_at timestamptz,
  ADD COLUMN IF NOT EXISTS sale_amount numeric,
  ADD COLUMN IF NOT EXISTS credentials_delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS secure_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS secure_deadline timestamptz,
  ADD COLUMN IF NOT EXISTS funds_status text NOT NULL DEFAULT 'ninguno',
  ADD COLUMN IF NOT EXISTS expired_at timestamptz,
  ADD COLUMN IF NOT EXISTS seller_data_released_at timestamptz,
  ADD COLUMN IF NOT EXISTS withdrawn_at timestamptz,
  ADD COLUMN IF NOT EXISTS withdrawn_by uuid,
  ADD COLUMN IF NOT EXISTS withdrawn_reason text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS republished_from uuid REFERENCES public.game_accounts(id);

CREATE INDEX IF NOT EXISTS game_accounts_buyer_idx ON public.game_accounts(buyer_id);
CREATE INDEX IF NOT EXISTS game_accounts_expires_idx ON public.game_accounts(expires_at);

-- 4. Datos privados: originales, finales y doble factor
ALTER TABLE public.game_account_secrets
  ADD COLUMN IF NOT EXISTS final_email text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS final_password text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS final_notes text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS final_email_enc bytea,
  ADD COLUMN IF NOT EXISTS final_password_enc bytea,
  ADD COLUMN IF NOT EXISTS final_notes_enc bytea,
  ADD COLUMN IF NOT EXISTS totp_secret text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS totp_secret_enc bytea,
  ADD COLUMN IF NOT EXISTS totp_active boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS totp_updated_at timestamptz;

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
  IF COALESCE(NEW.account_email, '') <> '' OR NEW.account_email_enc IS NULL THEN
    NEW.account_email_enc := extensions.pgp_sym_encrypt(COALESCE(NEW.account_email, ''), v_key);
  END IF;
  IF COALESCE(NEW.account_password, '') <> '' OR NEW.account_password_enc IS NULL THEN
    NEW.account_password_enc := extensions.pgp_sym_encrypt(COALESCE(NEW.account_password, ''), v_key);
  END IF;
  IF COALESCE(NEW.admin_access_notes, '') <> '' OR NEW.admin_access_notes_enc IS NULL THEN
    NEW.admin_access_notes_enc := extensions.pgp_sym_encrypt(COALESCE(NEW.admin_access_notes, ''), v_key);
  END IF;
  IF COALESCE(NEW.final_email, '') <> '' OR NEW.final_email_enc IS NULL THEN
    NEW.final_email_enc := extensions.pgp_sym_encrypt(COALESCE(NEW.final_email, ''), v_key);
  END IF;
  IF COALESCE(NEW.final_password, '') <> '' OR NEW.final_password_enc IS NULL THEN
    NEW.final_password_enc := extensions.pgp_sym_encrypt(COALESCE(NEW.final_password, ''), v_key);
  END IF;
  IF COALESCE(NEW.final_notes, '') <> '' OR NEW.final_notes_enc IS NULL THEN
    NEW.final_notes_enc := extensions.pgp_sym_encrypt(COALESCE(NEW.final_notes, ''), v_key);
  END IF;
  IF COALESCE(NEW.totp_secret, '') <> '' OR NEW.totp_secret_enc IS NULL THEN
    NEW.totp_secret_enc := extensions.pgp_sym_encrypt(COALESCE(NEW.totp_secret, ''), v_key);
  END IF;
  -- Nunca dejar los datos legibles en la tabla
  NEW.account_email := '';
  NEW.account_password := '';
  NEW.admin_access_notes := '';
  NEW.final_email := '';
  NEW.final_password := '';
  NEW.final_notes := '';
  NEW.totp_secret := '';
  RETURN NEW;
END;
$function$;

-- 5. Ventas de cuentas (retención de 8 horas)
CREATE TABLE IF NOT EXISTS public.game_account_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL UNIQUE REFERENCES public.game_accounts(id),
  buyer_id uuid NOT NULL REFERENCES auth.users(id),
  seller_id uuid NOT NULL REFERENCES auth.users(id),
  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'CUP',
  purchased_at timestamptz NOT NULL DEFAULT now(),
  release_at timestamptz NOT NULL,
  released_at timestamptz,
  status text NOT NULL DEFAULT 'retenido',
  release_error text NOT NULL DEFAULT '',
  release_attempts integer NOT NULL DEFAULT 0,
  idempotency_key text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.game_account_sales TO authenticated;
GRANT ALL ON public.game_account_sales TO service_role;
ALTER TABLE public.game_account_sales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sales_admin_all" ON public.game_account_sales;
CREATE POLICY "sales_admin_all" ON public.game_account_sales
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "sales_own_select" ON public.game_account_sales;
CREATE POLICY "sales_own_select" ON public.game_account_sales
  FOR SELECT TO authenticated
  USING (buyer_id = auth.uid() OR seller_id = auth.uid());

CREATE INDEX IF NOT EXISTS game_account_sales_release_idx ON public.game_account_sales(status, release_at);

DROP TRIGGER IF EXISTS game_account_sales_updated_at ON public.game_account_sales;
CREATE TRIGGER game_account_sales_updated_at
  BEFORE UPDATE ON public.game_account_sales
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6. Historial de la publicación
CREATE TABLE IF NOT EXISTS public.game_account_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.game_accounts(id),
  actor_id uuid,
  action text NOT NULL,
  status_before text NOT NULL DEFAULT '',
  status_after text NOT NULL DEFAULT '',
  note text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.game_account_events TO authenticated;
GRANT ALL ON public.game_account_events TO service_role;
ALTER TABLE public.game_account_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "account_events_admin_select" ON public.game_account_events;
CREATE POLICY "account_events_admin_select" ON public.game_account_events
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "account_events_own_select" ON public.game_account_events;
CREATE POLICY "account_events_own_select" ON public.game_account_events
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.game_accounts a
    WHERE a.id = account_id AND (a.seller_id = auth.uid() OR a.buyer_id = auth.uid())
  ));

CREATE INDEX IF NOT EXISTS game_account_events_account_idx ON public.game_account_events(account_id, created_at DESC);

-- 7. El comprador puede leer la publicación que compró
DROP POLICY IF EXISTS "listings_buyer_select" ON public.game_accounts;
CREATE POLICY "listings_buyer_select" ON public.game_accounts
  FOR SELECT TO authenticated
  USING (buyer_id = auth.uid());

-- 8. Comisión por duración
CREATE OR REPLACE FUNCTION public.listing_fee_for_days(p_days integer)
RETURNS numeric
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_settings record;
  v_override numeric;
BEGIN
  IF p_days IS NULL OR p_days < 1 OR p_days > 5 THEN
    RAISE EXCEPTION 'Elige entre 1 y 5 días de publicación.';
  END IF;
  SELECT listing_fee_per_day, listing_fee_days INTO v_settings FROM public.platform_settings LIMIT 1;
  v_override := NULLIF(COALESCE(v_settings.listing_fee_days, '{}'::jsonb) ->> p_days::text, '')::numeric;
  IF v_override IS NOT NULL AND v_override >= 0 THEN
    RETURN v_override;
  END IF;
  RETURN COALESCE(v_settings.listing_fee_per_day, 150) * p_days;
END;
$$;

GRANT EXECUTE ON FUNCTION public.listing_fee_for_days(integer) TO anon, authenticated, service_role;

-- 9. Publicar (reutiliza la comisión por duración y registra historial)
CREATE OR REPLACE FUNCTION public.publish_game_account(
  p_game uuid, p_title text, p_price numeric, p_region text, p_platform text,
  p_images text[], p_days integer, p_email text, p_password text, p_notes text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_total numeric;
  v_wallet record;
  v_before numeric;
  v_after numeric;
  v_listing uuid;
  v_name text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión.';
  END IF;
  IF p_game IS NULL THEN
    RAISE EXCEPTION 'Selecciona el juego.';
  END IF;
  IF p_price IS NULL OR p_price <= 0 THEN
    RAISE EXCEPTION 'Escribe un precio válido.';
  END IF;
  IF p_images IS NULL OR array_length(p_images, 1) IS NULL THEN
    RAISE EXCEPTION 'Debes enviar al menos 1 foto de la cuenta.';
  END IF;
  IF p_region IS NULL OR length(trim(p_region)) = 0
     OR p_platform IS NULL OR length(trim(p_platform)) = 0 THEN
    RAISE EXCEPTION 'Completa la región y la plataforma de acceso.';
  END IF;
  IF p_email IS NULL OR length(trim(p_email)) = 0
     OR p_password IS NULL OR length(trim(p_password)) = 0 THEN
    RAISE EXCEPTION 'Completa el correo y la contraseña de la cuenta.';
  END IF;

  v_total := public.listing_fee_for_days(p_days);

  SELECT * INTO v_wallet FROM public.wallets WHERE user_id = v_user FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No encontramos tu wallet.';
  END IF;
  IF v_wallet.status <> 'activa' THEN
    RAISE EXCEPTION 'Tu wallet está bloqueada. Escribe al administrador.';
  END IF;

  v_before := v_wallet.balance;
  v_after := v_before - v_total;
  IF v_after < 0 THEN
    RAISE EXCEPTION 'No tienes saldo suficiente para publicar (% CUP).', trim(trailing '.' FROM to_char(v_total, 'FM999999990.00'));
  END IF;

  SELECT COALESCE(name, 'Vendedor') INTO v_name FROM public.profiles WHERE id = v_user;

  INSERT INTO public.game_accounts (
    seller_id, seller_name, game_id, title, description, region, platform,
    price, currency, images, status, duration_days, publish_fee
  ) VALUES (
    v_user, COALESCE(v_name, 'Vendedor'), p_game, COALESCE(NULLIF(trim(p_title), ''), 'Cuenta en venta'),
    '', trim(p_region), trim(p_platform), p_price, 'CUP', p_images, 'pendiente', p_days, v_total
  )
  RETURNING id INTO v_listing;

  INSERT INTO public.game_account_secrets (account_id, account_email, account_password, admin_access_notes)
  VALUES (v_listing, trim(p_email), p_password, COALESCE(p_notes, ''));

  UPDATE public.wallets SET balance = v_after, updated_at = now() WHERE id = v_wallet.id;

  INSERT INTO public.wallet_transactions (
    wallet_id, user_id, type, amount, balance_before, balance_after,
    reference_type, reference_id, description, status
  ) VALUES (
    v_wallet.id, v_user, 'publicacion', -v_total, v_before, v_after,
    'game_account', v_listing,
    'Publicación de cuenta por ' || p_days || ' día(s)', 'completado'
  );

  INSERT INTO public.game_account_events (account_id, actor_id, action, status_after, note, metadata)
  VALUES (v_listing, v_user, 'publicacion_creada', 'pendiente', 'Solicitud enviada y comisión cobrada',
          jsonb_build_object('days', p_days, 'fee', v_total));

  INSERT INTO public.notifications (user_id, title, message, type, read)
  VALUES (
    v_user, 'Cuenta enviada a revisión',
    'Se descontaron ' || trim(trailing '.' FROM to_char(v_total, 'FM999999990.00')) ||
    ' CUP de tu wallet por ' || p_days || ' día(s) de publicación. Al ser aprobada, tu cuenta será publicada por las horas contratadas.',
    'comercio', false
  );

  RETURN jsonb_build_object('listing_id', v_listing, 'total', v_total, 'balance', v_after);
END;
$function$;

-- 10. Aprobar / rechazar: añade historial
CREATE OR REPLACE FUNCTION public.review_game_account(p_listing uuid, p_approve boolean, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_admin uuid := auth.uid();
  v_listing record;
  v_wallet record;
  v_before numeric;
  v_after numeric;
  v_expires timestamptz;
BEGIN
  IF v_admin IS NULL OR NOT public.has_role(v_admin, 'admin') THEN
    RAISE EXCEPTION 'Solo el administrador puede revisar publicaciones.';
  END IF;

  SELECT * INTO v_listing FROM public.game_accounts WHERE id = p_listing FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No encontramos la publicación.';
  END IF;
  IF v_listing.status <> 'pendiente' THEN
    RAISE EXCEPTION 'Esta publicación ya fue revisada.';
  END IF;

  IF p_approve THEN
    v_expires := now() + make_interval(hours => v_listing.duration_days * 24);
    UPDATE public.game_accounts
    SET status = 'aprobada', published_at = now(), expires_at = v_expires,
        rejection_reason = NULL, updated_at = now()
    WHERE id = p_listing;

    INSERT INTO public.game_account_events (account_id, actor_id, action, status_before, status_after, note)
    VALUES (p_listing, v_admin, 'publicacion_aprobada', 'pendiente', 'aprobada', 'Publicada por las horas contratadas');

    INSERT INTO public.notifications (user_id, title, message, type, read)
    VALUES (
      v_listing.seller_id, 'Publicación aprobada',
      'Tu cuenta ya está publicada en el comercio por ' || (v_listing.duration_days * 24) ||
      ' horas. ¡Buena suerte con la venta!', 'comercio', false
    );

    RETURN jsonb_build_object('status', 'aprobada', 'expires_at', v_expires);
  END IF;

  UPDATE public.game_accounts
  SET status = 'rechazada', rejection_reason = COALESCE(NULLIF(trim(p_reason), ''), 'Datos incorrectos'),
      updated_at = now()
  WHERE id = p_listing;

  IF v_listing.publish_fee > 0 THEN
    SELECT * INTO v_wallet FROM public.wallets WHERE user_id = v_listing.seller_id FOR UPDATE;
    IF FOUND THEN
      v_before := v_wallet.balance;
      v_after := v_before + v_listing.publish_fee;
      UPDATE public.wallets SET balance = v_after, updated_at = now() WHERE id = v_wallet.id;
      INSERT INTO public.wallet_transactions (
        wallet_id, user_id, type, amount, balance_before, balance_after,
        reference_type, reference_id, description, status
      ) VALUES (
        v_wallet.id, v_listing.seller_id, 'reembolso', v_listing.publish_fee, v_before, v_after,
        'game_account', p_listing, 'Devolución por publicación rechazada', 'completado'
      );
    END IF;
  END IF;

  INSERT INTO public.game_account_events (account_id, actor_id, action, status_before, status_after, note)
  VALUES (p_listing, v_admin, 'publicacion_rechazada', 'pendiente', 'rechazada',
          COALESCE(NULLIF(trim(p_reason), ''), 'Datos incorrectos'));

  INSERT INTO public.notifications (user_id, title, message, type, read)
  VALUES (
    v_listing.seller_id, 'Publicación rechazada',
    'Tu cuenta no fue aprobada: ' || COALESCE(NULLIF(trim(p_reason), ''), 'Datos incorrectos') ||
    '. Te devolvimos el importe de la publicación a tu wallet.', 'comercio', false
  );

  RETURN jsonb_build_object('status', 'rechazada');
END;
$function$;

-- 11. Edición administrativa de la publicación
CREATE OR REPLACE FUNCTION public.admin_update_listing(
  p_listing uuid, p_title text, p_description text, p_price numeric,
  p_region text, p_platform text, p_game uuid, p_images text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_admin uuid := auth.uid();
BEGIN
  IF v_admin IS NULL OR NOT public.has_role(v_admin, 'admin') THEN
    RAISE EXCEPTION 'Solo el administrador puede editar publicaciones.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.game_accounts WHERE id = p_listing AND buyer_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Esta cuenta ya fue vendida y no se puede editar.';
  END IF;

  UPDATE public.game_accounts
  SET title = COALESCE(NULLIF(trim(p_title), ''), title),
      description = COALESCE(p_description, description),
      price = COALESCE(NULLIF(p_price, 0), price),
      region = COALESCE(NULLIF(trim(p_region), ''), region),
      platform = COALESCE(NULLIF(trim(p_platform), ''), platform),
      game_id = COALESCE(p_game, game_id),
      images = COALESCE(NULLIF(p_images, '{}'::text[]), images),
      updated_at = now()
  WHERE id = p_listing;

  INSERT INTO public.game_account_events (account_id, actor_id, action, note)
  VALUES (p_listing, v_admin, 'publicacion_editada', 'Datos públicos corregidos por administración');

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- 12. Datos finales y doble factor de la cuenta del juego
CREATE OR REPLACE FUNCTION public.admin_set_listing_secrets(
  p_listing uuid, p_final_email text, p_final_password text, p_final_notes text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_admin uuid := auth.uid();
BEGIN
  IF v_admin IS NULL OR NOT public.has_role(v_admin, 'admin') THEN
    RAISE EXCEPTION 'Solo el administrador puede fijar estos datos.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.game_account_secrets WHERE account_id = p_listing) THEN
    RAISE EXCEPTION 'Esta publicación no tiene datos guardados.';
  END IF;

  UPDATE public.game_account_secrets
  SET final_email = COALESCE(p_final_email, ''),
      final_password = COALESCE(p_final_password, ''),
      final_notes = COALESCE(p_final_notes, '')
  WHERE account_id = p_listing;

  INSERT INTO public.game_account_events (account_id, actor_id, action, note)
  VALUES (p_listing, v_admin, 'credenciales_finales_actualizadas', 'Correo y contraseña finales guardados cifrados');

  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_listing_totp(
  p_listing uuid, p_secret text, p_active boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_admin uuid := auth.uid();
BEGIN
  IF v_admin IS NULL OR NOT public.has_role(v_admin, 'admin') THEN
    RAISE EXCEPTION 'Solo el administrador puede configurar el doble factor.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.game_account_secrets WHERE account_id = p_listing) THEN
    RAISE EXCEPTION 'Esta publicación no tiene datos guardados.';
  END IF;

  UPDATE public.game_account_secrets
  SET totp_secret = COALESCE(p_secret, ''),
      totp_active = COALESCE(p_active, false),
      totp_updated_at = now()
  WHERE account_id = p_listing;

  INSERT INTO public.game_account_events (account_id, actor_id, action, note)
  VALUES (p_listing, v_admin, 'doble_factor_actualizado',
          CASE WHEN COALESCE(p_active, false) THEN 'Doble factor activado' ELSE 'Doble factor desactivado' END);

  RETURN jsonb_build_object('ok', true, 'active', COALESCE(p_active, false));
END;
$$;

-- 13. Lectura de datos privados según identidad, rol y propiedad
CREATE OR REPLACE FUNCTION public.read_listing_secrets(p_account uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_key text;
  v_row record;
  v_listing record;
  v_role text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión.';
  END IF;

  SELECT * INTO v_listing FROM public.game_accounts WHERE id = p_account;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No encontramos la publicación.';
  END IF;

  IF public.has_role(v_user, 'admin') THEN
    v_role := 'admin';
  ELSIF v_listing.buyer_id = v_user THEN
    v_role := 'comprador';
  ELSIF v_listing.seller_id = v_user
        AND v_listing.buyer_id IS NULL
        AND v_listing.status::text IN ('expirada', 'retirada') THEN
    v_role := 'vendedor';
  ELSE
    RAISE EXCEPTION 'No tienes acceso a los datos de esta cuenta.';
  END IF;

  SELECT * INTO v_row FROM public.game_account_secrets WHERE account_id = p_account;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('viewer', v_role);
  END IF;

  SELECT key_value INTO v_key FROM private.crypto_keys WHERE name = 'account_credentials';
  IF v_key IS NULL THEN
    RAISE EXCEPTION 'No se pudieron leer las credenciales.';
  END IF;

  RETURN jsonb_strip_nulls(jsonb_build_object(
    'viewer', v_role,
    'listing_status', v_listing.status::text,
    'original_email', CASE WHEN v_role = 'admin'
      THEN extensions.pgp_sym_decrypt(v_row.account_email_enc, v_key) END,
    'original_password', CASE WHEN v_role = 'admin'
      THEN extensions.pgp_sym_decrypt(v_row.account_password_enc, v_key) END,
    'access_notes', extensions.pgp_sym_decrypt(v_row.admin_access_notes_enc, v_key),
    'final_email', COALESCE(NULLIF(extensions.pgp_sym_decrypt(COALESCE(v_row.final_email_enc, v_row.account_email_enc), v_key), ''),
                            extensions.pgp_sym_decrypt(v_row.account_email_enc, v_key)),
    'final_password', COALESCE(NULLIF(extensions.pgp_sym_decrypt(COALESCE(v_row.final_password_enc, v_row.account_password_enc), v_key), ''),
                            extensions.pgp_sym_decrypt(v_row.account_password_enc, v_key)),
    'final_notes', extensions.pgp_sym_decrypt(COALESCE(v_row.final_notes_enc, v_row.admin_access_notes_enc), v_key),
    'totp_secret', NULLIF(extensions.pgp_sym_decrypt(COALESCE(v_row.totp_secret_enc, extensions.pgp_sym_encrypt('', v_key)), v_key), ''),
    'totp_active', v_row.totp_active,
    'secure_deadline', v_listing.secure_deadline,
    'sold_at', v_listing.sold_at
  ));
END;
$$;

-- 14. Compra atómica con retención de 8 horas y entrega inmediata
CREATE OR REPLACE FUNCTION public.buy_game_account(p_listing uuid, p_idempotency text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_buyer uuid := auth.uid();
  v_listing record;
  v_wallet record;
  v_before numeric;
  v_after numeric;
  v_sale record;
  v_release timestamptz;
  v_deadline timestamptz;
  v_key text := COALESCE(NULLIF(trim(p_idempotency), ''), 'buy:' || p_listing::text || ':' || COALESCE(auth.uid()::text, ''));
BEGIN
  IF v_buyer IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión.';
  END IF;

  SELECT * INTO v_sale FROM public.game_account_sales WHERE idempotency_key = v_key;
  IF FOUND THEN
    RETURN jsonb_build_object('sale_id', v_sale.id, 'listing_id', v_sale.listing_id,
                              'already', true, 'release_at', v_sale.release_at);
  END IF;

  SELECT * INTO v_listing FROM public.game_accounts WHERE id = p_listing FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No encontramos la publicación.';
  END IF;
  IF v_listing.buyer_id IS NOT NULL OR v_listing.status::text <> 'aprobada' THEN
    RAISE EXCEPTION 'Esta cuenta ya no está disponible.';
  END IF;
  IF v_listing.expires_at IS NOT NULL AND v_listing.expires_at <= now() THEN
    RAISE EXCEPTION 'La publicación venció y ya no se puede comprar.';
  END IF;
  IF v_listing.seller_id = v_buyer THEN
    RAISE EXCEPTION 'No puedes comprar tu propia cuenta.';
  END IF;

  SELECT * INTO v_wallet FROM public.wallets WHERE user_id = v_buyer FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No encontramos tu wallet.';
  END IF;
  IF v_wallet.status <> 'activa' THEN
    RAISE EXCEPTION 'Tu wallet está bloqueada. Escribe al administrador.';
  END IF;

  v_before := v_wallet.balance;
  v_after := v_before - v_listing.price;
  IF v_after < 0 THEN
    RAISE EXCEPTION 'No tienes saldo suficiente para esta compra.';
  END IF;

  v_release := now() + interval '8 hours';
  v_deadline := now() + interval '24 hours';

  UPDATE public.wallets
  SET balance = v_after, held_balance = held_balance + v_listing.price, updated_at = now()
  WHERE id = v_wallet.id;

  INSERT INTO public.wallet_transactions (
    wallet_id, user_id, type, amount, balance_before, balance_after,
    reference_type, reference_id, description, status, idempotency_key
  ) VALUES (
    v_wallet.id, v_buyer, 'compra_cuenta', -v_listing.price, v_before, v_after,
    'game_account', p_listing, 'Compra de cuenta: ' || v_listing.title, 'completado', v_key
  );

  INSERT INTO public.game_account_sales (
    listing_id, buyer_id, seller_id, amount, currency, purchased_at, release_at, status, idempotency_key
  ) VALUES (
    p_listing, v_buyer, v_listing.seller_id, v_listing.price, COALESCE(v_listing.currency, 'CUP'),
    now(), v_release, 'retenido', v_key
  ) RETURNING * INTO v_sale;

  UPDATE public.game_accounts
  SET status = 'vendida', buyer_id = v_buyer, sold_at = now(), sale_amount = v_listing.price,
      credentials_delivered_at = now(), secure_started_at = now(), secure_deadline = v_deadline,
      funds_status = 'retenido', updated_at = now()
  WHERE id = p_listing;

  INSERT INTO public.game_account_events (account_id, actor_id, action, status_before, status_after, note, metadata)
  VALUES (p_listing, v_buyer, 'cuenta_vendida', 'aprobada', 'vendida', 'Compra completada y datos entregados',
          jsonb_build_object('sale_id', v_sale.id, 'amount', v_listing.price, 'release_at', v_release));

  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, amount, target_user_id, note, metadata)
  VALUES (v_buyer, 'compra_cuenta', 'game_account', p_listing, v_listing.price, v_listing.seller_id,
          'Compra de cuenta con pago retenido 8 horas',
          jsonb_build_object('sale_id', v_sale.id, 'release_at', v_release));

  INSERT INTO public.notifications (user_id, title, message, type, read)
  VALUES (
    v_listing.seller_id, 'Tu cuenta fue vendida',
    'Vendiste "' || v_listing.title || '" por ' || trim(trailing '.' FROM to_char(v_listing.price, 'FM999999990.00')) ||
    ' CUP. El pago está retenido y se acreditará a tu wallet en 8 horas.', 'comercio', false
  ),
  (
    v_buyer, 'Compra completada',
    'La cuenta "' || v_listing.title || '" ya es tuya. Tienes 24 horas para asegurarla: los datos de acceso y el doble factor están en tu área privada.',
    'comercio', false
  );

  RETURN jsonb_build_object('sale_id', v_sale.id, 'listing_id', p_listing, 'amount', v_listing.price,
                            'release_at', v_release, 'secure_deadline', v_deadline, 'balance', v_after);
END;
$$;

-- 15. Liberación del pago al vendedor (idempotente)
CREATE OR REPLACE FUNCTION public.release_account_sale(p_sale uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_sale record;
  v_buyer_wallet record;
  v_seller_wallet record;
  v_before numeric;
  v_after numeric;
BEGIN
  IF v_actor IS NOT NULL AND NOT public.has_role(v_actor, 'admin') THEN
    RAISE EXCEPTION 'Solo el administrador puede liberar pagos.';
  END IF;

  SELECT * INTO v_sale FROM public.game_account_sales WHERE id = p_sale FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No encontramos la venta.';
  END IF;
  IF v_sale.status = 'liberado' THEN
    RETURN jsonb_build_object('status', 'liberado', 'already', true);
  END IF;

  SELECT * INTO v_buyer_wallet FROM public.wallets WHERE user_id = v_sale.buyer_id FOR UPDATE;
  IF FOUND THEN
    UPDATE public.wallets
    SET held_balance = GREATEST(held_balance - v_sale.amount, 0), updated_at = now()
    WHERE id = v_buyer_wallet.id;
  END IF;

  SELECT * INTO v_seller_wallet FROM public.wallets WHERE user_id = v_sale.seller_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El vendedor no tiene wallet activa.';
  END IF;

  v_before := v_seller_wallet.balance;
  v_after := v_before + v_sale.amount;
  UPDATE public.wallets SET balance = v_after, updated_at = now() WHERE id = v_seller_wallet.id;

  INSERT INTO public.wallet_transactions (
    wallet_id, user_id, type, amount, balance_before, balance_after,
    reference_type, reference_id, description, status, idempotency_key
  ) VALUES (
    v_seller_wallet.id, v_sale.seller_id, 'venta_cuenta', v_sale.amount, v_before, v_after,
    'game_account_sale', v_sale.id, 'Pago de venta de cuenta liberado', 'completado',
    'release:' || v_sale.id::text
  );

  UPDATE public.game_account_sales
  SET status = 'liberado', released_at = now(), release_error = '',
      release_attempts = release_attempts + 1
  WHERE id = p_sale;

  UPDATE public.game_accounts SET funds_status = 'liberado', updated_at = now()
  WHERE id = v_sale.listing_id;

  INSERT INTO public.game_account_events (account_id, actor_id, action, note, metadata)
  VALUES (v_sale.listing_id, v_actor, 'fondos_liberados', 'Pago acreditado al vendedor',
          jsonb_build_object('sale_id', v_sale.id, 'amount', v_sale.amount));

  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, amount, target_user_id, note, metadata)
  VALUES (v_actor, 'liberacion_venta_cuenta', 'game_account_sale', v_sale.id, v_sale.amount, v_sale.seller_id,
          'Liberación del pago de una venta de cuenta', jsonb_build_object('listing_id', v_sale.listing_id));

  INSERT INTO public.notifications (user_id, title, message, type, read)
  VALUES (
    v_sale.seller_id, 'Pago de tu venta acreditado',
    'Ya acreditamos ' || trim(trailing '.' FROM to_char(v_sale.amount, 'FM999999990.00')) ||
    ' CUP en tu wallet por la venta de tu cuenta.', 'comercio', false
  );

  RETURN jsonb_build_object('status', 'liberado', 'amount', v_sale.amount);
END;
$$;

-- 16. Proceso automático: libera todas las ventas vencidas
CREATE OR REPLACE FUNCTION public.process_due_account_sales()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_row record;
  v_released integer := 0;
  v_failed integer := 0;
BEGIN
  IF v_actor IS NOT NULL AND NOT public.has_role(v_actor, 'admin') THEN
    RAISE EXCEPTION 'No tienes permiso para esta operación.';
  END IF;

  FOR v_row IN
    SELECT id FROM public.game_account_sales
    WHERE status IN ('retenido', 'pendiente_liberacion') AND release_at <= now()
    ORDER BY release_at
    LIMIT 200
  LOOP
    BEGIN
      PERFORM public.release_account_sale(v_row.id);
      v_released := v_released + 1;
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
      UPDATE public.game_account_sales
      SET status = 'pendiente_liberacion', release_error = SQLERRM,
          release_attempts = release_attempts + 1
      WHERE id = v_row.id;
      UPDATE public.game_accounts SET funds_status = 'pendiente_liberacion', updated_at = now()
      WHERE id = (SELECT listing_id FROM public.game_account_sales WHERE id = v_row.id);
    END;
  END LOOP;

  RETURN jsonb_build_object('released', v_released, 'failed', v_failed);
END;
$$;

-- 17. Vencimiento sin comprador: la cuenta vuelve al vendedor
CREATE OR REPLACE FUNCTION public.expire_due_listings()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_row record;
  v_count integer := 0;
BEGIN
  IF v_actor IS NOT NULL AND NOT public.has_role(v_actor, 'admin') THEN
    RAISE EXCEPTION 'No tienes permiso para esta operación.';
  END IF;

  FOR v_row IN
    SELECT id, seller_id, title FROM public.game_accounts
    WHERE status::text = 'aprobada' AND buyer_id IS NULL
      AND expires_at IS NOT NULL AND expires_at <= now()
    LIMIT 500
  LOOP
    UPDATE public.game_accounts
    SET status = 'expirada', expired_at = now(), seller_data_released_at = now(), updated_at = now()
    WHERE id = v_row.id;

    INSERT INTO public.game_account_events (account_id, action, status_before, status_after, note)
    VALUES (v_row.id, 'publicacion_expirada', 'aprobada', 'expirada',
            'Venció sin comprador: los datos actuales vuelven al vendedor');

    INSERT INTO public.notifications (user_id, title, message, type, read)
    VALUES (v_row.seller_id, 'Tu publicación venció sin venta',
            'La publicación "' || v_row.title || '" salió del comercio porque nadie la compró. Ya puedes ver los datos actuales de la cuenta, asegurarla y volver a publicarla pagando la comisión.',
            'comercio', false);

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('expired', v_count);
END;
$$;

-- 18. Retirar publicación (solo activa y no vendida)
CREATE OR REPLACE FUNCTION public.withdraw_listing(p_listing uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_listing record;
BEGIN
  IF v_admin IS NULL OR NOT public.has_role(v_admin, 'admin') THEN
    RAISE EXCEPTION 'Solo el administrador puede retirar publicaciones.';
  END IF;

  SELECT * INTO v_listing FROM public.game_accounts WHERE id = p_listing FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No encontramos la publicación.';
  END IF;
  IF v_listing.buyer_id IS NOT NULL OR v_listing.status::text = 'vendida' THEN
    RAISE EXCEPTION 'Esta cuenta ya fue vendida: pertenece al comprador y no se puede retirar.';
  END IF;
  IF v_listing.status::text NOT IN ('aprobada', 'pendiente') THEN
    RAISE EXCEPTION 'Solo se puede retirar una publicación activa.';
  END IF;

  UPDATE public.game_accounts
  SET status = 'retirada', withdrawn_at = now(), withdrawn_by = v_admin,
      withdrawn_reason = COALESCE(NULLIF(trim(p_reason), ''), 'Retirada por administración'),
      seller_data_released_at = now(), updated_at = now()
  WHERE id = p_listing;

  INSERT INTO public.game_account_events (account_id, actor_id, action, status_before, status_after, note)
  VALUES (p_listing, v_admin, 'publicacion_retirada', v_listing.status::text, 'retirada',
          COALESCE(NULLIF(trim(p_reason), ''), 'Retirada por administración'));

  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, target_user_id, note)
  VALUES (v_admin, 'retiro_publicacion', 'game_account', p_listing, v_listing.seller_id,
          COALESCE(NULLIF(trim(p_reason), ''), 'Retirada por administración'));

  INSERT INTO public.notifications (user_id, title, message, type, read)
  VALUES (v_listing.seller_id, 'Publicación retirada',
          'Tu publicación "' || v_listing.title || '" fue retirada del comercio: ' ||
          COALESCE(NULLIF(trim(p_reason), ''), 'decisión de administración') ||
          '. Ya puedes ver los datos actuales de la cuenta y volver a publicarla.', 'comercio', false);

  RETURN jsonb_build_object('status', 'retirada');
END;
$$;

-- 19. Republicar una publicación vencida o retirada sin comprador
CREATE OR REPLACE FUNCTION public.republish_game_account(
  p_listing uuid, p_title text, p_price numeric, p_days integer,
  p_images text[], p_description text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_old record;
  v_secrets record;
  v_key text;
  v_total numeric;
  v_wallet record;
  v_before numeric;
  v_after numeric;
  v_new uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión.';
  END IF;

  SELECT * INTO v_old FROM public.game_accounts WHERE id = p_listing FOR UPDATE;
  IF NOT FOUND OR v_old.seller_id <> v_user THEN
    RAISE EXCEPTION 'No encontramos tu publicación.';
  END IF;
  IF v_old.buyer_id IS NOT NULL THEN
    RAISE EXCEPTION 'Esta cuenta fue vendida y pertenece al comprador.';
  END IF;
  IF v_old.status::text NOT IN ('expirada', 'retirada', 'rechazada') THEN
    RAISE EXCEPTION 'Solo puedes volver a publicar una cuenta que ya salió del comercio.';
  END IF;

  v_total := public.listing_fee_for_days(p_days);

  SELECT * INTO v_wallet FROM public.wallets WHERE user_id = v_user FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No encontramos tu wallet.';
  END IF;
  v_before := v_wallet.balance;
  v_after := v_before - v_total;
  IF v_after < 0 THEN
    RAISE EXCEPTION 'No tienes saldo suficiente para volver a publicar.';
  END IF;

  INSERT INTO public.game_accounts (
    seller_id, seller_name, game_id, title, description, region, platform,
    price, currency, images, status, duration_days, publish_fee, republished_from
  ) VALUES (
    v_user, v_old.seller_name, v_old.game_id,
    COALESCE(NULLIF(trim(p_title), ''), v_old.title),
    COALESCE(p_description, v_old.description), v_old.region, v_old.platform,
    COALESCE(NULLIF(p_price, 0), v_old.price), COALESCE(v_old.currency, 'CUP'),
    COALESCE(NULLIF(p_images, '{}'::text[]), v_old.images),
    'pendiente', p_days, v_total, p_listing
  ) RETURNING id INTO v_new;

  SELECT key_value INTO v_key FROM private.crypto_keys WHERE name = 'account_credentials';
  SELECT * INTO v_secrets FROM public.game_account_secrets WHERE account_id = p_listing;
  IF FOUND AND v_key IS NOT NULL THEN
    INSERT INTO public.game_account_secrets (account_id, account_email, account_password, admin_access_notes)
    VALUES (
      v_new,
      extensions.pgp_sym_decrypt(COALESCE(v_secrets.final_email_enc, v_secrets.account_email_enc), v_key),
      extensions.pgp_sym_decrypt(COALESCE(v_secrets.final_password_enc, v_secrets.account_password_enc), v_key),
      extensions.pgp_sym_decrypt(COALESCE(v_secrets.final_notes_enc, v_secrets.admin_access_notes_enc), v_key)
    );
  ELSE
    INSERT INTO public.game_account_secrets (account_id, account_email, account_password, admin_access_notes)
    VALUES (v_new, '', '', '');
  END IF;

  UPDATE public.wallets SET balance = v_after, updated_at = now() WHERE id = v_wallet.id;

  INSERT INTO public.wallet_transactions (
    wallet_id, user_id, type, amount, balance_before, balance_after,
    reference_type, reference_id, description, status
  ) VALUES (
    v_wallet.id, v_user, 'publicacion', -v_total, v_before, v_after,
    'game_account', v_new, 'Nueva publicación de cuenta por ' || p_days || ' día(s)', 'completado'
  );

  INSERT INTO public.game_account_events (account_id, actor_id, action, status_after, note, metadata)
  VALUES (v_new, v_user, 'publicacion_republicada', 'pendiente', 'Republicada por el vendedor',
          jsonb_build_object('from', p_listing, 'days', p_days, 'fee', v_total));

  RETURN jsonb_build_object('listing_id', v_new, 'total', v_total, 'balance', v_after);
END;
$$;

GRANT EXECUTE ON FUNCTION public.buy_game_account(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.release_account_sale(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.process_due_account_sales() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.expire_due_listings() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.withdraw_listing(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.republish_game_account(uuid, text, numeric, integer, text[], text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.read_listing_secrets(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_update_listing(uuid, text, text, numeric, text, text, uuid, text[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_listing_secrets(uuid, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_listing_totp(uuid, text, boolean) TO authenticated, service_role;

ALTER PUBLICATION supabase_realtime ADD TABLE public.game_account_sales;
ALTER PUBLICATION supabase_realtime ADD TABLE public.game_account_events;
ALTER TABLE public.game_account_sales REPLICA IDENTITY FULL;
ALTER TABLE public.game_account_events REPLICA IDENTITY FULL;