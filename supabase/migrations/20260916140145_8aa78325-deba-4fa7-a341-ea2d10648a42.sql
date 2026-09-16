CREATE TABLE IF NOT EXISTS public.marketplace_game_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid REFERENCES public.games(id) ON DELETE SET NULL,
  name text NOT NULL,
  regions text[] NOT NULL DEFAULT '{}',
  platforms text[] NOT NULL DEFAULT '{}',
  fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  active boolean NOT NULL DEFAULT true,
  position smallint NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.marketplace_game_configs TO authenticated;
GRANT ALL ON public.marketplace_game_configs TO service_role;

ALTER TABLE public.marketplace_game_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mgc_read_active" ON public.marketplace_game_configs;
CREATE POLICY "mgc_read_active" ON public.marketplace_game_configs
  FOR SELECT TO authenticated
  USING (active OR public.has_role(auth.uid(), 'admin'::app_role));

DROP TRIGGER IF EXISTS marketplace_game_configs_updated_at ON public.marketplace_game_configs;
CREATE TRIGGER marketplace_game_configs_updated_at
  BEFORE UPDATE ON public.marketplace_game_configs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.game_accounts
  ADD COLUMN IF NOT EXISTS config_id uuid REFERENCES public.marketplace_game_configs(id) ON DELETE SET NULL;

-- ── El administrador crea o edita un juego del comercio ─────────────────────
CREATE OR REPLACE FUNCTION public.admin_save_marketplace_game(
  p_config uuid,
  p_name text,
  p_game uuid,
  p_regions text[],
  p_platforms text[],
  p_fields jsonb,
  p_active boolean DEFAULT true,
  p_position smallint DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_admin uuid := auth.uid();
  v_name text := NULLIF(trim(COALESCE(p_name, '')), '');
  v_regions text[];
  v_platforms text[];
  v_fields jsonb := '[]'::jsonb;
  v_item jsonb;
  v_id uuid;
  v_before jsonb;
BEGIN
  IF v_admin IS NULL OR NOT public.has_role(v_admin, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Solo un administrador puede configurar el comercio de cuentas.';
  END IF;
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Escribe el nombre del juego.';
  END IF;

  SELECT array_agg(DISTINCT trim(value)) INTO v_regions
  FROM unnest(COALESCE(p_regions, '{}')) AS value
  WHERE length(trim(COALESCE(value, ''))) > 0;
  SELECT array_agg(DISTINCT trim(value)) INTO v_platforms
  FROM unnest(COALESCE(p_platforms, '{}')) AS value
  WHERE length(trim(COALESCE(value, ''))) > 0;

  v_regions := COALESCE(v_regions, '{}');
  v_platforms := COALESCE(v_platforms, '{}');
  IF array_length(v_regions, 1) IS NULL THEN
    RAISE EXCEPTION 'Añade al menos una región aceptada.';
  END IF;
  IF array_length(v_platforms, 1) IS NULL THEN
    RAISE EXCEPTION 'Añade al menos una plataforma de acceso.';
  END IF;

  IF p_fields IS NOT NULL AND jsonb_typeof(p_fields) = 'array' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_fields) LOOP
      IF length(trim(COALESCE(v_item->>'label', ''))) > 0 THEN
        v_fields := v_fields || jsonb_build_array(jsonb_build_object(
          'key', COALESCE(NULLIF(trim(COALESCE(v_item->>'key', '')), ''),
                          'campo_' || (jsonb_array_length(v_fields) + 1)::text),
          'label', trim(v_item->>'label'),
          'type', COALESCE(NULLIF(v_item->>'type', ''), 'texto'),
          'required', COALESCE((v_item->>'required')::boolean, true),
          'position', COALESCE((v_item->>'position')::int, jsonb_array_length(v_fields) + 1)
        ));
      END IF;
    END LOOP;
  END IF;

  IF jsonb_array_length(v_fields) = 0 THEN
    RAISE EXCEPTION 'Configura al menos un campo de datos de la cuenta.';
  END IF;

  IF p_config IS NULL THEN
    INSERT INTO public.marketplace_game_configs
      (game_id, name, regions, platforms, fields, active, position, created_by)
    VALUES (p_game, v_name, v_regions, v_platforms, v_fields,
            COALESCE(p_active, true), COALESCE(p_position, 0), v_admin)
    RETURNING id INTO v_id;
  ELSE
    SELECT to_jsonb(row) INTO v_before
    FROM public.marketplace_game_configs row WHERE row.id = p_config;
    IF v_before IS NULL THEN
      RAISE EXCEPTION 'Esa configuración no existe.';
    END IF;
    UPDATE public.marketplace_game_configs
    SET game_id = p_game, name = v_name, regions = v_regions, platforms = v_platforms,
        fields = v_fields, active = COALESCE(p_active, active), position = COALESCE(p_position, position)
    WHERE id = p_config;
    v_id := p_config;
  END IF;

  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, note, before, after)
  VALUES (v_admin,
          CASE WHEN p_config IS NULL THEN 'comercio_juego_creado' ELSE 'comercio_juego_actualizado' END,
          'marketplace_game_config', v_id,
          'Configuración del comercio de cuentas guardada.',
          COALESCE(v_before, '{}'::jsonb),
          jsonb_build_object('name', v_name, 'regions', v_regions, 'platforms', v_platforms,
                             'fields', v_fields, 'active', COALESCE(p_active, true)));

  RETURN jsonb_build_object('config_id', v_id);
