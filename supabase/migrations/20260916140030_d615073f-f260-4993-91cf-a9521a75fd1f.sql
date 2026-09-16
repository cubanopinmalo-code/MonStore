-- ─────────────────────────────────────────────────────────────
-- 1) Transferencias: fuera el ID de transacción
-- ─────────────────────────────────────────────────────────────
UPDATE public.payment_destinations
SET requires_transaction_id = false, updated_at = now()
WHERE requires_transaction_id;

-- ─────────────────────────────────────────────────────────────
-- 2) Preferencia de avisos SMS y costo configurable
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS sms_notifications boolean NOT NULL DEFAULT false;

ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS sms_notification_cost_cup numeric NOT NULL DEFAULT 5;

-- ─────────────────────────────────────────────────────────────
-- 3) Registro independiente de los avisos SMS de fondos
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sms_notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  deposit_id uuid REFERENCES public.deposits(id) ON DELETE SET NULL,
  kind text NOT NULL DEFAULT 'fondos_acreditados',
  phone text NOT NULL DEFAULT '',
  cost numeric NOT NULL DEFAULT 0,
  charged boolean NOT NULL DEFAULT false,
  wallet_transaction_id uuid,
  status text NOT NULL DEFAULT 'pendiente',
  provider_mode text NOT NULL DEFAULT '',
  provider_message_id text NOT NULL DEFAULT '',
  error_message text NOT NULL DEFAULT '',
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS sms_notification_log_key_idx
  ON public.sms_notification_log (idempotency_key);
CREATE INDEX IF NOT EXISTS sms_notification_log_user_idx
  ON public.sms_notification_log (user_id, created_at DESC);

GRANT SELECT ON public.sms_notification_log TO authenticated;
GRANT ALL ON public.sms_notification_log TO service_role;

ALTER TABLE public.sms_notification_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sms_log_own_or_admin" ON public.sms_notification_log;
CREATE POLICY "sms_log_own_or_admin" ON public.sms_notification_log
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

