-- 1) Solicitud de retiro: además de descontar el saldo, deja el importe retenido y audita.
CREATE OR REPLACE FUNCTION public.request_withdrawal(p_amount numeric, p_method payment_method, p_destination text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_set record; v_wallet record;
  v_conv_pct numeric := 0; v_fee_pct numeric := 5;
  v_conv numeric; v_fee numeric; v_net numeric;
  v_before numeric; v_after numeric; v_id uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Debes iniciar sesión.'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Escribe un importe válido.'; END IF;
  IF p_method = 'wallet' THEN RAISE EXCEPTION 'Método de retiro no válido.'; END IF;
  IF p_destination IS NULL OR length(trim(p_destination)) < 5 THEN
    RAISE EXCEPTION 'Escribe el destino donde quieres recibir el dinero.';
  END IF;

  SELECT * INTO v_set FROM public.payment_settings WHERE payment_method = p_method AND active = true LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ese método de retiro no está disponible.'; END IF;
  v_conv_pct := COALESCE(v_set.withdrawal_conversion_pct, 0);
  v_fee_pct := COALESCE(v_set.withdrawal_fee_pct, 5);

  SELECT * INTO v_wallet FROM public.wallets WHERE user_id = v_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No encontramos tu wallet.'; END IF;
  IF v_wallet.status <> 'activa' THEN RAISE EXCEPTION 'Tu wallet está bloqueada. Escribe al administrador.'; END IF;

  v_before := v_wallet.balance;
  v_after := v_before - p_amount;
  IF v_after < 0 THEN RAISE EXCEPTION 'No tienes saldo suficiente para ese retiro.'; END IF;

  v_conv := round(p_amount * v_conv_pct / 100, 2);
  v_fee := round((p_amount - v_conv) * v_fee_pct / 100, 2);
  v_net := GREATEST(p_amount - v_conv - v_fee, 0);

  INSERT INTO public.withdrawals (
    user_id, amount, conversion_pct, fee_pct, fee, net_amount,
    payment_method, payment_destination, status, held_amount
  ) VALUES (
    v_user, p_amount, v_conv_pct, v_fee_pct, v_fee, v_net,
    p_method, trim(p_destination), 'pendiente', p_amount
  ) RETURNING id INTO v_id;

  UPDATE public.wallets
  SET balance = v_after,
      held_balance = COALESCE(held_balance, 0) + p_amount
  WHERE id = v_wallet.id;

  INSERT INTO public.wallet_transactions (
    wallet_id, user_id, type, amount, balance_before, balance_after,
    reference_type, reference_id, description, status
  ) VALUES (
    v_wallet.id, v_user, 'retiro', -p_amount, v_before, v_after,
    'withdrawal', v_id, 'Solicitud de retiro', 'pendiente'
  );

  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, target_user_id, amount, note, after)
  VALUES (v_user, 'retiro_solicitado', 'withdrawal', v_id, v_user, p_amount,
    'Retiro solicitado por el cliente. Importe retenido.',
    jsonb_build_object('status', 'pendiente', 'fee', v_fee, 'net', v_net, 'held', p_amount));

  INSERT INTO public.notifications (user_id, title, message, type, read)
  VALUES (v_user, 'Solicitud de retiro enviada',
    'Retuvimos ' || trim(trailing '.' FROM to_char(p_amount, 'FM999999990.00')) ||
    ' CUP de tu wallet. Recibirás ' || trim(trailing '.' FROM to_char(v_net, 'FM999999990.00')) ||
    ' CUP al completarse. Si se rechaza, te lo devolvemos.', 'retiro_pendiente', false);

  RETURN jsonb_build_object('withdrawal_id', v_id, 'net', v_net, 'balance', v_after, 'held', p_amount);
END; $function$;

