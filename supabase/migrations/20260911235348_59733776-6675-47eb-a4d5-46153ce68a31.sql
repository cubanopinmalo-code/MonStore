
CREATE OR REPLACE FUNCTION public.request_withdrawal(p_amount numeric, p_method payment_method, p_destination text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
    payment_method, payment_destination, status
  ) VALUES (
    v_user, p_amount, v_conv_pct, v_fee_pct, v_fee, v_net,
    p_method, trim(p_destination), 'pendiente'
  ) RETURNING id INTO v_id;

  UPDATE public.wallets SET balance = v_after WHERE id = v_wallet.id;

  INSERT INTO public.wallet_transactions (
    wallet_id, user_id, type, amount, balance_before, balance_after,
    reference_type, reference_id, description, status
  ) VALUES (
    v_wallet.id, v_user, 'retiro', -p_amount, v_before, v_after,
    'withdrawal', v_id, 'Solicitud de retiro', 'pendiente'
  );

  INSERT INTO public.notifications (user_id, title, message, type, read)
  VALUES (v_user, 'Solicitud de retiro enviada',
    'Descontamos ' || trim(trailing '.' FROM to_char(p_amount, 'FM999999990.00')) ||
    ' CUP de tu wallet. Recibirás ' || trim(trailing '.' FROM to_char(v_net, 'FM999999990.00')) ||
    ' CUP al aprobarse. Si se rechaza, te lo devolvemos.', 'retiro_pendiente', false);

  RETURN jsonb_build_object('withdrawal_id', v_id, 'net', v_net, 'balance', v_after);
END; $$;

