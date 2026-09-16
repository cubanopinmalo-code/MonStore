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
  v_deposit_id uuid;
  v_dep_user uuid;
  v_dep_credited numeric;
  v_dep_line uuid;
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
        SELECT d.id, d.user_id, d.credited_amount, d.line_id
          INTO v_deposit_id, v_dep_user, v_dep_credited, v_dep_line
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
        SELECT d.id, d.user_id, d.credited_amount, d.line_id
          INTO v_deposit_id, v_dep_user, v_dep_credited, v_dep_line
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

    IF v_matches = 0 OR v_deposit_id IS NULL THEN
      v_matches := LEAST(v_matches, 1);
      IF v_matches = 0 THEN
        v_reason := 'No hay ninguna solicitud pendiente que coincida.';
      END IF;
    END IF;

    IF v_matches > 1 THEN
      v_reason := 'Hay varias solicitudes posibles: se necesita revisión.';
    ELSIF v_deposit_id IS NOT NULL THEN
      IF v_mode = 'off' THEN
        v_status := 'rechazado';
        v_outcome := 'gateway_desactivado';
        v_reason := 'El gateway automático está desactivado.';
      ELSIF v_mode = 'simulation' THEN
        v_status := 'simulado';
        v_outcome := 'simulado_aprobaria';
        v_reason := 'Habría aprobado automáticamente esta solicitud.';
      ELSE
        SELECT * INTO v_wallet FROM public.wallets WHERE user_id = v_dep_user FOR UPDATE;
        IF NOT FOUND THEN
          v_reason := 'El cliente no tiene wallet disponible.';
        ELSE
          v_before := v_wallet.balance;
          v_after := v_before + v_dep_credited;

          UPDATE public.wallets SET balance = v_after, updated_at = now() WHERE id = v_wallet.id;

          INSERT INTO public.wallet_transactions (
            wallet_id, user_id, type, amount, balance_before, balance_after,
            reference_type, reference_id, description, status, idempotency_key
          ) VALUES (
            v_wallet.id, v_dep_user, 'deposito', v_dep_credited, v_before, v_after,
            'deposit', v_deposit_id, 'Depósito aprobado automáticamente', 'completado',
            'gateway:' || v_event.event_id
          );

          UPDATE public.deposits
          SET status = 'aprobado', reviewed_at = now(),
              flow_status = 'aprobada', approval_method = 'gateway',
              transaction_id = COALESCE(NULLIF(transaction_id,''), v_reference),
              payment_received_at = COALESCE(payment_received_at, v_event.received_at),
              line_released_at = COALESCE(line_released_at, now())
          WHERE id = v_deposit_id;

          INSERT INTO public.notifications (user_id, title, message, type, read)
          VALUES (
            v_dep_user, 'Fondos acreditados',
            'Tu pago fue verificado automáticamente y ya tienes ' ||
              trim(trailing '.' FROM to_char(v_dep_credited, 'FM999999990.00')) ||
              ' CUP en tu saldo de MONSTORE.',
            'deposito_aprobado', false
          );

          INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, target_user_id,
            amount, line_id, note, metadata)
          VALUES (NULL, 'deposito_aprobado_gateway', 'deposit', v_deposit_id, v_dep_user,
            v_dep_credited, v_dep_line,
            'Depósito aprobado automáticamente por el gateway de pagos.',
            jsonb_build_object('event_id', v_event.event_id, 'device_id', v_event.device_id,
                               'reference', v_reference, 'channel', v_channel));

          v_status := 'procesado';
          v_outcome := 'aprobado_automatico';
          v_reason := 'Pago verificado y fondos acreditados.';
        END IF;
      END IF;
    END IF;
  END IF;

  UPDATE public.payment_gateway_events
  SET status = v_status,
      outcome = CASE WHEN v_status = 'revision' THEN 'revision_manual' ELSE v_outcome END,
      reason = v_reason,
      deposit_id = v_deposit_id,
      processed_at = now()
  WHERE id = v_event.id;

  RETURN jsonb_build_object(
    'duplicate', false,
    'status', v_status,
    'outcome', CASE WHEN v_status = 'revision' THEN 'revision_manual' ELSE v_outcome END,
    'reason', v_reason,
    'mode', v_mode,
    'matches', v_matches,
    'deposit_id', v_deposit_id
  );
END; $function$;

REVOKE ALL ON FUNCTION public.gateway_process_event(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gateway_process_event(jsonb) TO service_role;