END; $function$;

CREATE OR REPLACE FUNCTION public.admin_set_marketplace_game_active(p_config uuid, p_active boolean)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_admin uuid := auth.uid();
  v_row record;
BEGIN
  IF v_admin IS NULL OR NOT public.has_role(v_admin, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Solo un administrador puede configurar el comercio de cuentas.';
  END IF;
  SELECT * INTO v_row FROM public.marketplace_game_configs WHERE id = p_config FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Esa configuración no existe.';
  END IF;

  UPDATE public.marketplace_game_configs SET active = COALESCE(p_active, active) WHERE id = p_config;

  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, note, before, after)
  VALUES (v_admin, 'comercio_juego_estado', 'marketplace_game_config', p_config,
          'Estado del juego del comercio cambiado.',
          jsonb_build_object('active', v_row.active),
          jsonb_build_object('active', COALESCE(p_active, v_row.active)));

  RETURN jsonb_build_object('config_id', p_config, 'active', COALESCE(p_active, v_row.active));
END; $function$;

-- ── Publicación validada contra la configuración administrativa ─────────────
CREATE OR REPLACE FUNCTION public.publish_game_account_v2(
  p_config uuid,
  p_price numeric,
  p_region text,
  p_platform text,
  p_images text[],
  p_days integer,
  p_values jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_cfg record;
  v_total numeric;
  v_wallet record;
  v_before numeric;
  v_after numeric;
  v_listing uuid;
  v_name text;
  v_field jsonb;
  v_value text;
  v_notes text := '';
  v_email text := '';
  v_password text := '';
  v_region text := trim(COALESCE(p_region, ''));
  v_platform text := trim(COALESCE(p_platform, ''));
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión.';
  END IF;

  SELECT * INTO v_cfg FROM public.marketplace_game_configs WHERE id = p_config;
  IF NOT FOUND OR NOT v_cfg.active THEN
    RAISE EXCEPTION 'Ese juego no está disponible para publicar.';
  END IF;
  IF p_price IS NULL OR p_price <= 0 THEN
    RAISE EXCEPTION 'Escribe un precio válido.';
  END IF;
  IF p_images IS NULL OR array_length(p_images, 1) IS NULL THEN
    RAISE EXCEPTION 'Debes enviar al menos 1 foto de la cuenta.';
  END IF;
  IF NOT (v_region = ANY (v_cfg.regions)) THEN
    RAISE EXCEPTION 'Esa región no está autorizada para este juego.';
  END IF;
  IF NOT (v_platform = ANY (v_cfg.platforms)) THEN
    RAISE EXCEPTION 'Esa plataforma de acceso no está autorizada para este juego.';
  END IF;

  -- Solo se aceptan los campos configurados; los obligatorios deben venir completos.
  FOR v_field IN SELECT * FROM jsonb_array_elements(v_cfg.fields) LOOP
    v_value := NULLIF(trim(COALESCE(p_values->>(v_field->>'key'), '')), '');
    IF v_value IS NULL AND COALESCE((v_field->>'required')::boolean, true) THEN
      RAISE EXCEPTION 'Completa el campo "%".', v_field->>'label';
    END IF;
    IF v_value IS NOT NULL THEN
      v_notes := v_notes || (v_field->>'label') || ': ' || v_value || E'\n';
      IF v_email = '' AND (v_field->>'type') = 'correo' THEN v_email := v_value; END IF;
      IF v_password = '' AND (v_field->>'type') = 'contrasena' THEN v_password := v_value; END IF;
    END IF;
  END LOOP;

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
    seller_id, seller_name, game_id, config_id, title, description, region, platform,
    price, currency, images, status, duration_days, publish_fee
  ) VALUES (
    v_user, COALESCE(v_name, 'Vendedor'), v_cfg.game_id, v_cfg.id,
    'Cuenta en venta de ' || v_cfg.name, '', v_region, v_platform,
    p_price, 'CUP', p_images, 'pendiente', p_days, v_total
  ) RETURNING id INTO v_listing;

  INSERT INTO public.game_account_secrets (account_id, account_email, account_password, admin_access_notes)
  VALUES (v_listing, v_email, v_password, v_notes);

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
          jsonb_build_object('days', p_days, 'fee', v_total, 'config', v_cfg.id));

  INSERT INTO public.notifications (user_id, title, message, type, read)
  VALUES (
    v_user, 'Cuenta enviada a revisión',
    'Se descontaron ' || trim(trailing '.' FROM to_char(v_total, 'FM999999990.00')) ||
    ' CUP de tu wallet por ' || p_days || ' día(s) de publicación. Al ser aprobada, tu cuenta será publicada por las horas contratadas.',
    'comercio', false
  );

  RETURN jsonb_build_object('listing_id', v_listing, 'total', v_total, 'balance', v_after);
END; $function$;

REVOKE ALL ON FUNCTION public.admin_save_marketplace_game(uuid, text, uuid, text[], text[], jsonb, boolean, smallint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_marketplace_game_active(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.publish_game_account_v2(uuid, numeric, text, text, text[], integer, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_save_marketplace_game(uuid, text, uuid, text[], text[], jsonb, boolean, smallint) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_marketplace_game_active(uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.publish_game_account_v2(uuid, numeric, text, text, text[], integer, jsonb) TO authenticated, service_role;