-- 1) Las tres líneas de saldo móvil existen siempre (sin número hasta que el admin lo escriba).
INSERT INTO public.payment_lines (payment_method, line_number, label, phone_number, active, currency)
VALUES ('saldo_movil', 1, 'Línea 1', '', true, 'CUP'),
       ('saldo_movil', 2, 'Línea 2', '', true, 'CUP'),
       ('saldo_movil', 3, 'Línea 3', '', true, 'CUP')
ON CONFLICT (payment_method, line_number) DO NOTHING;

-- 2) Normalizador y validador de móvil cubano (8 dígitos que empiezan por 5).
CREATE OR REPLACE FUNCTION public.normalize_cuban_mobile(p_phone text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v text := regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g');
BEGIN
  IF length(v) = 10 AND left(v, 2) = '53' THEN
    v := right(v, 8);
  END IF;
  IF v ~ '^5[0-9]{7}$' THEN
    RETURN v;
  END IF;
  RETURN NULL;
END; $$;

-- 3) Guardar una línea: admin, formato cubano, sin duplicados y con auditoría.
CREATE OR REPLACE FUNCTION public.admin_save_payment_line(
  p_line uuid, p_label text, p_phone text, p_active boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_line public.payment_lines;
  v_phone text;
  v_label text := NULLIF(trim(COALESCE(p_label, '')), '');
BEGIN
  IF v_admin IS NULL OR NOT public.has_role(v_admin, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Solo un administrador puede cambiar las líneas de pago.';
  END IF;

  SELECT * INTO v_line FROM public.payment_lines WHERE id = p_line FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Esa línea no existe.';
  END IF;

  v_phone := public.normalize_cuban_mobile(p_phone);
  IF v_phone IS NULL THEN
    RAISE EXCEPTION 'Escribe un móvil cubano válido: 8 dígitos que empiezan por 5.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.payment_lines
    WHERE id <> p_line AND phone_number = v_phone
  ) THEN
    RAISE EXCEPTION 'Ese número ya está asignado a otra línea.';
  END IF;

  UPDATE public.payment_lines
  SET label = COALESCE(v_label, label),
      phone_number = v_phone,
      active = COALESCE(p_active, active),
      updated_at = now()
  WHERE id = p_line;

  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, line_id, note, before, after)
  VALUES (
    v_admin, 'linea_pago_actualizada', 'payment_line', p_line, p_line,
    'Línea ' || v_line.line_number || ' actualizada por un administrador.',
    jsonb_build_object('line_number', v_line.line_number, 'phone_number', v_line.phone_number,
                       'label', v_line.label, 'active', v_line.active),
    jsonb_build_object('line_number', v_line.line_number, 'phone_number', v_phone,
                       'label', COALESCE(v_label, v_line.label), 'active', COALESCE(p_active, v_line.active))
  );

  INSERT INTO public.payment_line_events (line_id, actor_id, action, note)
  VALUES (p_line, v_admin, 'actualizada',
    'Número cambiado de ' || COALESCE(NULLIF(v_line.phone_number, ''), 'sin número') || ' a ' || v_phone || '.');

  RETURN jsonb_build_object('saved', true, 'phone_number', v_phone);
END; $$;

