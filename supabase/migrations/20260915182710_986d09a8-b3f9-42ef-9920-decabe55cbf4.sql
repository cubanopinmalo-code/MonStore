-- lovable-cron-fallback-reviewed: 1440 runs/day; la activación y el cobro deben ocurrir en el minuto exacto de inicio configurado por el administrador, sin depender de nadie conectado
-- Momento exacto de inicio en zona America/Havana
CREATE OR REPLACE FUNCTION public.event_start_moment(p_date date, p_time text)
RETURNS timestamptz LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT CASE WHEN p_date IS NULL THEN NULL
    ELSE ((p_date::text || ' ' || COALESCE(NULLIF(trim(p_time), ''), '00:00'))::timestamp
          AT TIME ZONE 'America/Havana') END
$$;

CREATE OR REPLACE FUNCTION public.notify_event_admins(p_title text, p_message text, p_key text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  FOR r IN SELECT user_id FROM public.user_roles WHERE role = 'admin' LOOP
    INSERT INTO public.notifications (user_id, title, message, type, read, dedupe_key)
    VALUES (r.user_id, p_title, p_message, 'evento', false, p_key || ':' || r.user_id)
    ON CONFLICT DO NOTHING;
  END LOOP;
END; $$;

CREATE OR REPLACE FUNCTION public.notify_event_users(p_event uuid, p_title text, p_message text, p_key text, p_only_confirmed boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  FOR r IN SELECT user_id FROM public.event_subscriptions
    WHERE event_id = p_event AND status <> 'cancelado'
      AND (NOT p_only_confirmed OR payment_status = 'pagado')
  LOOP
    INSERT INTO public.notifications (user_id, title, message, type, read, dedupe_key)
    VALUES (r.user_id, p_title, p_message, 'evento', false, p_key || ':' || p_event || ':' || r.user_id)
    ON CONFLICT DO NOTHING;
  END LOOP;
END; $$;

-- ADMIN: crear evento
CREATE OR REPLACE FUNCTION public.admin_create_event(p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_date date; v_time text; v_min int; v_max int; v_price numeric;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Solo administración.'; END IF;
  v_date := NULLIF(p_payload->>'event_date','')::date;
  v_time := COALESCE(NULLIF(trim(p_payload->>'event_time'),''), '');
  v_min := COALESCE((p_payload->>'min_participants')::int, 0);
  v_max := COALESCE((p_payload->>'max_participants')::int, 0);
  v_price := COALESCE((p_payload->>'entry_price')::numeric, 0);
  IF COALESCE(NULLIF(trim(p_payload->>'name'),''), '') = '' THEN RAISE EXCEPTION 'Escribe el nombre del evento.'; END IF;
  IF COALESCE(NULLIF(trim(p_payload->>'prize'),''), '') = '' THEN RAISE EXCEPTION 'Escribe el premio del evento.'; END IF;
  IF p_payload->>'game_id' IS NULL THEN RAISE EXCEPTION 'Selecciona el juego.'; END IF;
  IF v_date IS NULL OR v_time = '' THEN RAISE EXCEPTION 'Indica la fecha y la hora del evento.'; END IF;
  IF v_min < 1 OR v_max < 1 OR v_min > v_max THEN RAISE EXCEPTION 'Revisa el mínimo y el máximo de participantes.'; END IF;
  IF v_price < 0 THEN RAISE EXCEPTION 'El precio no puede ser negativo.'; END IF;

  INSERT INTO public.events (
    name, game_id, event_type, prize, region, min_participants, max_participants,
    event_date, event_time, entry_price, currency, description, banner_url,
    entry_window_minutes, status, starts_at
  ) VALUES (
    trim(p_payload->>'name'), (p_payload->>'game_id')::uuid,
    COALESCE(NULLIF(p_payload->>'event_type',''), 'sala_personalizada'),
    trim(p_payload->>'prize'), COALESCE(p_payload->>'region',''), v_min, v_max,
    v_date, v_time, v_price, COALESCE(NULLIF(p_payload->>'currency',''), 'CUP'),
    COALESCE(p_payload->>'description',''), NULLIF(p_payload->>'banner_url',''),
    COALESCE((p_payload->>'entry_window_minutes')::int, 15),
    'inscripciones_abiertas', public.event_start_moment(v_date, v_time)
  ) RETURNING id INTO v_id;

  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, note, event_id)
  VALUES (auth.uid(), 'event_created', 'event', v_id, 'Evento creado', v_id);
  RETURN jsonb_build_object('ok', true, 'event_id', v_id);
END; $$;

-- ADMIN: editar evento
CREATE OR REPLACE FUNCTION public.admin_update_event(p_event uuid, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_event record; v_date date; v_time text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Solo administración.'; END IF;
  SELECT * INTO v_event FROM public.events WHERE id = p_event FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No encontramos ese evento.'; END IF;
  IF v_event.status NOT IN ('proximamente','inscripciones_abiertas','meta_alcanzada') THEN
    RAISE EXCEPTION 'Este evento ya no se puede editar.';
  END IF;
  v_date := COALESCE(NULLIF(p_payload->>'event_date','')::date, v_event.event_date);
  v_time := COALESCE(NULLIF(trim(p_payload->>'event_time'),''), v_event.event_time);

  UPDATE public.events SET
    name = COALESCE(NULLIF(trim(p_payload->>'name'),''), name),
    game_id = COALESCE(NULLIF(p_payload->>'game_id','')::uuid, game_id),
    event_type = COALESCE(NULLIF(p_payload->>'event_type',''), event_type),
    prize = COALESCE(NULLIF(trim(p_payload->>'prize'),''), prize),
    region = COALESCE(p_payload->>'region', region),
    min_participants = COALESCE((p_payload->>'min_participants')::int, min_participants),
    max_participants = COALESCE((p_payload->>'max_participants')::int, max_participants),
    event_date = v_date, event_time = v_time,
    entry_price = COALESCE((p_payload->>'entry_price')::numeric, entry_price),
    description = COALESCE(p_payload->>'description', description),
    banner_url = COALESCE(NULLIF(p_payload->>'banner_url',''), banner_url),
    entry_window_minutes = COALESCE((p_payload->>'entry_window_minutes')::int, entry_window_minutes),
    starts_at = public.event_start_moment(v_date, v_time),
    updated_at = now()
  WHERE id = p_event;

  IF (SELECT min_participants > max_participants FROM public.events WHERE id = p_event) THEN
    RAISE EXCEPTION 'Revisa el mínimo y el máximo de participantes.';
  END IF;

  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, note, event_id)
  VALUES (auth.uid(), 'event_updated', 'event', p_event, 'Evento editado', p_event);
  RETURN jsonb_build_object('ok', true);
END; $$;

-- ADMIN: datos de sala (auditoría sin valores)
CREATE OR REPLACE FUNCTION public.admin_set_event_room(p_event uuid, p_room_id text, p_room_password text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_event record; v_id_changed boolean; v_pw_changed boolean; v_new_id text; v_new_pw text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Solo administración.'; END IF;
  SELECT * INTO v_event FROM public.events WHERE id = p_event FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No encontramos ese evento.'; END IF;
  IF v_event.room_locked_at IS NOT NULL OR v_event.status IN ('sala_activa','evento_iniciado','finalizado','cancelado','meta_no_alcanzada') THEN
    RAISE EXCEPTION 'Los datos de la sala ya están bloqueados.';
  END IF;

  v_new_id := NULLIF(trim(COALESCE(p_room_id, '')), '');
  v_new_pw := NULLIF(trim(COALESCE(p_room_password, '')), '');
  v_id_changed := COALESCE(v_new_id, '') <> COALESCE(v_event.room_id, '');
  v_pw_changed := COALESCE(v_new_pw, '') <> COALESCE(v_event.room_password, '');

  UPDATE public.events
  SET room_id = v_new_id, room_password = v_new_pw,
      room_updated_at = now(), room_updated_by = auth.uid(), updated_at = now()
  WHERE id = p_event;

  IF v_id_changed OR v_pw_changed THEN
    INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, note, event_id, metadata)
    VALUES (auth.uid(), 'event_room_updated', 'event', p_event,
      'Datos de sala modificados', p_event,
      jsonb_build_object('room_id_changed', v_id_changed, 'room_password_changed', v_pw_changed));
  END IF;

  RETURN jsonb_build_object('ok', true,
    'configured', v_new_id IS NOT NULL AND v_new_pw IS NOT NULL);
END; $$;

-- Inscribirse (sin cobro)
CREATE OR REPLACE FUNCTION public.subscribe_event(p_event uuid, p_game_account_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid(); v_event record; v_count int; v_id uuid; v_acc text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Debes iniciar sesión.'; END IF;
  v_acc := NULLIF(trim(COALESCE(p_game_account_id, '')), '');
  IF v_acc IS NULL THEN RAISE EXCEPTION 'Escribe el identificador de tu personaje.'; END IF;

  SELECT * INTO v_event FROM public.events WHERE id = p_event FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No encontramos ese evento.'; END IF;
  IF v_event.status IN ('evento_iniciado','finalizado') THEN
    RAISE EXCEPTION 'El evento ya comenzó y el acceso está cerrado.';
  END IF;
  IF v_event.status NOT IN ('proximamente','inscripciones_abiertas','meta_alcanzada')
     OR (v_event.starts_at IS NOT NULL AND now() >= v_event.starts_at) THEN
    RAISE EXCEPTION 'Las inscripciones de este evento no están abiertas.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.event_subscriptions WHERE event_id = p_event AND user_id = v_user AND status <> 'cancelado') THEN
    RAISE EXCEPTION 'Ya estás inscrito en este evento.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.event_subscriptions WHERE event_id = p_event AND game_account_id = v_acc AND status <> 'cancelado') THEN
    RAISE EXCEPTION 'Ese identificador ya está inscrito en este evento.';
  END IF;

  SELECT count(*) INTO v_count FROM public.event_subscriptions
  WHERE event_id = p_event AND status <> 'cancelado';
  IF v_count >= v_event.max_participants THEN RAISE EXCEPTION 'El evento ya está completo.'; END IF;

  DELETE FROM public.event_subscriptions WHERE event_id = p_event AND user_id = v_user AND status = 'cancelado';

  INSERT INTO public.event_subscriptions (event_id, user_id, game_account_id, status, payment_status)
  VALUES (p_event, v_user, v_acc, 'inscrito', 'pending')
  RETURNING id INTO v_id;

  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, note, event_id, target_user_id)
  VALUES (v_user, 'event_subscribed', 'event_subscription', v_id, 'Inscripción sin cobro', p_event, v_user);

  RETURN jsonb_build_object('ok', true, 'subscription_id', v_id, 'participants', v_count + 1);
END; $$;

-- Cancelar inscripción (cliente)
CREATE OR REPLACE FUNCTION public.cancel_event_subscription(p_event uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid(); v_event record; v_sub record;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Debes iniciar sesión.'; END IF;
  SELECT * INTO v_event FROM public.events WHERE id = p_event;
  IF NOT FOUND THEN RAISE EXCEPTION 'No encontramos ese evento.'; END IF;
  IF v_event.status NOT IN ('proximamente','inscripciones_abiertas','meta_alcanzada') THEN
    RAISE EXCEPTION 'Ya no puedes cancelar tu inscripción en este evento.';
  END IF;
  SELECT * INTO v_sub FROM public.event_subscriptions
  WHERE event_id = p_event AND user_id = v_user FOR UPDATE;
  IF NOT FOUND OR v_sub.status = 'cancelado' THEN RAISE EXCEPTION 'No estás inscrito en este evento.'; END IF;

  UPDATE public.event_subscriptions
  SET status = 'cancelado', payment_status = 'cancelado', cancelled_at = now()
  WHERE id = v_sub.id;

  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, note, event_id, target_user_id)
  VALUES (v_user, 'event_subscription_cancelled', 'event_subscription', v_sub.id, 'Inscripción cancelada por el usuario', p_event, v_user);
  RETURN jsonb_build_object('ok', true);
END; $$;

-- Entrar a la sala (sin cobro: ya se cobró al activarse)
CREATE OR REPLACE FUNCTION public.enter_event_room(p_event uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid(); v_event record; v_sub record;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Debes iniciar sesión.'; END IF;
  SELECT * INTO v_event FROM public.events WHERE id = p_event;
  IF NOT FOUND THEN RAISE EXCEPTION 'No encontramos ese evento.'; END IF;
  IF v_event.status IN ('evento_iniciado','finalizado') THEN
    RAISE EXCEPTION 'El evento ya comenzó y el acceso está cerrado.';
  END IF;
  IF v_event.status <> 'sala_activa' OR v_event.room_activated_at IS NULL THEN
    RAISE EXCEPTION 'La sala todavía no está activa.';
  END IF;
  IF v_event.entry_closes_at IS NOT NULL AND now() > v_event.entry_closes_at THEN
    RAISE EXCEPTION 'La ventana para entrar a la sala ya cerró.';
  END IF;

  SELECT * INTO v_sub FROM public.event_subscriptions
  WHERE event_id = p_event AND user_id = v_user FOR UPDATE;
  IF NOT FOUND OR v_sub.status = 'cancelado' THEN RAISE EXCEPTION 'No estás inscrito en este evento.'; END IF;
  IF v_sub.payment_status <> 'pagado' THEN
    RAISE EXCEPTION 'Tu participación no quedó confirmada en este evento.';
  END IF;

  IF v_sub.entered_at IS NULL THEN
    UPDATE public.event_subscriptions SET status = 'en_sala', entered_at = now() WHERE id = v_sub.id;
    INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, note, event_id, target_user_id)
    VALUES (v_user, 'event_room_entered', 'event_subscription', v_sub.id, 'Acceso a la sala', p_event, v_user);
  END IF;

  RETURN jsonb_build_object('room_id', v_event.room_id, 'room_password', v_event.room_password, 'charged', false);
END; $$;

-- Evaluación final: activa y cobra solo en la hora exacta
CREATE OR REPLACE FUNCTION public.evaluate_event_activation(p_event uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_event record; v_count int; v_confirmed int := 0; v_revenue numeric := 0;
  r record; v_wallet record; v_before numeric; v_after numeric; v_tx uuid;
BEGIN
  SELECT * INTO v_event FROM public.events WHERE id = p_event FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No encontramos ese evento.'; END IF;
  IF v_event.status NOT IN ('proximamente','inscripciones_abiertas','meta_alcanzada') THEN
    RETURN jsonb_build_object('ok', true, 'skipped', true);
  END IF;
  IF v_event.starts_at IS NULL OR now() < v_event.starts_at THEN
    RETURN jsonb_build_object('ok', true, 'skipped', true);
  END IF;

  UPDATE public.events SET entry_closed_at = NULL, room_locked_at = now() WHERE id = p_event;

  SELECT count(*) INTO v_count FROM public.event_subscriptions
  WHERE event_id = p_event AND status <> 'cancelado';

  IF v_count < v_event.min_participants THEN
    UPDATE public.events SET status = 'cancelado', cancelled_at = now(),
      cancel_reason = 'No se alcanzó la cantidad mínima de participantes.' WHERE id = p_event;
    PERFORM public.notify_event_users(p_event, 'Evento cancelado',
      'El evento fue cancelado porque no se alcanzó la cantidad mínima de participantes.', 'event_cancel_goal');
    PERFORM public.notify_event_admins('Evento cancelado',
      'El evento ' || v_event.name || ' fue cancelado por falta de participantes.', 'event_cancel_goal:' || p_event);
    INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, note, event_id)
    VALUES (NULL, 'event_cancelled_no_goal', 'event', p_event, 'Cancelado por falta de meta', p_event);
    RETURN jsonb_build_object('ok', true, 'cancelled', 'meta');
  END IF;

  IF COALESCE(v_event.room_id,'') = '' OR COALESCE(v_event.room_password,'') = '' THEN
    UPDATE public.events SET status = 'cancelado', cancelled_at = now(),
      cancel_reason = 'Los datos de acceso a la sala no fueron configurados antes de la hora de inicio.' WHERE id = p_event;
    PERFORM public.notify_event_users(p_event, 'Evento cancelado',
      'El evento fue cancelado porque los datos de acceso a la sala no fueron configurados antes de la hora de inicio.', 'event_cancel_room');
    PERFORM public.notify_event_admins('Evento cancelado',
      'El evento ' || v_event.name || ' fue cancelado porque la sala no se configuró a tiempo.', 'event_cancel_room:' || p_event);
    INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, note, event_id)
    VALUES (NULL, 'event_cancelled_no_room', 'event', p_event, 'Cancelado por sala sin configurar', p_event);
    RETURN jsonb_build_object('ok', true, 'cancelled', 'sala');
  END IF;

  FOR r IN SELECT * FROM public.event_subscriptions
    WHERE event_id = p_event AND status <> 'cancelado' ORDER BY created_at FOR UPDATE
  LOOP
    IF v_event.entry_price <= 0 THEN
      UPDATE public.event_subscriptions SET status = 'confirmado', payment_status = 'pagado',
        charged_at = now(), charge_amount = 0, charge_error = '' WHERE id = r.id;
      v_confirmed := v_confirmed + 1;
      CONTINUE;
    END IF;
    IF r.payment_status = 'pagado' THEN v_confirmed := v_confirmed + 1; CONTINUE; END IF;

    SELECT * INTO v_wallet FROM public.wallets WHERE user_id = r.user_id FOR UPDATE;
    IF NOT FOUND OR (v_wallet.balance - v_event.entry_price) < 0 THEN
      UPDATE public.event_subscriptions SET status = 'no_confirmado', payment_status = 'pending',
        charge_error = 'Saldo insuficiente al momento de activar el evento.' WHERE id = r.id;
      INSERT INTO public.notifications (user_id, title, message, type, read, dedupe_key)
      VALUES (r.user_id, 'No pudimos confirmar tu participación',
        'No tenías saldo suficiente para el evento ' || v_event.name || '.', 'evento', false,
        'event_charge_failed:' || p_event || ':' || r.user_id) ON CONFLICT DO NOTHING;
      CONTINUE;
    END IF;

    v_before := v_wallet.balance;
    v_after := v_before - v_event.entry_price;
    UPDATE public.wallets SET balance = v_after, updated_at = now() WHERE id = v_wallet.id;
    INSERT INTO public.wallet_transactions (wallet_id, user_id, type, amount, balance_before, balance_after,
      reference_type, reference_id, description, status, idempotency_key)
    VALUES (v_wallet.id, r.user_id, 'event_entry', -v_event.entry_price, v_before, v_after,
      'event', p_event, 'Inscripción al evento ' || v_event.name, 'completado',
      'event_entry:' || p_event || ':' || r.user_id)
    RETURNING id INTO v_tx;

    UPDATE public.event_subscriptions SET status = 'confirmado', payment_status = 'pagado',
      charged_at = now(), charge_amount = v_event.entry_price, charge_error = '',
      wallet_transaction_id = v_tx WHERE id = r.id;
    v_confirmed := v_confirmed + 1;
    v_revenue := v_revenue + v_event.entry_price;
  END LOOP;

  IF v_confirmed < v_event.min_participants THEN
    PERFORM public.refund_event_charges(p_event);
    UPDATE public.events SET status = 'cancelado', cancelled_at = now(),
      cancel_reason = 'No hubo suficientes participantes confirmados.' WHERE id = p_event;
    PERFORM public.notify_event_users(p_event, 'Evento cancelado',
      'El evento fue cancelado porque no hubo suficientes participantes confirmados. Te devolvimos el importe.', 'event_cancel_confirmed');
    PERFORM public.notify_event_admins('Evento cancelado',
      'El evento ' || v_event.name || ' fue cancelado por confirmados insuficientes.', 'event_cancel_confirmed:' || p_event);
    INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, note, event_id)
    VALUES (NULL, 'event_cancelled_confirmed', 'event', p_event, 'Cancelado por confirmados insuficientes', p_event);
    RETURN jsonb_build_object('ok', true, 'cancelled', 'confirmados');
  END IF;

  UPDATE public.events SET status = 'sala_activa', activated_at = now(), room_activated_at = now(),
    entry_opens_at = now(),
    entry_closes_at = now() + make_interval(mins => COALESCE(entry_window_minutes, 15)),
    entry_revenue = v_revenue, updated_at = now()
  WHERE id = p_event;

  PERFORM public.notify_event_users(p_event, 'Evento activo',
    'El evento ' || v_event.name || ' está activo. Entra ahora, tienes ' ||
    COALESCE(v_event.entry_window_minutes, 15) || ' minutos.', 'event_active', true);
  PERFORM public.notify_event_admins('Evento activo',
    'El evento ' || v_event.name || ' se activó con ' || v_confirmed || ' participantes confirmados.',
    'event_active:' || p_event);
  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, note, event_id, amount)
  VALUES (NULL, 'event_activated', 'event', p_event,
    'Evento activado con ' || v_confirmed || ' confirmados', p_event, v_revenue);

  RETURN jsonb_build_object('ok', true, 'activated', true, 'confirmed', v_confirmed, 'revenue', v_revenue);