CREATE OR REPLACE FUNCTION public.review_withdrawal(p_withdrawal uuid, p_approve boolean, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_admin uuid := auth.uid(); v_w record; v_wallet record;
  v_before numeric; v_after numeric;
BEGIN
  IF v_admin IS NULL OR NOT public.has_role(v_admin, 'admin') THEN
    RAISE EXCEPTION 'Solo el administrador puede revisar retiros.';
  END IF;

  SELECT * INTO v_w FROM public.withdrawals WHERE id = p_withdrawal FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No encontramos esa solicitud.'; END IF;
  IF v_w.status <> 'pendiente' THEN
    RETURN jsonb_build_object('withdrawal_id', p_withdrawal, 'changed', false, 'status', v_w.status);
  END IF;

  IF p_approve THEN
    UPDATE public.withdrawals SET status = 'aprobado', reviewed_by = v_admin, reviewed_at = now()
    WHERE id = p_withdrawal;

    UPDATE public.wallet_transactions SET status = 'completado'
    WHERE reference_type = 'withdrawal' AND reference_id = p_withdrawal AND type = 'retiro';

    INSERT INTO public.notifications (user_id, title, message, type, read)
    VALUES (v_w.user_id, 'Retiro aprobado',
      'Tu retiro de ' || trim(trailing '.' FROM to_char(v_w.amount, 'FM999999990.00')) ||
      ' CUP fue aprobado. Recibirás ' || trim(trailing '.' FROM to_char(v_w.net_amount, 'FM999999990.00')) ||
      ' CUP en ' || v_w.payment_destination || '.', 'retiro_aprobado', false);

    RETURN jsonb_build_object('withdrawal_id', p_withdrawal, 'changed', true);
  END IF;

  SELECT * INTO v_wallet FROM public.wallets WHERE user_id = v_w.user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No encontramos la wallet del cliente.'; END IF;
  v_before := v_wallet.balance;
  v_after := v_before + v_w.amount;
  UPDATE public.wallets SET balance = v_after WHERE id = v_wallet.id;

  UPDATE public.withdrawals
  SET status = 'rechazado', reviewed_by = v_admin, reviewed_at = now(),
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

  INSERT INTO public.notifications (user_id, title, message, type, read)
  VALUES (v_w.user_id, 'Retiro rechazado',
    'Devolvimos ' || trim(trailing '.' FROM to_char(v_w.amount, 'FM999999990.00')) ||
    ' CUP a tu wallet.' || COALESCE(' Motivo: ' || NULLIF(trim(COALESCE(p_reason, '')), ''), ''),
    'retiro_rechazado', false);

  RETURN jsonb_build_object('withdrawal_id', p_withdrawal, 'changed', true, 'refunded', true);
END; $$;

CREATE OR REPLACE FUNCTION public.subscribe_event(p_event uuid, p_game_account_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid(); v_event record; v_count int; v_id uuid; v_acc text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Debes iniciar sesión.'; END IF;
  v_acc := NULLIF(trim(COALESCE(p_game_account_id, '')), '');
  IF v_acc IS NULL THEN RAISE EXCEPTION 'Escribe el identificador de tu cuenta en el juego.'; END IF;

  SELECT * INTO v_event FROM public.events WHERE id = p_event FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No encontramos ese evento.'; END IF;
  IF v_event.status NOT IN ('inscripciones_abiertas', 'meta_alcanzada') THEN
    RAISE EXCEPTION 'Las inscripciones de este evento no están abiertas.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.event_subscriptions WHERE event_id = p_event AND user_id = v_user) THEN
    RAISE EXCEPTION 'Ya estás inscrito en este evento.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.event_subscriptions WHERE event_id = p_event AND game_account_id = v_acc) THEN
    RAISE EXCEPTION 'Ese identificador de cuenta ya está inscrito en este evento.';
  END IF;

  SELECT count(*) INTO v_count FROM public.event_subscriptions
  WHERE event_id = p_event AND status <> 'cancelado';
  IF v_count >= v_event.max_participants THEN
    RAISE EXCEPTION 'El evento ya está completo.';
  END IF;

  INSERT INTO public.event_subscriptions (event_id, user_id, game_account_id, status, payment_status)
  VALUES (p_event, v_user, v_acc, 'inscrito', 'pendiente')
  RETURNING id INTO v_id;

  v_count := v_count + 1;
  IF v_count >= v_event.min_participants AND v_event.status = 'inscripciones_abiertas' THEN
    UPDATE public.events SET status = 'meta_alcanzada' WHERE id = p_event;
  END IF;

  INSERT INTO public.notifications (user_id, title, message, type, read)
  VALUES (v_user, 'Inscripción confirmada',
    'Te inscribiste en ' || v_event.name || '. Se cobrará la entrada solo cuando entres a la sala.',
    'evento', false);

  RETURN jsonb_build_object('subscription_id', v_id, 'participants', v_count);
END; $$;

CREATE OR REPLACE FUNCTION public.enter_event_room(p_event uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid(); v_event record; v_sub record; v_wallet record;
  v_before numeric; v_after numeric;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Debes iniciar sesión.'; END IF;

  SELECT * INTO v_event FROM public.events WHERE id = p_event;
  IF NOT FOUND THEN RAISE EXCEPTION 'No encontramos ese evento.'; END IF;
  IF v_event.status <> 'sala_activa' OR v_event.room_activated_at IS NULL THEN
    RAISE EXCEPTION 'La sala todavía no está activa.';
  END IF;
  IF now() > v_event.room_activated_at + make_interval(mins => COALESCE(v_event.entry_window_minutes, 15)) THEN
    RAISE EXCEPTION 'La ventana para entrar a la sala ya cerró.';
  END IF;

  SELECT * INTO v_sub FROM public.event_subscriptions
  WHERE event_id = p_event AND user_id = v_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No estás inscrito en este evento.'; END IF;

  IF v_sub.payment_status = 'pagado' THEN
    RETURN jsonb_build_object('room_id', v_event.room_id, 'room_password', v_event.room_password, 'charged', false);
  END IF;

  SELECT * INTO v_wallet FROM public.wallets WHERE user_id = v_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No encontramos tu wallet.'; END IF;

  v_before := v_wallet.balance;
  v_after := v_before - v_event.entry_price;
  IF v_after < 0 THEN RAISE EXCEPTION 'No tienes saldo suficiente para entrar a la sala.'; END IF;

  UPDATE public.wallets SET balance = v_after WHERE id = v_wallet.id;
  UPDATE public.event_subscriptions
  SET payment_status = 'pagado', status = 'en_sala', entered_at = now()
  WHERE id = v_sub.id;

  INSERT INTO public.wallet_transactions (
    wallet_id, user_id, type, amount, balance_before, balance_after,
    reference_type, reference_id, description, status
  ) VALUES (
    v_wallet.id, v_user, 'evento', -v_event.entry_price, v_before, v_after,
    'event', p_event, 'Entrada al evento ' || v_event.name, 'completado'
  );

  INSERT INTO public.notifications (user_id, title, message, type, read)
  VALUES (v_user, 'Entraste a la sala',
    'Cobramos ' || trim(trailing '.' FROM to_char(v_event.entry_price, 'FM999999990.00')) ||
    ' CUP por tu entrada a ' || v_event.name || '.', 'evento', false);

  RETURN jsonb_build_object('room_id', v_event.room_id, 'room_password', v_event.room_password,
    'charged', true, 'balance', v_after);
END; $$;

REVOKE ALL ON FUNCTION public.request_withdrawal(numeric, payment_method, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.review_withdrawal(uuid, boolean, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.subscribe_event(uuid, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.enter_event_room(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.request_withdrawal(numeric, payment_method, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_withdrawal(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.subscribe_event(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.enter_event_room(uuid) TO authenticated;
