ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS g2bulk_purchases_enabled boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.admin_update_platform_settings(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_admin uuid := auth.uid();
  v_before public.platform_settings;
  v_after public.platform_settings;
  v_num numeric;
  v_key text;
  v_changes jsonb := '{}'::jsonb;
BEGIN
  IF v_admin IS NULL OR NOT public.has_role(v_admin, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Solo un administrador puede cambiar la configuración.';
  END IF;

  SELECT * INTO v_before FROM public.platform_settings LIMIT 1;
  IF NOT FOUND THEN
    INSERT INTO public.platform_settings (id) VALUES (true);
    SELECT * INTO v_before FROM public.platform_settings LIMIT 1;
  END IF;

  FOR v_key IN SELECT jsonb_object_keys(p_payload) LOOP
    IF v_key IN ('usd_to_cup','usd_margin_cup','saldo_conversion_rate','withdrawal_fee_pct',
                 'listing_fee_per_day','min_deposit_cup','min_withdrawal_cup','referral_reward_cup') THEN
      v_num := NULLIF(p_payload ->> v_key, '')::numeric;
      IF v_num IS NULL THEN
        RAISE EXCEPTION 'El valor de % no puede quedar vacío.', v_key;
      END IF;
      IF v_num < 0 THEN
        RAISE EXCEPTION 'El valor de % no puede ser negativo.', v_key;
      END IF;
      IF v_key = 'withdrawal_fee_pct' AND v_num > 100 THEN
        RAISE EXCEPTION 'La comisión de retiro debe estar entre 0 y 100.';
      END IF;
    END IF;
  END LOOP;

  UPDATE public.platform_settings SET
    usd_to_cup = COALESCE(NULLIF(p_payload ->> 'usd_to_cup','')::numeric, usd_to_cup),
    usd_margin_cup = COALESCE(NULLIF(p_payload ->> 'usd_margin_cup','')::numeric, usd_margin_cup),
    saldo_conversion_rate = COALESCE(NULLIF(p_payload ->> 'saldo_conversion_rate','')::numeric, saldo_conversion_rate),
    withdrawal_fee_pct = COALESCE(NULLIF(p_payload ->> 'withdrawal_fee_pct','')::numeric, withdrawal_fee_pct),
    listing_fee_per_day = COALESCE(NULLIF(p_payload ->> 'listing_fee_per_day','')::numeric, listing_fee_per_day),
    listing_fee_days = COALESCE(p_payload -> 'listing_fee_days', listing_fee_days),
    min_deposit_cup = COALESCE(NULLIF(p_payload ->> 'min_deposit_cup','')::numeric, min_deposit_cup),
    min_withdrawal_cup = COALESCE(NULLIF(p_payload ->> 'min_withdrawal_cup','')::numeric, min_withdrawal_cup),
    referral_reward_cup = COALESCE(NULLIF(p_payload ->> 'referral_reward_cup','')::numeric, referral_reward_cup),
    maintenance_mode = COALESCE((p_payload ->> 'maintenance_mode')::boolean, maintenance_mode),
    registration_open = COALESCE((p_payload ->> 'registration_open')::boolean, registration_open),
    marketplace_enabled = COALESCE((p_payload ->> 'marketplace_enabled')::boolean, marketplace_enabled),
    g2bulk_purchases_enabled = COALESCE((p_payload ->> 'g2bulk_purchases_enabled')::boolean, g2bulk_purchases_enabled),
    allow_line_reuse = COALESCE((p_payload ->> 'allow_line_reuse')::boolean, allow_line_reuse),
    support_whatsapp = COALESCE(NULLIF(p_payload ->> 'support_whatsapp',''), support_whatsapp),
    updated_by = v_admin,
    updated_at = now()
  WHERE id = true
  RETURNING * INTO v_after;

  v_changes := jsonb_build_object(
    'before', to_jsonb(v_before) - 'created_at' - 'updated_at' - 'updated_by',
    'after', to_jsonb(v_after) - 'created_at' - 'updated_at' - 'updated_by'
  );

  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, note, before, after)
  VALUES (v_admin, 'configuracion_actualizada', 'platform_settings', NULL,
          'Configuración global actualizada por un administrador.',
          v_changes -> 'before', v_changes -> 'after');

  RETURN to_jsonb(v_after);
END; $function$;