END; $$;

-- Devolución exacta e irrepetible de los cobros de un evento
CREATE OR REPLACE FUNCTION public.refund_event_charges(p_event uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_wallet record; v_before numeric; v_after numeric; v_n int := 0; v_name text;
BEGIN
  SELECT name INTO v_name FROM public.events WHERE id = p_event;
  FOR r IN SELECT * FROM public.event_subscriptions
    WHERE event_id = p_event AND charged_at IS NOT NULL AND refunded_at IS NULL
      AND charge_amount > 0 FOR UPDATE
  LOOP
    SELECT * INTO v_wallet FROM public.wallets WHERE user_id = r.user_id FOR UPDATE;
    IF NOT FOUND THEN CONTINUE; END IF;
    v_before := v_wallet.balance;
    v_after := v_before + r.charge_amount;
    UPDATE public.wallets SET balance = v_after, updated_at = now() WHERE id = v_wallet.id;
    INSERT INTO public.wallet_transactions (wallet_id, user_id, type, amount, balance_before, balance_after,
      reference_type, reference_id, description, status, idempotency_key)
    VALUES (v_wallet.id, r.user_id, 'event_refund', r.charge_amount, v_before, v_after,
      'event', p_event, 'Devolución del evento ' || COALESCE(v_name,''), 'completado',
      'event_refund:' || p_event || ':' || r.user_id)
    ON CONFLICT DO NOTHING;
    UPDATE public.event_subscriptions SET refunded_at = now(), payment_status = 'reembolsado' WHERE id = r.id;
    INSERT INTO public.notifications (user_id, title, message, type, read, dedupe_key)
    VALUES (r.user_id, 'Devolución realizada',
      'Te devolvimos el importe de tu inscripción al evento ' || COALESCE(v_name,'') || '.', 'evento', false,
      'event_refund:' || p_event || ':' || r.user_id) ON CONFLICT DO NOTHING;
    INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, note, event_id, target_user_id, amount)
    VALUES (NULL, 'event_refunded', 'event_subscription', r.id, 'Devolución de inscripción', p_event, r.user_id, r.charge_amount);
    v_n := v_n + 1;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'refunded', v_n);
