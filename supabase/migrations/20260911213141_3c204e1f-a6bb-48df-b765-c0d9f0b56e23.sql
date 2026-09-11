ALTER TABLE public.game_accounts
  ADD COLUMN IF NOT EXISTS duration_days smallint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS publish_fee numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS listing_fee_per_day numeric NOT NULL DEFAULT 150;

DROP POLICY IF EXISTS ga_public_read_approved ON public.game_accounts;
CREATE POLICY ga_public_read_approved ON public.game_accounts
  FOR SELECT TO anon, authenticated
  USING (status = 'aprobada'::listing_status AND (expires_at IS NULL OR expires_at > now()));

CREATE OR REPLACE FUNCTION public.publish_game_account(
  p_game uuid,
  p_title text,
  p_price numeric,
  p_region text,
  p_platform text,
  p_images text[],
  p_days integer,
  p_email text,
  p_password text,
  p_notes text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_fee_day numeric;
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
  IF p_days IS NULL OR p_days < 1 OR p_days > 5 THEN
    RAISE EXCEPTION 'Elige entre 1 y 5 días de publicación.';
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

  SELECT COALESCE(listing_fee_per_day, 150) INTO v_fee_day FROM public.platform_settings LIMIT 1;
  v_fee_day := COALESCE(v_fee_day, 150);
  v_total := v_fee_day * p_days;

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

  INSERT INTO public.notifications (user_id, title, message, type, read)
  VALUES (
    v_user, 'Cuenta enviada a revisión',
    'Se descontaron ' || trim(trailing '.' FROM to_char(v_total, 'FM999999990.00')) ||
    ' CUP de tu wallet por ' || p_days || ' día(s) de publicación. Al ser aprobada, tu cuenta será publicada por las horas contratadas para que todos los que usan la app la vean. ¡Buena suerte con la venta!',
    'comercio', false
  );

  RETURN jsonb_build_object('listing_id', v_listing, 'total', v_total, 'balance', v_after, 'days', p_days);
END;
$$;

CREATE OR REPLACE FUNCTION public.review_game_account(
  p_listing uuid,
  p_approve boolean,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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

  INSERT INTO public.notifications (user_id, title, message, type, read)
  VALUES (
    v_listing.seller_id, 'Publicación rechazada',
    'Tu cuenta no fue aprobada: ' || COALESCE(NULLIF(trim(p_reason), ''), 'Datos incorrectos') ||
    '. Te devolvimos el importe de la publicación a tu wallet.', 'comercio', false
  );

  RETURN jsonb_build_object('status', 'rechazada');
END;
$$;

REVOKE ALL ON FUNCTION public.publish_game_account(uuid, text, numeric, text, text, text[], integer, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.publish_game_account(uuid, text, numeric, text, text, text[], integer, text, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.review_game_account(uuid, boolean, text) FROM public;
GRANT EXECUTE ON FUNCTION public.review_game_account(uuid, boolean, text) TO authenticated;