-- 2) Revisión de retiro: al completar libera la retención; al rechazar devuelve el dinero.
CREATE OR REPLACE FUNCTION public.review_withdrawal(p_withdrawal uuid, p_approve boolean, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_admin uuid := auth.uid(); v_w record; v_wallet record;
  v_before numeric; v_after numeric; v_held numeric;
BEGIN
  IF v_admin IS NULL OR NOT public.has_role(v_admin, 'admin') THEN
    RAISE EXCEPTION 'Solo el administrador puede revisar retiros.';
  END IF;
  IF NOT p_approve AND length(trim(COALESCE(p_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Escribe el motivo del rechazo.';
  END IF;

  SELECT * INTO v_w FROM public.withdrawals WHERE id = p_withdrawal FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No encontramos esa solicitud.'; END IF;
  IF v_w.status <> 'pendiente' THEN
    RETURN jsonb_build_object('withdrawal_id', p_withdrawal, 'changed', false, 'status', v_w.status);
  END IF;

  SELECT * INTO v_wallet FROM public.wallets WHERE user_id = v_w.user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No encontramos la wallet del cliente.'; END IF;
  v_held := LEAST(COALESCE(v_wallet.held_balance, 0), COALESCE(v_w.held_amount, v_w.amount));

  IF p_approve THEN
    UPDATE public.withdrawals
    SET status = 'aprobado', reviewed_by = v_admin, reviewed_at = now(),
        processed_at = COALESCE(processed_at, now()), held_amount = 0
    WHERE id = p_withdrawal;

    UPDATE public.wallets
    SET held_balance = GREATEST(COALESCE(held_balance, 0) - v_held, 0)
    WHERE id = v_wallet.id;

    UPDATE public.wallet_transactions SET status = 'completado'
    WHERE reference_type = 'withdrawal' AND reference_id = p_withdrawal AND type = 'retiro';

    INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, target_user_id, amount, note, before, after)
    VALUES (v_admin, 'retiro_completado', 'withdrawal', p_withdrawal, v_w.user_id, v_w.amount,
      COALESCE(NULLIF(trim(COALESCE(p_reason, '')), ''), 'Retiro completado y pagado al cliente.'),
      jsonb_build_object('status', 'pendiente', 'held', v_held),
      jsonb_build_object('status', 'aprobado', 'fee', v_w.fee, 'net', v_w.net_amount, 'line', v_w.line_number, 'method', v_w.payment_method));

    INSERT INTO public.notifications (user_id, title, message, type, read)
    VALUES (v_w.user_id, 'Retiro completado',
      'Tu retiro de ' || trim(trailing '.' FROM to_char(v_w.amount, 'FM999999990.00')) ||
      ' CUP fue completado. Enviamos ' || trim(trailing '.' FROM to_char(v_w.net_amount, 'FM999999990.00')) ||
      ' CUP a ' || v_w.payment_destination || '.', 'retiro_aprobado', false);

    RETURN jsonb_build_object('withdrawal_id', p_withdrawal, 'changed', true, 'completed', true);
  END IF;

  v_before := v_wallet.balance;
  v_after := v_before + v_w.amount;
  UPDATE public.wallets
  SET balance = v_after,
      held_balance = GREATEST(COALESCE(held_balance, 0) - v_held, 0)
  WHERE id = v_wallet.id;

  UPDATE public.withdrawals
  SET status = 'rechazado', reviewed_by = v_admin, reviewed_at = now(),
      held_amount = 0,
      rejection_reason = NULLIF(trim(COALESCE(p_reason, '')), '')
  WHERE id = p_withdrawal;

  UPDATE public.wallet_transactions SET status = 'cancelado'
  WHERE reference_type = 'withdrawal' AND reference_id = p_withdrawal AND type = 'retiro';

  INSERT INTO public.wallet_transactions (
    wallet_id, user_id, type, amount, balance_before, balance_after,
    reference_type, reference_id, description, status
  ) VALUES (
    v_wallet.id, v_w.user_id, 'reembolso', v_w.amount, v_before, v_after,
    'withdrawal', p_withdrawal, 'Devolución de retiro rechazado', 'completado'
  );

  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, target_user_id, amount, note, before, after)
  VALUES (v_admin, 'retiro_rechazado', 'withdrawal', p_withdrawal, v_w.user_id, v_w.amount,
    trim(COALESCE(p_reason, '')),
    jsonb_build_object('status', 'pendiente', 'held', v_held),
    jsonb_build_object('status', 'rechazado', 'refunded', v_w.amount));

  INSERT INTO public.notifications (user_id, title, message, type, read)
  VALUES (v_w.user_id, 'Retiro rechazado',
    'Devolvimos ' || trim(trailing '.' FROM to_char(v_w.amount, 'FM999999990.00')) ||
    ' CUP a tu wallet.' || COALESCE(' Motivo: ' || NULLIF(trim(COALESCE(p_reason, '')), ''), ''),
    'retiro_rechazado', false);

  RETURN jsonb_build_object('withdrawal_id', p_withdrawal, 'changed', true, 'refunded', true);
END; $function$;

-- 3) Completar retiro con datos de pago (idempotente).
CREATE OR REPLACE FUNCTION public.complete_withdrawal(p_withdrawal uuid, p_transaction_id text DEFAULT NULL, p_note text DEFAULT '')
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_admin uuid := auth.uid(); v_w record; v_result jsonb;
BEGIN
  IF v_admin IS NULL OR NOT public.has_role(v_admin, 'admin') THEN
    RAISE EXCEPTION 'Solo el administrador puede completar retiros.';
  END IF;

  SELECT * INTO v_w FROM public.withdrawals WHERE id = p_withdrawal FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No encontramos esa solicitud.'; END IF;
  IF v_w.status <> 'pendiente' THEN
    RETURN jsonb_build_object('withdrawal_id', p_withdrawal, 'changed', false, 'status', v_w.status);
  END IF;

  v_result := public.review_withdrawal(p_withdrawal, true, COALESCE(p_note, ''));

  IF NULLIF(trim(COALESCE(p_transaction_id, '')), '') IS NOT NULL THEN
    UPDATE public.withdrawals
    SET transaction_id = trim(p_transaction_id)
    WHERE id = p_withdrawal;
  END IF;

  RETURN v_result;
END; $function$;

-- 4) Revisión de fondos: además de lo actual, deja registro de auditoría.
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
  IF v_admin IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión.';
  END IF;
  IF NOT public.has_role(v_admin, 'admin') THEN
    RAISE EXCEPTION 'Solo el administrador puede revisar solicitudes.';
  END IF;
  IF NOT p_approve AND length(trim(COALESCE(p_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Escribe el motivo del rechazo.';
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

  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, target_user_id, amount, line_id, note, before, after)
  VALUES (
    v_admin,
    CASE WHEN p_approve THEN 'fondos_aprobados' ELSE 'fondos_rechazados' END,
    'deposit', p_deposit, v_dep.user_id, v_dep.amount, v_dep.line_id,
    COALESCE(NULLIF(trim(COALESCE(p_reason, '')), ''), 'Solicitud de fondos revisada.'),
    jsonb_build_object('status', 'pendiente'),
    jsonb_build_object(
      'status', CASE WHEN p_approve THEN 'aprobado' ELSE 'rechazado' END,
      'credited', v_dep.credited_amount,
      'method', v_dep.payment_method,
      'line', v_dep.line_number
    )
  );

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

REVOKE ALL ON FUNCTION public.complete_withdrawal(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.complete_withdrawal(uuid, text, text) TO authenticated;