END; $$;

-- ADMIN: marcar evento iniciado y preparar los mensajes de texto (solo confirmados)
CREATE OR REPLACE FUNCTION public.admin_start_event(p_event uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_event record; v_msgs jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Solo administración.'; END IF;
  SELECT * INTO v_event FROM public.events WHERE id = p_event FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No encontramos ese evento.'; END IF;
  IF v_event.status = 'evento_iniciado' THEN
    -- idempotente: no reenvía ni duplica
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id', l.id, 'user_id', l.user_id, 'phone', l.phone)), '[]'::jsonb)
    INTO v_msgs FROM public.event_sms_log l
    WHERE l.event_id = p_event AND l.status = 'pendiente';
    RETURN jsonb_build_object('ok', true, 'already', true, 'messages', v_msgs, 'event_name', v_event.name);
  END IF;
  IF v_event.status <> 'sala_activa' THEN
    RAISE EXCEPTION 'Solo puedes iniciar un evento que está activo.';
  END IF;

  UPDATE public.events SET status = 'evento_iniciado', started_at = now(), started_by = auth.uid(),
    entry_closed_at = COALESCE(entry_closed_at, now()), updated_at = now() WHERE id = p_event;

  INSERT INTO public.event_sms_log (event_id, user_id, phone, kind, status, idempotency_key)
  SELECT p_event, s.user_id, COALESCE(p.phone, ''), 'evento_iniciado', 'pendiente',
         'event_started:' || p_event || ':' || s.user_id
  FROM public.event_subscriptions s
  LEFT JOIN public.profiles p ON p.id = s.user_id
  WHERE s.event_id = p_event AND s.status <> 'cancelado' AND s.payment_status = 'pagado'
  ON CONFLICT DO NOTHING;

  PERFORM public.notify_event_users(p_event, 'Evento iniciado',
    'El evento ' || v_event.name || ' ya comenzó.', 'event_started', true);
  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, note, event_id, before, after)
  VALUES (auth.uid(), 'event_started', 'event', p_event, 'Evento marcado como iniciado', p_event,
    jsonb_build_object('status', v_event.status::text), jsonb_build_object('status', 'evento_iniciado'));

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', l.id, 'user_id', l.user_id, 'phone', l.phone)), '[]'::jsonb)
  INTO v_msgs FROM public.event_sms_log l
  WHERE l.event_id = p_event AND l.status = 'pendiente';

  RETURN jsonb_build_object('ok', true, 'messages', v_msgs, 'event_name', v_event.name);