REVOKE ALL ON FUNCTION public.admin_save_payment_line(uuid, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_save_payment_line(uuid, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_cuban_mobile(text) TO authenticated, service_role;

-- 4) Retiro: la comisión sale SOLO de la configuración global. Sin respaldo del 5%.
CREATE OR REPLACE FUNCTION public.request_withdrawal(p_amount numeric, p_method payment_method, p_destination text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_set record; v_wallet record; v_plat record;
  v_conv_pct numeric := 0; v_fee_pct numeric;
  v_conv numeric; v_fee numeric; v_net numeric;
  v_before numeric; v_after numeric; v_id uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Debes iniciar sesión.'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Escribe un importe válido.'; END IF;
  IF p_method = 'wallet' THEN RAISE EXCEPTION 'Método de retiro no válido.'; END IF;
  IF p_destination IS NULL OR length(trim(p_destination)) < 5 THEN
    RAISE EXCEPTION 'Escribe el destino donde quieres recibir el dinero.';
  END IF;

  SELECT * INTO v_plat FROM public.platform_settings LIMIT 1;
  IF COALESCE(v_plat.min_withdrawal_cup, 0) > 0 AND p_amount < v_plat.min_withdrawal_cup THEN
    RAISE EXCEPTION 'El retiro mínimo es % CUP.', trim(trailing '.' FROM to_char(v_plat.min_withdrawal_cup, 'FM999999990.00'));
  END IF;

  v_fee_pct := v_plat.withdrawal_fee_pct;
  IF v_fee_pct IS NULL OR v_fee_pct < 0 OR v_fee_pct > 100 THEN
    RAISE EXCEPTION 'El administrador aún no configuró la comisión de retiro.';
  END IF;

  SELECT * INTO v_set FROM public.payment_settings WHERE payment_method = p_method AND active = true LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ese método de retiro no está disponible.'; END IF;
  v_conv_pct := COALESCE(v_set.withdrawal_conversion_pct, 0);

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
    jsonb_build_object('status', 'pendiente', 'fee_pct', v_fee_pct, 'fee', v_fee, 'net', v_net, 'held', p_amount));

  INSERT INTO public.notifications (user_id, title, message, type, read)
  VALUES (v_user, 'Solicitud de retiro enviada',
    'Retuvimos ' || trim(trailing '.' FROM to_char(p_amount, 'FM999999990.00')) ||
    ' CUP de tu wallet. Recibirás ' || trim(trailing '.' FROM to_char(v_net, 'FM999999990.00')) ||
    ' CUP al completarse. Si se rechaza, te lo devolvemos.', 'retiro_pendiente', false);

  RETURN jsonb_build_object('withdrawal_id', v_id, 'net', v_net, 'balance', v_after, 'held', p_amount, 'fee_pct', v_fee_pct);
END; $$;

-- 5) Depósito: remitente obligatorio en saldo móvil y solo líneas con número listo.
CREATE OR REPLACE FUNCTION public.request_deposit_v2(
  p_user uuid, p_amount numeric, p_method payment_method, p_reference text, p_has_proof boolean,
  p_destination uuid DEFAULT NULL::uuid, p_transaction_id text DEFAULT NULL::text,
  p_sender_phone text DEFAULT NULL::text, p_proof_url text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  -- Saldo móvil: el número desde el que el cliente envía el saldo es obligatorio.
  IF p_method = 'saldo_movil' THEN
    v_sender := public.normalize_cuban_mobile(v_sender);
    IF v_sender IS NULL THEN
      RAISE EXCEPTION 'Escribe el móvil cubano desde el que enviarás el saldo (8 dígitos que empiezan por 5).';
    END IF;
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
    IF v_dest.requires_sender_phone AND v_sender IS NULL THEN
      RAISE EXCEPTION 'Escribe el número desde el que realizas el pago.';
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

  -- Solo cuentan las líneas activas que ya tienen número configurado.
  SELECT EXISTS (
    SELECT 1 FROM public.payment_lines
    WHERE payment_method = p_method AND active AND public.normalize_cuban_mobile(phone_number) IS NOT NULL
  ) INTO v_has_lines;

  IF p_method = 'saldo_movil' AND NOT v_has_lines THEN
    RAISE EXCEPTION 'El administrador todavía no configuró las líneas de saldo móvil.';
  END IF;

  IF v_has_lines THEN
    SELECT COALESCE(allow_line_reuse, false) INTO v_reuse FROM public.platform_settings LIMIT 1;

    SELECT l.* INTO v_line
    FROM public.payment_lines l
    WHERE l.active
      AND l.payment_method = p_method
      AND public.normalize_cuban_mobile(l.phone_number) IS NOT NULL
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
        AND public.normalize_cuban_mobile(l.phone_number) IS NOT NULL
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
END; $$;