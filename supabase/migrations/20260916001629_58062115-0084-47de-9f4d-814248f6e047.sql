-- 1. Modo del gateway en la configuración global
ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS payment_gateway_mode text NOT NULL DEFAULT 'off';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'platform_settings_gateway_mode_check'
  ) THEN
    ALTER TABLE public.platform_settings
      ADD CONSTRAINT platform_settings_gateway_mode_check
      CHECK (payment_gateway_mode IN ('off','simulation','live'));
  END IF;
END $$;

-- 2. Registro de eventos recibidos del iPhone
CREATE TABLE IF NOT EXISTS public.payment_gateway_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id text NOT NULL,
  device_id text NOT NULL,
  event_type text NOT NULL DEFAULT 'sms',
  source text NOT NULL DEFAULT 'shortcuts',
  nonce text NOT NULL,
  received_at timestamp with time zone NOT NULL DEFAULT now(),
  sender text NOT NULL DEFAULT '',
  message text NOT NULL DEFAULT '',
  channel text NOT NULL DEFAULT 'desconocido',
  parsed jsonb NOT NULL DEFAULT '{}'::jsonb,
  mode text NOT NULL DEFAULT 'off',
  status text NOT NULL DEFAULT 'recibido',
  outcome text NOT NULL DEFAULT '',
  reason text NOT NULL DEFAULT '',
  deposit_id uuid REFERENCES public.deposits(id),
  processed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS payment_gateway_events_event_id_key
  ON public.payment_gateway_events (event_id);
CREATE UNIQUE INDEX IF NOT EXISTS payment_gateway_events_nonce_key
  ON public.payment_gateway_events (device_id, nonce);
CREATE INDEX IF NOT EXISTS payment_gateway_events_created_idx
  ON public.payment_gateway_events (created_at DESC);

GRANT SELECT ON public.payment_gateway_events TO authenticated;
GRANT ALL ON public.payment_gateway_events TO service_role;

ALTER TABLE public.payment_gateway_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins ven los eventos del gateway" ON public.payment_gateway_events;
CREATE POLICY "Admins ven los eventos del gateway"
  ON public.payment_gateway_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP TRIGGER IF EXISTS payment_gateway_events_updated_at ON public.payment_gateway_events;
CREATE TRIGGER payment_gateway_events_updated_at
  BEFORE UPDATE ON public.payment_gateway_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Configuración: permitir guardar el modo del gateway
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

  IF p_payload ? 'payment_gateway_mode'
     AND (p_payload ->> 'payment_gateway_mode') NOT IN ('off','simulation','live') THEN
    RAISE EXCEPTION 'El modo del gateway de pagos no es válido.';
  END IF;

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
    payment_gateway_mode = COALESCE(NULLIF(p_payload ->> 'payment_gateway_mode',''), payment_gateway_mode),
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