END; $$;

CREATE OR REPLACE FUNCTION public.mark_event_sms(p_id uuid, p_status text, p_provider_id text, p_error text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row record;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Solo administración.'; END IF;
  UPDATE public.event_sms_log
  SET status = p_status, provider_message_id = COALESCE(p_provider_id,''),
      error_message = COALESCE(p_error,''), updated_at = now()
  WHERE id = p_id RETURNING * INTO v_row;
  IF NOT FOUND THEN RAISE EXCEPTION 'No encontramos ese envío.'; END IF;
  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, note, event_id, target_user_id)
  VALUES (auth.uid(), 'event_sms_' || p_status, 'event_sms', p_id, 'Mensaje de texto de evento', v_row.event_id, v_row.user_id);
  RETURN jsonb_build_object('ok', true);
END; $$;

-- ADMIN: buscar participante por identificador de personaje
CREATE OR REPLACE FUNCTION public.find_event_participant(p_event uuid, p_game_account_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row record;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Solo administración.'; END IF;
  SELECT s.id, s.user_id, s.game_account_id, s.character_name, s.payment_status, s.status,
         p.name, p.avatar, p.phone, e.name AS event_name, e.prize, g.name AS game_name
  INTO v_row
  FROM public.event_subscriptions s
  JOIN public.events e ON e.id = s.event_id
  LEFT JOIN public.games g ON g.id = e.game_id
  LEFT JOIN public.profiles p ON p.id = s.user_id
  WHERE s.event_id = p_event
    AND lower(trim(s.game_account_id)) = lower(trim(COALESCE(p_game_account_id,'')))
    AND s.status <> 'cancelado';
  IF NOT FOUND THEN RETURN jsonb_build_object('found', false); END IF;
  RETURN jsonb_build_object('found', true, 'subscription_id', v_row.id, 'user_id', v_row.user_id,
    'game_account_id', v_row.game_account_id, 'character_name', v_row.character_name,
    'name', v_row.name, 'avatar', v_row.avatar, 'phone', v_row.phone,
    'payment_status', v_row.payment_status, 'status', v_row.status,
    'event_name', v_row.event_name, 'prize', v_row.prize, 'game_name', v_row.game_name);
END; $$;

-- ADMIN: finalizar con ganador y recompensa
CREATE OR REPLACE FUNCTION public.finish_event(p_event uuid, p_game_account_id text, p_character_name text, p_reward_note text, p_reward_amount numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_event record; v_sub record; v_key text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Solo administración.'; END IF;
  SELECT * INTO v_event FROM public.events WHERE id = p_event FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No encontramos ese evento.'; END IF;
  IF v_event.status = 'finalizado' THEN RETURN jsonb_build_object('ok', true, 'already', true); END IF;
  IF v_event.status <> 'evento_iniciado' THEN
    RAISE EXCEPTION 'Solo puedes finalizar un evento que ya fue iniciado.';
  END IF;
  IF COALESCE(NULLIF(trim(COALESCE(p_reward_note,'')),''),'') = '' THEN
    RAISE EXCEPTION 'Escribe la recompensa entregada al ganador.';
  END IF;

  SELECT * INTO v_sub FROM public.event_subscriptions
  WHERE event_id = p_event AND lower(trim(game_account_id)) = lower(trim(COALESCE(p_game_account_id,'')))
    AND status <> 'cancelado';
  IF NOT FOUND THEN RAISE EXCEPTION 'Ese identificador de personaje no pertenece a un participante de este evento.'; END IF;
  IF v_sub.payment_status <> 'pagado' THEN
    RAISE EXCEPTION 'Ese participante no quedó confirmado en el evento.';
  END IF;

  UPDATE public.event_subscriptions
  SET character_name = COALESCE(NULLIF(trim(COALESCE(p_character_name,'')),''), character_name)
  WHERE id = v_sub.id;

  UPDATE public.events SET status = 'finalizado', finished_at = now(), finished_by = auth.uid(),
    winner_user_id = v_sub.user_id, winner_subscription_id = v_sub.id,
    winner_game_account_id = v_sub.game_account_id,
    winner_character_name = COALESCE(NULLIF(trim(COALESCE(p_character_name,'')),''), v_sub.character_name),
    reward_note = trim(p_reward_note), reward_amount = p_reward_amount,
    result_note = trim(p_reward_note), result_published_at = now(),
    prize_delivery_status = CASE WHEN COALESCE(p_reward_amount, 0) > 0 THEN 'pendiente' ELSE 'entregado' END,
    prize_delivered_at = CASE WHEN COALESCE(p_reward_amount, 0) > 0 THEN NULL ELSE now() END,
    updated_at = now()
  WHERE id = p_event;

  v_key := 'event_prize:' || p_event;
  INSERT INTO public.event_prize_deliveries (event_id, winner_user_id, subscription_id, reward_note,
    reward_amount, status, idempotency_key, actor_id)
  VALUES (p_event, v_sub.user_id, v_sub.id, trim(p_reward_note), p_reward_amount,
    CASE WHEN COALESCE(p_reward_amount, 0) > 0 THEN 'pendiente' ELSE 'entregado' END, v_key, auth.uid())
  ON CONFLICT (idempotency_key) DO NOTHING;

  INSERT INTO public.notifications (user_id, title, message, type, read, dedupe_key)
  VALUES (v_sub.user_id, 'Ganaste el evento',
    'Ganaste el evento ' || v_event.name || '. Recompensa: ' || trim(p_reward_note) || '.', 'evento', false,
    'event_winner:' || p_event) ON CONFLICT DO NOTHING;
  PERFORM public.notify_event_users(p_event, 'Evento finalizado',
    'El evento ' || v_event.name || ' finalizó. Ya puedes ver el resultado.', 'event_finished', true);
  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, note, event_id, target_user_id, amount, metadata)
  VALUES (auth.uid(), 'event_finished', 'event', p_event, 'Evento finalizado con ganador registrado', p_event,
    v_sub.user_id, p_reward_amount, jsonb_build_object('reward', trim(p_reward_note)));

  RETURN jsonb_build_object('ok', true, 'winner_user_id', v_sub.user_id);
END; $$;

-- ADMIN: entrega del premio, una sola vez
CREATE OR REPLACE FUNCTION public.deliver_event_prize(p_event uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_event record; v_del record; v_wallet record; v_before numeric; v_after numeric; v_tx uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Solo administración.'; END IF;
  SELECT * INTO v_event FROM public.events WHERE id = p_event FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No encontramos ese evento.'; END IF;
  SELECT * INTO v_del FROM public.event_prize_deliveries
  WHERE event_id = p_event ORDER BY created_at LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Este evento todavía no tiene ganador registrado.'; END IF;
  IF v_del.status = 'entregado' THEN RETURN jsonb_build_object('ok', true, 'already', true); END IF;

  IF COALESCE(v_del.reward_amount, 0) > 0 THEN
    SELECT * INTO v_wallet FROM public.wallets WHERE user_id = v_del.winner_user_id FOR UPDATE;
    IF NOT FOUND THEN
      UPDATE public.event_prize_deliveries SET status = 'error',
        error_message = 'El ganador no tiene wallet activo.' WHERE id = v_del.id;
      UPDATE public.events SET prize_delivery_status = 'error',
        prize_delivery_error = 'El ganador no tiene wallet activo.' WHERE id = p_event;
      RETURN jsonb_build_object('ok', false, 'error', 'El ganador no tiene wallet activo.');
    END IF;
    v_before := v_wallet.balance;
    v_after := v_before + v_del.reward_amount;
    UPDATE public.wallets SET balance = v_after, updated_at = now() WHERE id = v_wallet.id;
    INSERT INTO public.wallet_transactions (wallet_id, user_id, type, amount, balance_before, balance_after,
      reference_type, reference_id, description, status, idempotency_key)
    VALUES (v_wallet.id, v_del.winner_user_id, 'event_prize', v_del.reward_amount, v_before, v_after,
      'event', p_event, 'Premio del evento ' || v_event.name, 'completado', 'event_prize:' || p_event)
    ON CONFLICT DO NOTHING RETURNING id INTO v_tx;
  END IF;

  UPDATE public.event_prize_deliveries SET status = 'entregado', error_message = '',
    wallet_transaction_id = v_tx WHERE id = v_del.id;
  UPDATE public.events SET prize_delivery_status = 'entregado', prize_delivery_error = '',
    prize_delivered_at = now(), result_published_at = COALESCE(result_published_at, now()) WHERE id = p_event;

  INSERT INTO public.notifications (user_id, title, message, type, read, dedupe_key)
  VALUES (v_del.winner_user_id, 'Premio entregado',
    'Te entregamos el premio del evento ' || v_event.name || '.', 'evento', false,
    'event_prize:' || p_event) ON CONFLICT DO NOTHING;
  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, note, event_id, target_user_id, amount)
  VALUES (auth.uid(), 'event_prize_delivered', 'event', p_event, 'Premio entregado', p_event,
    v_del.winner_user_id, v_del.reward_amount);

  RETURN jsonb_build_object('ok', true);
END; $$;

-- ADMIN: cancelar evento con motivo
CREATE OR REPLACE FUNCTION public.cancel_event(p_event uuid, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_event record; v_reason text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Solo administración.'; END IF;
  v_reason := NULLIF(trim(COALESCE(p_reason,'')),'');
  IF v_reason IS NULL THEN RAISE EXCEPTION 'Escribe el motivo de la cancelación.'; END IF;
  SELECT * INTO v_event FROM public.events WHERE id = p_event FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No encontramos ese evento.'; END IF;
  IF v_event.status NOT IN ('proximamente','inscripciones_abiertas','meta_alcanzada','sala_activa') THEN
    RAISE EXCEPTION 'Este evento ya no se puede cancelar.';
  END IF;

  PERFORM public.refund_event_charges(p_event);
  UPDATE public.events SET status = 'cancelado', cancelled_at = now(), cancel_reason = v_reason,
    updated_at = now() WHERE id = p_event;
  PERFORM public.notify_event_users(p_event, 'Evento cancelado',
    'El evento ' || v_event.name || ' fue cancelado. Motivo: ' || v_reason, 'event_cancel_admin');
  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, note, event_id, before, after)
  VALUES (auth.uid(), 'event_cancelled', 'event', p_event, v_reason, p_event,
    jsonb_build_object('status', v_event.status::text), jsonb_build_object('status', 'cancelado'));
  RETURN jsonb_build_object('ok', true);
END; $$;

-- Tarea automática: cada minuto, sin depender de nadie conectado
CREATE OR REPLACE FUNCTION public.process_event_schedule()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_count int; v_activated int := 0; v_touched int := 0;
BEGIN
  -- abrir inscripciones de eventos programados
  FOR r IN SELECT * FROM public.events
    WHERE status = 'proximamente' AND starts_at IS NOT NULL
      AND now() >= starts_at - interval '7 days' AND now() < starts_at
  LOOP
    UPDATE public.events SET status = 'inscripciones_abiertas', updated_at = now() WHERE id = r.id;
    v_touched := v_touched + 1;
  END LOOP;

  -- meta alcanzada (no activa ni cobra)
  FOR r IN SELECT e.* FROM public.events e
    WHERE e.status = 'inscripciones_abiertas' AND e.goal_reached_at IS NULL
  LOOP
    SELECT count(*) INTO v_count FROM public.event_subscriptions
    WHERE event_id = r.id AND status <> 'cancelado';
    IF v_count >= r.min_participants AND r.min_participants > 0 THEN
      UPDATE public.events SET status = 'meta_alcanzada', goal_reached_at = now(), updated_at = now()
      WHERE id = r.id;
      PERFORM public.notify_event_users(r.id, 'Meta alcanzada',
        'Meta alcanzada. El evento se mantiene pendiente de activación.', 'event_goal');
      PERFORM public.notify_event_admins('Meta alcanzada',
        'El evento ' || r.name || ' alcanzó la meta mínima de participantes.', 'event_goal:' || r.id);
      INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, note, event_id)
      VALUES (NULL, 'event_goal_reached', 'event', r.id, 'Meta mínima alcanzada', r.id);
      v_touched := v_touched + 1;
    END IF;
  END LOOP;

  -- recordatorio 30 minutos
  FOR r IN SELECT * FROM public.events
    WHERE status IN ('inscripciones_abiertas','meta_alcanzada') AND starts_at IS NOT NULL
      AND reminder30_at IS NULL AND now() >= starts_at - interval '30 minutes' AND now() < starts_at
  LOOP
    UPDATE public.events SET reminder30_at = now() WHERE id = r.id;
    PERFORM public.notify_event_users(r.id, 'Tu evento comienza pronto',
      'El evento comienza en 30 minutos.', 'event_reminder30');
    INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, note, event_id)
    VALUES (NULL, 'event_reminder_30', 'event', r.id, 'Recordatorio de 30 minutos', r.id);
    v_touched := v_touched + 1;
  END LOOP;

  -- alerta administrativa 15 minutos (ventana de preparación, nunca cancela)
  FOR r IN SELECT * FROM public.events
    WHERE status IN ('inscripciones_abiertas','meta_alcanzada') AND starts_at IS NOT NULL
      AND admin_alert15_at IS NULL AND now() >= starts_at - interval '15 minutes' AND now() < starts_at
  LOOP
    UPDATE public.events SET admin_alert15_at = now() WHERE id = r.id;
    PERFORM public.notify_event_admins('Configura la sala',
      'El evento ' || r.name || ' comienza en 15 minutos. Configura la sala.', 'event_alert15:' || r.id);
    INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, note, event_id)
    VALUES (NULL, 'event_alert_15', 'event', r.id, 'Alerta administrativa de 15 minutos', r.id);
    v_touched := v_touched + 1;
  END LOOP;

  -- hora exacta: evaluación, cobro y activación
  FOR r IN SELECT * FROM public.events
    WHERE status IN ('proximamente','inscripciones_abiertas','meta_alcanzada')
      AND starts_at IS NOT NULL AND now() >= starts_at
  LOOP
    PERFORM public.evaluate_event_activation(r.id);
    v_activated := v_activated + 1;
  END LOOP;

  -- aviso 5 minutos antes del cierre de entrada
  FOR r IN SELECT * FROM public.events
    WHERE status = 'sala_activa' AND entry_closes_at IS NOT NULL AND entry_warning5_at IS NULL
      AND now() >= entry_closes_at - interval '5 minutes' AND now() < entry_closes_at
  LOOP
    UPDATE public.events SET entry_warning5_at = now() WHERE id = r.id;
    PERFORM public.notify_event_users(r.id, 'Últimos minutos',
      'Quedan 5 minutos para entrar al evento ' || r.name || '.', 'event_entry_warning', true);
    v_touched := v_touched + 1;
  END LOOP;

  -- cierre de la entrada
  FOR r IN SELECT * FROM public.events
    WHERE status = 'sala_activa' AND entry_closes_at IS NOT NULL AND entry_closed_at IS NULL
      AND now() >= entry_closes_at
  LOOP
    UPDATE public.events SET entry_closed_at = now() WHERE id = r.id;
    PERFORM public.notify_event_users(r.id, 'Entrada cerrada',
      'La ventana para entrar al evento ' || r.name || ' ya cerró.', 'event_entry_closed', true);
    PERFORM public.notify_event_admins('Entrada cerrada',
      'La entrada del evento ' || r.name || ' ya cerró.', 'event_entry_closed:' || r.id);
    INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, note, event_id)
    VALUES (NULL, 'event_entry_closed', 'event', r.id, 'Ventana de entrada cerrada', r.id);
    v_touched := v_touched + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'evaluated', v_activated, 'touched', v_touched);
END; $$;

-- Permisos: nadie puede lanzar a mano el proceso ni las devoluciones internas
REVOKE ALL ON FUNCTION public.process_event_schedule() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.evaluate_event_activation(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refund_event_charges(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_event_admins(text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_event_users(uuid, text, text, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_event_schedule() TO service_role;
GRANT EXECUTE ON FUNCTION public.evaluate_event_activation(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_event_charges(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.notify_event_admins(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.notify_event_users(uuid, text, text, text, boolean) TO service_role;

REVOKE ALL ON FUNCTION public.admin_create_event(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_update_event(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_event_room(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_start_event(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_event_sms(uuid, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.find_event_participant(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.finish_event(uuid, text, text, text, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.deliver_event_prize(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_event(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.subscribe_event(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_event_subscription(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.enter_event_room(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.event_start_moment(date, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_create_event(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_update_event(uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_event_room(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_start_event(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_event_sms(uuid, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.find_event_participant(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.finish_event(uuid, text, text, text, numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.deliver_event_prize(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_event(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.subscribe_event(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_event_subscription(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.enter_event_room(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.event_start_moment(date, text) TO authenticated, service_role;

SELECT cron.schedule('events-schedule-every-minute', '* * * * *', 'select public.process_event_schedule();');