DROP TRIGGER IF EXISTS sms_notification_log_updated_at ON public.sms_notification_log;
CREATE TRIGGER sms_notification_log_updated_at
  BEFORE UPDATE ON public.sms_notification_log
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─────────────────────────────────────────────────────────────
-- 4) Líneas de saldo móvil: creación y estado por el administrador
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_create_payment_line(
  p_label text,
  p_phone text,
  p_active boolean DEFAULT true,
  p_method payment_method DEFAULT 'saldo_movil'::payment_method,
  p_notes text DEFAULT ''
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_admin uuid := auth.uid();
  v_phone text;
  v_number smallint;
  v_id uuid;
  v_label text := NULLIF(trim(COALESCE(p_label, '')), '');
BEGIN
  IF v_admin IS NULL OR NOT public.has_role(v_admin, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Solo un administrador puede crear líneas de pago.';
  END IF;

  v_phone := public.normalize_cuban_mobile(p_phone);
  IF v_phone IS NULL THEN
    RAISE EXCEPTION 'Escribe un móvil cubano válido: 8 dígitos que empiezan por 5.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.payment_lines WHERE phone_number = v_phone) THEN
    RAISE EXCEPTION 'Ese número ya está asignado a otra línea.';
  END IF;

  SELECT COALESCE(max(line_number), 0) + 1 INTO v_number
  FROM public.payment_lines WHERE payment_method = p_method;

  INSERT INTO public.payment_lines (payment_method, line_number, label, phone_number, active, currency, notes)
  VALUES (p_method, v_number, COALESCE(v_label, 'Línea ' || v_number), v_phone,
          COALESCE(p_active, true), 'CUP', COALESCE(NULLIF(trim(COALESCE(p_notes, '')), ''), ''))
  RETURNING id INTO v_id;

  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, line_id, note, after)
  VALUES (v_admin, 'linea_pago_creada', 'payment_line', v_id, v_id,
          'Línea ' || v_number || ' creada por un administrador.',
          jsonb_build_object('line_number', v_number, 'phone_number', v_phone,
                             'active', COALESCE(p_active, true), 'method', p_method));

  INSERT INTO public.payment_line_events (line_id, actor_id, action, note)
  VALUES (v_id, v_admin, 'creada', 'Línea ' || v_number || ' creada con el número ' || v_phone || '.');

  RETURN jsonb_build_object('line_id', v_id, 'line_number', v_number, 'phone_number', v_phone);
END; $function$;

CREATE OR REPLACE FUNCTION public.admin_set_payment_line_active(p_line uuid, p_active boolean)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_admin uuid := auth.uid();
  v_line public.payment_lines;
BEGIN
  IF v_admin IS NULL OR NOT public.has_role(v_admin, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Solo un administrador puede cambiar las líneas de pago.';
  END IF;

  SELECT * INTO v_line FROM public.payment_lines WHERE id = p_line FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Esa línea no existe.';
  END IF;

  UPDATE public.payment_lines
  SET active = COALESCE(p_active, active), updated_at = now()
  WHERE id = p_line;

  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, line_id, note, before, after)
  VALUES (v_admin,
          CASE WHEN COALESCE(p_active, true) THEN 'linea_pago_activada' ELSE 'linea_pago_desactivada' END,
          'payment_line', p_line, p_line,
          'Estado de la línea ' || v_line.line_number || ' cambiado por un administrador.',
          jsonb_build_object('active', v_line.active),
          jsonb_build_object('active', COALESCE(p_active, v_line.active)));

  INSERT INTO public.payment_line_events (line_id, actor_id, action, note)
  VALUES (p_line, v_admin,
          CASE WHEN COALESCE(p_active, true) THEN 'activada' ELSE 'desactivada' END,
          'Línea ' || v_line.line_number || ' ' ||
          CASE WHEN COALESCE(p_active, true) THEN 'activada' ELSE 'desactivada' END || '.');

  RETURN jsonb_build_object('line_id', p_line, 'active', COALESCE(p_active, v_line.active));
END; $function$;

REVOKE ALL ON FUNCTION public.admin_create_payment_line(text, text, boolean, payment_method, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_payment_line_active(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_create_payment_line(text, text, boolean, payment_method, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_payment_line_active(uuid, boolean) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────
-- 5) Solicitud de fondos: sin ID de transacción y sin reutilizar
--    una línea que tenga una solicitud pendiente
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.request_deposit_v2(
  p_user uuid, p_amount numeric, p_method payment_method, p_reference text,
  p_has_proof boolean, p_destination uuid DEFAULT NULL::uuid,
  p_transaction_id text DEFAULT NULL::text, p_sender_phone text DEFAULT NULL::text,
  p_proof_url text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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
    -- El identificador de transacción ya no se solicita en ningún método.
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
    v_ref := COALESCE(v_sender, v_txn,
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

    -- El saldo móvil nunca reutiliza una línea con solicitud pendiente.
    IF NOT FOUND AND COALESCE(v_reuse, false) AND p_method <> 'saldo_movil' THEN
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
END; $function$;

-- ─────────────────────────────────────────────────────────────
-- 6) Aviso SMS tras acreditar fondos: cobro idempotente
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.prepare_funds_sms(p_deposit uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_admin uuid := auth.uid();
  v_dep record;
  v_profile record;
  v_cost numeric;
  v_wallet record;
  v_before numeric;
  v_after numeric;
  v_key text;
  v_log uuid;
  v_txn uuid;
  v_phone text;
BEGIN
  IF v_admin IS NULL OR NOT public.has_role(v_admin, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Solo el administrador puede enviar este aviso.';
  END IF;

  SELECT * INTO v_dep FROM public.deposits WHERE id = p_deposit FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('send', false, 'reason', 'solicitud_no_encontrada');
  END IF;
  IF v_dep.status <> 'aprobado' THEN
    RETURN jsonb_build_object('send', false, 'reason', 'fondos_no_acreditados');
  END IF;

  v_key := 'deposit_sms:' || p_deposit::text;
  IF EXISTS (SELECT 1 FROM public.sms_notification_log WHERE idempotency_key = v_key) THEN
    RETURN jsonb_build_object('send', false, 'reason', 'ya_registrado');
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_dep.user_id;
  IF NOT FOUND OR NOT COALESCE(v_profile.sms_notifications, false) THEN
    RETURN jsonb_build_object('send', false, 'reason', 'avisos_desactivados');
  END IF;

  v_phone := public.normalize_cuban_mobile(v_profile.phone);
  IF v_phone IS NULL THEN
    RETURN jsonb_build_object('send', false, 'reason', 'sin_telefono_valido');
  END IF;

  SELECT COALESCE(sms_notification_cost_cup, 0) INTO v_cost FROM public.platform_settings LIMIT 1;
  v_cost := GREATEST(COALESCE(v_cost, 0), 0);

  SELECT * INTO v_wallet FROM public.wallets WHERE user_id = v_dep.user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('send', false, 'reason', 'sin_wallet');
  END IF;
  IF v_cost > 0 AND v_wallet.balance < v_cost THEN
    RETURN jsonb_build_object('send', false, 'reason', 'saldo_insuficiente');
  END IF;

  INSERT INTO public.sms_notification_log (
    user_id, deposit_id, kind, phone, cost, charged, status, idempotency_key
  ) VALUES (
    v_dep.user_id, p_deposit, 'fondos_acreditados', v_phone, v_cost, v_cost > 0, 'pendiente', v_key
  ) RETURNING id INTO v_log;

  IF v_cost > 0 THEN
    v_before := v_wallet.balance;
    v_after := v_before - v_cost;
    UPDATE public.wallets SET balance = v_after, updated_at = now() WHERE id = v_wallet.id;

    INSERT INTO public.wallet_transactions (
      wallet_id, user_id, type, amount, balance_before, balance_after,
      reference_type, reference_id, description, status, idempotency_key
    ) VALUES (
      v_wallet.id, v_dep.user_id, 'sms', -v_cost, v_before, v_after,
      'sms_notification', v_log, 'Aviso SMS de fondos acreditados', 'completado', v_key
    ) RETURNING id INTO v_txn;

    UPDATE public.sms_notification_log SET wallet_transaction_id = v_txn WHERE id = v_log;
  END IF;

  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, target_user_id, amount, note, after)
  VALUES (v_admin, 'sms_fondos_cobrado', 'sms_notification', v_log, v_dep.user_id, v_cost,
          'Aviso SMS de fondos acreditados preparado y cobrado.',
          jsonb_build_object('deposit', p_deposit, 'cost', v_cost));

  RETURN jsonb_build_object('send', true, 'log_id', v_log, 'phone', v_phone, 'cost', v_cost);
END; $function$;

CREATE OR REPLACE FUNCTION public.mark_funds_sms(
  p_log uuid, p_status text, p_provider_mode text DEFAULT '',
  p_provider_id text DEFAULT '', p_error text DEFAULT '')
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_admin uuid := auth.uid();
  v_log record;
  v_wallet record;
  v_before numeric;
  v_after numeric;
  v_status text := CASE WHEN p_status = 'enviado' THEN 'enviado' ELSE 'fallido' END;
BEGIN
  IF v_admin IS NULL OR NOT public.has_role(v_admin, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Solo el administrador puede registrar el resultado del aviso.';
  END IF;

  SELECT * INTO v_log FROM public.sms_notification_log WHERE id = p_log FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No encontramos ese aviso.';
  END IF;
  IF v_log.status <> 'pendiente' THEN
    RETURN jsonb_build_object('changed', false, 'status', v_log.status);
  END IF;

  -- Si el aviso no llegó a enviarse se devuelve el importe cobrado.
  IF v_status = 'fallido' AND v_log.charged AND v_log.cost > 0 THEN
    SELECT * INTO v_wallet FROM public.wallets WHERE user_id = v_log.user_id FOR UPDATE;
    IF FOUND THEN
      v_before := v_wallet.balance;
      v_after := v_before + v_log.cost;
      UPDATE public.wallets SET balance = v_after, updated_at = now() WHERE id = v_wallet.id;
      INSERT INTO public.wallet_transactions (
        wallet_id, user_id, type, amount, balance_before, balance_after,
        reference_type, reference_id, description, status, idempotency_key
      ) VALUES (
        v_wallet.id, v_log.user_id, 'ajuste', v_log.cost, v_before, v_after,
        'sms_notification', p_log, 'Devolución del aviso SMS que no se pudo enviar', 'completado',
        v_log.idempotency_key || ':refund'
      );
    END IF;
    UPDATE public.sms_notification_log SET charged = false WHERE id = p_log;
  END IF;

  UPDATE public.sms_notification_log
  SET status = v_status,
      provider_mode = COALESCE(NULLIF(trim(COALESCE(p_provider_mode, '')), ''), provider_mode),
      provider_message_id = COALESCE(NULLIF(trim(COALESCE(p_provider_id, '')), ''), provider_message_id),
      error_message = COALESCE(NULLIF(trim(COALESCE(p_error, '')), ''), '')
  WHERE id = p_log;

  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, target_user_id, amount, note, after)
  VALUES (v_admin, 'sms_fondos_resultado', 'sms_notification', p_log, v_log.user_id, v_log.cost,
          'Resultado del aviso SMS registrado.',
          jsonb_build_object('status', v_status, 'refunded', v_status = 'fallido' AND v_log.charged));

  RETURN jsonb_build_object('changed', true, 'status', v_status);
END; $function$;

REVOKE ALL ON FUNCTION public.prepare_funds_sms(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_funds_sms(uuid, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prepare_funds_sms(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_funds_sms(uuid, text, text, text, text) TO authenticated, service_role;