-- 4. Procesamiento atómico del evento del gateway (solo backend con clave de servicio)
CREATE OR REPLACE FUNCTION public.gateway_process_event(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_mode text;
  v_event public.payment_gateway_events;
  v_channel text := COALESCE(NULLIF(p_payload ->> 'channel',''), 'desconocido');
  v_parsed jsonb := COALESCE(p_payload -> 'parsed', '{}'::jsonb);
  v_amount numeric := NULLIF(v_parsed ->> 'amount','')::numeric;
  v_sender_phone text := NULLIF(regexp_replace(COALESCE(v_parsed ->> 'sender_phone',''), '\D', '', 'g'), '');
  v_destination text := NULLIF(trim(COALESCE(v_parsed ->> 'destination','')), '');
  v_reference text := NULLIF(upper(trim(COALESCE(v_parsed ->> 'reference',''))), '');
  v_status text := 'revision';
  v_outcome text := 'revision_manual';
  v_reason text := '';
  v_deposit record;
  v_matches int := 0;
  v_wallet record;
  v_before numeric;
  v_after numeric;
BEGIN
  SELECT COALESCE(payment_gateway_mode,'off') INTO v_mode FROM public.platform_settings LIMIT 1;
  v_mode := COALESCE(v_mode, 'off');

  BEGIN
    INSERT INTO public.payment_gateway_events (
      event_id, device_id, event_type, source, nonce, received_at, sender, message,
      channel, parsed, mode, status
    ) VALUES (
      p_payload ->> 'event_id',
      p_payload ->> 'device_id',
      COALESCE(NULLIF(p_payload ->> 'event_type',''), 'sms'),
      COALESCE(NULLIF(p_payload ->> 'source',''), 'shortcuts'),
      p_payload ->> 'nonce',
      COALESCE(NULLIF(p_payload ->> 'received_at','')::timestamptz, now()),
      COALESCE(p_payload ->> 'sender',''),
      COALESCE(p_payload ->> 'message',''),
      v_channel, v_parsed, v_mode, 'recibido'
    ) RETURNING * INTO v_event;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('duplicate', true, 'status', 'duplicado',
      'outcome', 'duplicado', 'reason', 'El evento ya había sido recibido.');
  END;

  IF v_channel = 'desconocido' THEN
    v_reason := 'No se reconoce el formato del mensaje.';
  ELSIF v_amount IS NULL OR v_amount <= 0 THEN
    v_reason := 'El mensaje no trae un importe válido.';
  ELSIF v_channel = 'transfermovil' AND v_sender_phone IS NULL THEN
    v_reason := 'El aviso no incluye el teléfono del remitente.';
  ELSIF v_channel = 'transfermovil' AND v_destination IS NULL THEN
    v_reason := 'El aviso no incluye la cuenta de destino.';
  ELSIF v_reference IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.deposits d
      WHERE upper(COALESCE(d.transaction_id,'')) = v_reference
        AND d.status <> 'pendiente'
    ) THEN
    v_status := 'duplicado';
    v_outcome := 'duplicado';
    v_reason := 'La referencia del pago ya fue usada en otra solicitud.';
  ELSIF v_reference IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.payment_gateway_events e
      WHERE e.id <> v_event.id
        AND upper(COALESCE(e.parsed ->> 'reference','')) = v_reference
        AND e.outcome IN ('aprobado_automatico','simulado_aprobaria')
    ) THEN
    v_status := 'duplicado';
    v_outcome := 'duplicado';
    v_reason := 'Ya se procesó un aviso con la misma referencia.';
  ELSE
    IF v_channel = 'transfermovil' THEN
      SELECT count(*) INTO v_matches
      FROM public.deposits d
      WHERE d.status = 'pendiente'
        AND d.amount = v_amount
        AND d.created_at > now() - interval '48 hours'
        AND regexp_replace(COALESCE(d.sender_phone,''), '\D', '', 'g') = v_sender_phone
        AND regexp_replace(COALESCE(d.destination_value,''), '\s', '', 'g') = regexp_replace(v_destination, '\s', '', 'g');

      IF v_matches = 1 THEN
        SELECT * INTO v_deposit
        FROM public.deposits d
        WHERE d.status = 'pendiente'
          AND d.amount = v_amount
          AND d.created_at > now() - interval '48 hours'
          AND regexp_replace(COALESCE(d.sender_phone,''), '\D', '', 'g') = v_sender_phone
          AND regexp_replace(COALESCE(d.destination_value,''), '\s', '', 'g') = regexp_replace(v_destination, '\s', '', 'g')
        FOR UPDATE;
      END IF;
    ELSIF v_channel = 'saldo_movil' THEN
      SELECT count(*) INTO v_matches
      FROM public.deposits d
      WHERE d.status = 'pendiente'
        AND d.payment_method = 'saldo_movil'
        AND d.amount = v_amount
        AND d.created_at > now() - interval '48 hours'
        AND v_sender_phone IS NOT NULL
        AND regexp_replace(COALESCE(d.sender_phone,''), '\D', '', 'g') = v_sender_phone
        AND (
          v_destination IS NULL
          OR regexp_replace(COALESCE(d.line_phone,''), '\D', '', 'g') = regexp_replace(v_destination, '\D', '', 'g')
        );

      IF v_matches = 1 THEN
        SELECT * INTO v_deposit
        FROM public.deposits d
        WHERE d.status = 'pendiente'
          AND d.payment_method = 'saldo_movil'
          AND d.amount = v_amount
          AND d.created_at > now() - interval '48 hours'
          AND regexp_replace(COALESCE(d.sender_phone,''), '\D', '', 'g') = v_sender_phone
          AND (
            v_destination IS NULL
            OR regexp_replace(COALESCE(d.line_phone,''), '\D', '', 'g') = regexp_replace(v_destination, '\D', '', 'g')
          )
        FOR UPDATE;
      END IF;
    END IF;

    IF v_matches = 0 THEN
      v_reason := 'No hay ninguna solicitud pendiente que coincida.';
    ELSIF v_matches > 1 THEN
      v_reason := 'Hay varias solicitudes posibles: se necesita revisión.';
    ELSIF v_mode = 'off' THEN
      v_status := 'rechazado';
      v_outcome := 'gateway_desactivado';
      v_reason := 'El gateway automático está desactivado.';
    ELSIF v_mode = 'simulation' THEN
      v_status := 'simulado';
      v_outcome := 'simulado_aprobaria';
      v_reason := 'Habría aprobado automáticamente esta solicitud.';
    ELSE
      -- Aprobación automática atómica
      SELECT * INTO v_wallet FROM public.wallets WHERE user_id = v_deposit.user_id FOR UPDATE;
      IF NOT FOUND THEN
        v_reason := 'El cliente no tiene wallet disponible.';
      ELSE
        v_before := v_wallet.balance;
        v_after := v_before + v_deposit.credited_amount;

        UPDATE public.wallets SET balance = v_after, updated_at = now() WHERE id = v_wallet.id;

        INSERT INTO public.wallet_transactions (
          wallet_id, user_id, type, amount, balance_before, balance_after,
          reference_type, reference_id, description, status, idempotency_key
        ) VALUES (
          v_wallet.id, v_deposit.user_id, 'deposito', v_deposit.credited_amount, v_before, v_after,
          'deposit', v_deposit.id, 'Depósito aprobado automáticamente', 'completado',
          'gateway:' || v_event.event_id
        );

        UPDATE public.deposits
        SET status = 'aprobado', reviewed_at = now(),
            flow_status = 'aprobada', approval_method = 'gateway',
            transaction_id = COALESCE(NULLIF(transaction_id,''), v_reference),
            payment_received_at = COALESCE(payment_received_at, v_event.received_at),
            line_released_at = COALESCE(line_released_at, now())
        WHERE id = v_deposit.id;

        INSERT INTO public.notifications (user_id, title, message, type, read)
        VALUES (
          v_deposit.user_id, 'Fondos acreditados',
          'Tu pago fue verificado automáticamente y ya tienes ' ||
            trim(trailing '.' FROM to_char(v_deposit.credited_amount, 'FM999999990.00')) ||
            ' CUP en tu saldo de MONSTORE.',
          'deposito_aprobado', false
        );

        INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, target_user_id,
          amount, line_id, note, metadata)
        VALUES (NULL, 'deposito_aprobado_gateway', 'deposit', v_deposit.id, v_deposit.user_id,
          v_deposit.credited_amount, v_deposit.line_id,
          'Depósito aprobado automáticamente por el gateway de pagos.',
          jsonb_build_object('event_id', v_event.event_id, 'device_id', v_event.device_id,
                             'reference', v_reference, 'channel', v_channel));

        v_status := 'procesado';
        v_outcome := 'aprobado_automatico';
        v_reason := 'Pago verificado y fondos acreditados.';
      END IF;
    END IF;
  END IF;

  UPDATE public.payment_gateway_events
  SET status = v_status,
      outcome = CASE WHEN v_status = 'revision' THEN 'revision_manual' ELSE v_outcome END,
      reason = v_reason,
      deposit_id = CASE WHEN v_matches = 1 THEN v_deposit.id ELSE NULL END,
      processed_at = now()
  WHERE id = v_event.id;

  RETURN jsonb_build_object(
    'duplicate', false,
    'status', v_status,
    'outcome', CASE WHEN v_status = 'revision' THEN 'revision_manual' ELSE v_outcome END,
    'reason', v_reason,
    'mode', v_mode,
    'matches', v_matches,
    'deposit_id', CASE WHEN v_matches = 1 THEN v_deposit.id ELSE NULL END
  );
END; $function$;

REVOKE ALL ON FUNCTION public.gateway_process_event(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gateway_process_event(jsonb) TO service_role;