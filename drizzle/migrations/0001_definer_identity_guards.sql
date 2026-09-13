-- Fase 0.5 / migración 2: validación de identidad en funciones SECURITY DEFINER.
-- Reversión (consciente): restaurar las definiciones del baseline.
--   ADVERTENCIA: revertir REINTRODUCE la vulnerabilidad de llamadas anónimas a funciones de dinero.

CREATE OR REPLACE FUNCTION public.request_deposit(p_user uuid, p_amount numeric, p_method payment_method, p_reference text, p_has_proof boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := p_user;
  v_rate numeric;
  v_bonus numeric := 0;
  v_credited numeric;
  v_id uuid;
  v_ref text;
  v_line record;
  v_has_lines boolean;
  v_reuse boolean := false;
  v_assigned_at timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión.';
  END IF;
  IF p_user IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'No puedes registrar solicitudes de otra persona.';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Escribe un importe válido.';
  END IF;
  IF p_method = 'wallet' THEN
    RAISE EXCEPTION 'Método de pago no válido.';
  END IF;

  IF p_method = 'saldo_movil' THEN
    SELECT saldo_conversion_rate INTO v_rate FROM public.platform_settings LIMIT 1;
    v_credited := round(p_amount * COALESCE(v_rate, 1));
  ELSE
    SELECT COALESCE(deposit_bonus_pct, 0) INTO v_bonus
    FROM public.payment_settings WHERE payment_method = p_method LIMIT 1;
    v_bonus := COALESCE(v_bonus, 0);
    v_credited := round(p_amount * (1 + v_bonus / 100));
  END IF;

  v_ref := NULLIF(trim(COALESCE(p_reference, '')), '');
  IF v_ref IS NULL THEN
    v_ref := CASE WHEN p_has_proof THEN 'Con captura de pantalla' ELSE 'Sin captura de pantalla' END;
  ELSIF NOT p_has_proof THEN
    v_ref := v_ref || ' · Sin captura de pantalla';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.payment_lines
    WHERE payment_method = p_method AND active
  ) INTO v_has_lines;

  IF v_has_lines THEN
    SELECT COALESCE(allow_line_reuse, false) INTO v_reuse FROM public.platform_settings LIMIT 1;

    SELECT l.* INTO v_line
    FROM public.payment_lines l
    WHERE l.active
      AND l.payment_method = p_method
      AND NOT EXISTS (
        SELECT 1 FROM public.deposits d
        WHERE d.line_id = l.id
          AND d.status = 'pendiente'
          AND d.line_released_at IS NULL
      )
    ORDER BY l.line_number
    FOR UPDATE OF l SKIP LOCKED
    LIMIT 1;

    IF NOT FOUND AND COALESCE(v_reuse, false) THEN
      SELECT l.* INTO v_line
      FROM public.payment_lines l
      WHERE l.active AND l.payment_method = p_method
      ORDER BY (
        SELECT COALESCE(max(d.line_assigned_at), to_timestamp(0))
        FROM public.deposits d WHERE d.line_id = l.id
      ), l.line_number
      FOR UPDATE OF l
      LIMIT 1;
    END IF;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Todas las líneas de recepción están ocupadas ahora mismo. Espera unos minutos e inténtalo otra vez.';
    END IF;

    v_assigned_at := now();
  END IF;

  INSERT INTO public.deposits (
    user_id, amount, bonus_pct, credited_amount, payment_method, status, payment_reference,
    line_id, line_number, line_phone, line_assigned_at
  ) VALUES (
    v_user, p_amount, v_bonus, v_credited, p_method, 'pendiente', v_ref,
    v_line.id, v_line.line_number, v_line.phone_number, v_assigned_at
  ) RETURNING id INTO v_id;

  IF v_line.id IS NOT NULL THEN
    INSERT INTO public.payment_line_events (line_id, deposit_id, user_id, actor_id, action, note)
    VALUES (v_line.id, v_id, v_user, v_user, 'asignada',
      'Línea ' || v_line.line_number || ' (' || v_line.phone_number || ') asignada a la solicitud.');
  END IF;

  INSERT INTO public.notifications (user_id, title, message, type, read)
  VALUES (
    v_user,
    'Solicitud de fondos enviada',
    'Recibimos tu solicitud de ' || trim(trailing '.' FROM to_char(p_amount, 'FM999999990.00')) ||
      ' CUP. Está en revisión y acreditaremos ' ||
      trim(trailing '.' FROM to_char(v_credited, 'FM999999990.00')) || ' CUP al aprobarla.' ||
      CASE WHEN p_has_proof THEN '' ELSE ' Sin captura puede demorar hasta 24 horas.' END,
    'deposito_pendiente',
    false
  );

  RETURN jsonb_build_object(
    'deposit_id', v_id,
    'credited', v_credited,
    'line_number', v_line.line_number,
    'line_phone', v_line.phone_number
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.request_deposit_v2(p_user uuid, p_amount numeric, p_method payment_method, p_reference text, p_has_proof boolean, p_destination uuid DEFAULT NULL::uuid, p_transaction_id text DEFAULT NULL::text, p_sender_phone text DEFAULT NULL::text, p_proof_url text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := p_user;
  v_rate numeric;
  v_bonus numeric := 0;
  v_credited numeric;
  v_id uuid;
  v_ref text;
  v_line record;
  v_has_lines boolean;
  v_reuse boolean := false;
  v_assigned_at timestamptz;
  v_dest record;
  v_txn text := NULLIF(trim(COALESCE(p_transaction_id, '')), '');
  v_sender text := NULLIF(regexp_replace(COALESCE(p_sender_phone, ''), '\D', '', 'g'), '');
  v_proof text := NULLIF(trim(COALESCE(p_proof_url, '')), '');
  v_flow text := 'pendiente';
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión.';
  END IF;
  IF p_user IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'No puedes registrar solicitudes de otra persona.';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Escribe un importe válido.';
  END IF;
  IF p_method = 'wallet' THEN
    RAISE EXCEPTION 'Método de pago no válido.';
  END IF;

  IF p_destination IS NOT NULL THEN
    SELECT * INTO v_dest FROM public.payment_destinations WHERE id = p_destination;
    IF NOT FOUND OR NOT v_dest.active THEN
      RAISE EXCEPTION 'Ese destino de pago no está disponible ahora mismo.';
    END IF;
    IF v_dest.requires_transaction_id AND v_txn IS NULL THEN
      RAISE EXCEPTION 'Escribe el ID de transacción de tu pago.';
    END IF;
    IF v_dest.requires_proof AND v_proof IS NULL THEN
      RAISE EXCEPTION 'Sube la captura de pantalla del pago.';
    END IF;
    IF v_dest.requires_proof THEN
      v_flow := 'requiere_revision_manual';
    END IF;
  END IF;

  IF p_method = 'saldo_movil' THEN
    SELECT saldo_conversion_rate INTO v_rate FROM public.platform_settings LIMIT 1;
    v_credited := round(p_amount * COALESCE(v_rate, 1));
  ELSE
    SELECT COALESCE(deposit_bonus_pct, 0) INTO v_bonus
    FROM public.payment_settings WHERE payment_method = p_method LIMIT 1;
    v_bonus := COALESCE(v_bonus, 0);
    v_credited := round(p_amount * (1 + v_bonus / 100));
  END IF;

  v_ref := NULLIF(trim(COALESCE(p_reference, '')), '');
  IF v_ref IS NULL THEN
    v_ref := COALESCE(v_txn, v_sender,
      CASE WHEN v_proof IS NOT NULL THEN 'Con captura de pantalla' ELSE 'Sin captura de pantalla' END);
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.payment_lines WHERE payment_method = p_method AND active
  ) INTO v_has_lines;

  IF v_has_lines THEN
    SELECT COALESCE(allow_line_reuse, false) INTO v_reuse FROM public.platform_settings LIMIT 1;

    SELECT l.* INTO v_line
    FROM public.payment_lines l
    WHERE l.active
      AND l.payment_method = p_method
      AND NOT EXISTS (
        SELECT 1 FROM public.deposits d
        WHERE d.line_id = l.id AND d.status = 'pendiente' AND d.line_released_at IS NULL
      )
    ORDER BY l.line_number
    FOR UPDATE OF l SKIP LOCKED
    LIMIT 1;

    IF NOT FOUND AND COALESCE(v_reuse, false) THEN
      SELECT l.* INTO v_line
      FROM public.payment_lines l
      WHERE l.active AND l.payment_method = p_method
      ORDER BY (
        SELECT COALESCE(max(d.line_assigned_at), to_timestamp(0))
        FROM public.deposits d WHERE d.line_id = l.id
      ), l.line_number
      FOR UPDATE OF l
      LIMIT 1;
    END IF;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Todas las líneas de recepción están ocupadas ahora mismo. Espera unos minutos e inténtalo otra vez.';
    END IF;

    v_assigned_at := now();
  END IF;

  INSERT INTO public.deposits (
    user_id, amount, bonus_pct, credited_amount, payment_method, status, payment_reference,
    line_id, line_number, line_phone, line_assigned_at,
    payment_channel, payment_submethod, bank, destination_id, destination_value,
    transaction_id, sender_phone, proof_image_url, flow_status, approval_method
  ) VALUES (
    v_user, p_amount, v_bonus, v_credited, p_method, 'pendiente', v_ref,
    v_line.id, v_line.line_number, v_line.phone_number, v_assigned_at,
    COALESCE(v_dest.channel, p_method::text), v_dest.kind, v_dest.bank, v_dest.id, v_dest.destination_value,
    v_txn, v_sender, v_proof, v_flow, 'manual'
  ) RETURNING id INTO v_id;

  IF v_line.id IS NOT NULL THEN
    INSERT INTO public.payment_line_events (line_id, deposit_id, user_id, actor_id, action, note)
    VALUES (v_line.id, v_id, v_user, v_user, 'asignada',
      'Línea ' || v_line.line_number || ' (' || v_line.phone_number || ') asignada a la solicitud.');
  END IF;

  INSERT INTO public.notifications (user_id, title, message, type, read)
  VALUES (
    v_user,
    'Solicitud de fondos enviada',
    'Recibimos tu solicitud de ' || trim(trailing '.' FROM to_char(p_amount, 'FM999999990.00')) ||
      ' CUP. Está en revisión y acreditaremos ' ||
      trim(trailing '.' FROM to_char(v_credited, 'FM999999990.00')) || ' CUP al aprobarla.' ||
      CASE WHEN v_proof IS NOT NULL THEN '' ELSE ' Sin captura puede demorar hasta 24 horas.' END,
    'deposito_pendiente',
    false
  );

  RETURN jsonb_build_object(
    'deposit_id', v_id,
    'credited', v_credited,
    'line_number', v_line.line_number,
    'line_phone', v_line.phone_number
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.claim_referral_reward(p_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := p_user;
  v_goal int := 10;
  v_count int;
  v_rate numeric;
  v_wallet record;
  v_before numeric;
  v_after numeric;
  v_ids uuid[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión.';
  END IF;
  IF p_user IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'No puedes reclamar el premio de otra persona.';
  END IF;

  SELECT array_agg(id) INTO v_ids FROM (
    SELECT id FROM public.referrals
    WHERE referrer_user_id = v_user AND reward_claimed_at IS NULL
    ORDER BY created_at
    LIMIT v_goal
    FOR UPDATE
  ) s;

  v_count := COALESCE(array_length(v_ids, 1), 0);
  IF v_count < v_goal THEN
    RAISE EXCEPTION 'Todavía no completaste los % invitados.', v_goal;
  END IF;

  SELECT usd_to_cup INTO v_rate FROM public.platform_settings LIMIT 1;
  IF COALESCE(v_rate, 0) <= 0 THEN
    RAISE EXCEPTION 'El administrador aún no configuró la base de conversión.';
  END IF;

  SELECT * INTO v_wallet FROM public.wallets WHERE user_id = v_user FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No encontramos tu wallet.';
  END IF;

  v_before := v_wallet.balance;
  v_after := v_before + v_rate;

  UPDATE public.wallets SET balance = v_after WHERE id = v_wallet.id;

  UPDATE public.referrals
  SET reward_claimed_at = now(), status = 'activo', reward_amount = round(v_rate / v_goal, 2)
  WHERE id = ANY(v_ids);

  INSERT INTO public.wallet_transactions (
    wallet_id, user_id, type, amount, balance_before, balance_after,
    reference_type, reference_id, description, status
  ) VALUES (
    v_wallet.id, v_user, 'premio', v_rate, v_before, v_after,
    'referral_reward', NULL, 'Premio por 10 invitados (1 USD)', 'completado'
  );

  INSERT INTO public.notifications (user_id, title, message, type, read)
  VALUES (
    v_user, 'Premio de referidos',
    'Agregamos ' || trim(trailing '.' FROM to_char(v_rate, 'FM999999990.00')) ||
      ' CUP a tu wallet por invitar a 10 personas.',
    'premio', false
  );

  RETURN jsonb_build_object('amount', v_rate, 'balance', v_after);
END;
$function$;

CREATE OR REPLACE FUNCTION public.review_deposit(p_deposit uuid, p_approve boolean, p_reason text, p_admin uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_admin uuid := auth.uid();
  v_dep record;
  v_wallet record;
  v_before numeric;
  v_after numeric;
BEGIN
  -- El parámetro p_admin se conserva por compatibilidad de firma pero se ignora:
  -- la identidad autorizada es siempre auth.uid().
  IF v_admin IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión.';
  END IF;
  IF NOT public.has_role(v_admin, 'admin') THEN
    RAISE EXCEPTION 'Solo el administrador puede revisar solicitudes.';
  END IF;

  SELECT * INTO v_dep FROM public.deposits WHERE id = p_deposit FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No encontramos esa solicitud.';
  END IF;
  IF v_dep.status <> 'pendiente' THEN
    RETURN jsonb_build_object('deposit_id', p_deposit, 'changed', false, 'status', v_dep.status);
  END IF;

  IF p_approve THEN
    SELECT * INTO v_wallet FROM public.wallets WHERE user_id = v_dep.user_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'No encontramos la wallet del cliente.';
    END IF;
    v_before := v_wallet.balance;
    v_after := v_before + v_dep.credited_amount;

    UPDATE public.wallets SET balance = v_after WHERE id = v_wallet.id;

    INSERT INTO public.wallet_transactions (
      wallet_id, user_id, type, amount, balance_before, balance_after,
      reference_type, reference_id, description, status
    ) VALUES (
      v_wallet.id, v_dep.user_id, 'deposito', v_dep.credited_amount, v_before, v_after,
      'deposit', p_deposit, 'Depósito aprobado', 'completado'
    );

    UPDATE public.deposits
    SET status = 'aprobado', reviewed_by = v_admin, reviewed_at = now(),
        flow_status = 'aprobada', approval_method = 'manual',
        payment_received_at = COALESCE(payment_received_at, now()),
        line_released_at = COALESCE(line_released_at, now())
    WHERE id = p_deposit;

    INSERT INTO public.notifications (user_id, title, message, type, read)
    VALUES (
      v_dep.user_id, 'Fondos acreditados',
      'Tus fondos han sido aprobados y ya están disponibles en tu saldo de MONSTORE: ' ||
        trim(trailing '.' FROM to_char(v_dep.credited_amount, 'FM999999990.00')) || ' CUP.',
      'deposito_aprobado', false
    );
  ELSE
    UPDATE public.deposits
    SET status = 'rechazado', reviewed_by = v_admin, reviewed_at = now(),
        flow_status = 'rechazada', approval_method = 'manual',
        rejection_reason = NULLIF(trim(COALESCE(p_reason, '')), ''),
        line_released_at = COALESCE(line_released_at, now())
    WHERE id = p_deposit;

    INSERT INTO public.notifications (user_id, title, message, type, read)
    VALUES (
      v_dep.user_id, 'Solicitud de fondos rechazada',
      'No pudimos verificar tu pago.' || COALESCE(' Motivo: ' || NULLIF(trim(COALESCE(p_reason, '')), ''), ''),
      'deposito_rechazado', false
    );
  END IF;

  IF v_dep.line_id IS NOT NULL AND v_dep.line_released_at IS NULL THEN
    INSERT INTO public.payment_line_events (line_id, deposit_id, user_id, actor_id, action, note)
    VALUES (
      v_dep.line_id, p_deposit, v_dep.user_id, v_admin,
      CASE WHEN p_approve THEN 'liberada_aprobacion' ELSE 'liberada_rechazo' END,
      'Línea ' || COALESCE(v_dep.line_number::text, '—') || ' liberada al ' ||
        CASE WHEN p_approve THEN 'aprobar' ELSE 'rechazar' END || ' la solicitud.'
    );
  END IF;

  RETURN jsonb_build_object('deposit_id', p_deposit, 'changed', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.refund_wallet_order(p_order uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order record;
  v_wallet record;
  v_done uuid;
  v_before numeric;
  v_after numeric;
BEGIN
  -- Función exclusivamente interna: solo la ejecuta el backend con service_role.
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Esta operación solo puede ejecutarla el sistema.';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No encontramos ese pedido.';
  END IF;

  IF v_order.status IN ('reembolsado', 'completado') THEN
    RETURN jsonb_build_object('order_id', p_order, 'refunded', false, 'status', v_order.status);
  END IF;

  SELECT id INTO v_done
  FROM public.wallet_transactions
  WHERE reference_type = 'order'
    AND reference_id = p_order
    AND type = 'reembolso';

  IF v_done IS NOT NULL THEN
    RETURN jsonb_build_object('order_id', p_order, 'refunded', false, 'status', v_order.status);
  END IF;

  SELECT * INTO v_wallet FROM public.wallets WHERE user_id = v_order.user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No encontramos la wallet de este pedido.';
  END IF;

  v_before := v_wallet.balance;
  v_after := v_before + v_order.total_amount;

  UPDATE public.wallets SET balance = v_after WHERE id = v_wallet.id;

  INSERT INTO public.wallet_transactions (
    wallet_id, user_id, type, amount, balance_before, balance_after,
    reference_type, reference_id, description, status
  )
  VALUES (
    v_wallet.id, v_order.user_id, 'reembolso', v_order.total_amount, v_before, v_after,
    'order', p_order, 'Reembolso del pedido ' || v_order.code, 'completado'
  );

  UPDATE public.orders
  SET status = 'reembolsado',
      error_message = COALESCE(p_reason, error_message)
  WHERE id = p_order;

  INSERT INTO public.notifications (user_id, title, message, type, read)
  VALUES (
    v_order.user_id,
    'Reembolso ' || v_order.code,
    'Devolvimos ' || trim(trailing '.' FROM to_char(v_order.total_amount, 'FM999999990.00')) ||
      ' CUP a tu wallet.' || COALESCE(' Motivo: ' || p_reason, ''),
    'pedido',
    false
  );

  RETURN jsonb_build_object('order_id', p_order, 'refunded', true, 'balance', v_after);
END;
$function$;