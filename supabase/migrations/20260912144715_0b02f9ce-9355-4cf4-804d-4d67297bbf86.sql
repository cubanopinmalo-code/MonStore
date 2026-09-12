
CREATE TABLE public.payment_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_method payment_method NOT NULL DEFAULT 'saldo_movil',
  line_number smallint NOT NULL,
  label text NOT NULL DEFAULT '',
  phone_number text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payment_method, line_number)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_lines TO authenticated;
GRANT ALL ON public.payment_lines TO service_role;
ALTER TABLE public.payment_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage payment lines" ON public.payment_lines
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_payment_lines_updated_at
BEFORE UPDATE ON public.payment_lines
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.payment_lines (payment_method, line_number, label, phone_number)
VALUES
  ('saldo_movil', 1, 'Línea 1', '51115040'),
  ('saldo_movil', 2, 'Línea 2', '53839874'),
  ('saldo_movil', 3, 'Línea 3', '51621305');

ALTER TABLE public.deposits
  ADD COLUMN line_id uuid REFERENCES public.payment_lines(id) ON DELETE SET NULL,
  ADD COLUMN line_number smallint,
  ADD COLUMN line_phone text,
  ADD COLUMN line_assigned_at timestamptz,
  ADD COLUMN line_released_at timestamptz;

CREATE INDEX deposits_line_pending_idx ON public.deposits (line_id) WHERE status = 'pendiente';

CREATE TABLE public.payment_line_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  line_id uuid REFERENCES public.payment_lines(id) ON DELETE SET NULL,
  deposit_id uuid REFERENCES public.deposits(id) ON DELETE SET NULL,
  user_id uuid,
  actor_id uuid,
  action text NOT NULL,
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.payment_line_events TO authenticated;
GRANT ALL ON public.payment_line_events TO service_role;
ALTER TABLE public.payment_line_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read line history" ON public.payment_line_events
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users read own line history" ON public.payment_line_events
FOR SELECT TO authenticated
USING (user_id = auth.uid());

ALTER TABLE public.platform_settings
  ADD COLUMN allow_line_reuse boolean NOT NULL DEFAULT false;

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
  IF auth.uid() IS NOT NULL AND p_user IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'No puedes registrar solicitudes de otra persona.';
  END IF;
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión.';
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

CREATE OR REPLACE FUNCTION public.review_deposit(p_deposit uuid, p_approve boolean, p_reason text, p_admin uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_dep record;
  v_wallet record;
  v_before numeric;
  v_after numeric;
BEGIN
  IF auth.uid() IS NOT NULL AND p_admin IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'No puedes revisar solicitudes de otra persona.';
  END IF;
  IF p_admin IS NULL OR NOT public.has_role(p_admin, 'admin') THEN
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
    SET status = 'aprobado', reviewed_by = p_admin, reviewed_at = now(),
        line_released_at = COALESCE(line_released_at, now())
    WHERE id = p_deposit;

    INSERT INTO public.notifications (user_id, title, message, type, read)
    VALUES (
      v_dep.user_id, 'Fondos acreditados',
      'Acreditamos ' || trim(trailing '.' FROM to_char(v_dep.credited_amount, 'FM999999990.00')) ||
        ' CUP en tu wallet.',
      'deposito_aprobado', false
    );
  ELSE
    UPDATE public.deposits
    SET status = 'rechazado', reviewed_by = p_admin, reviewed_at = now(),
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
      v_dep.line_id, p_deposit, v_dep.user_id, p_admin,
      CASE WHEN p_approve THEN 'liberada_aprobacion' ELSE 'liberada_rechazo' END,
      'Línea ' || COALESCE(v_dep.line_number::text, '—') || ' liberada al ' ||
        CASE WHEN p_approve THEN 'aprobar' ELSE 'rechazar' END || ' la solicitud.'
    );
  END IF;

  RETURN jsonb_build_object('deposit_id', p_deposit, 'changed', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.release_payment_line(p_deposit uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_dep record;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Solo el administrador puede liberar una línea.';
  END IF;

  SELECT * INTO v_dep FROM public.deposits WHERE id = p_deposit FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No encontramos esa solicitud.';
  END IF;
  IF v_dep.line_id IS NULL THEN
    RAISE EXCEPTION 'Esa solicitud no tiene una línea asignada.';
  END IF;
  IF v_dep.line_released_at IS NOT NULL THEN
    RETURN jsonb_build_object('deposit_id', p_deposit, 'released', false);
  END IF;

  UPDATE public.deposits SET line_released_at = now() WHERE id = p_deposit;

  INSERT INTO public.payment_line_events (line_id, deposit_id, user_id, actor_id, action, note)
  VALUES (
    v_dep.line_id, p_deposit, v_dep.user_id, auth.uid(), 'liberada_manual',
    COALESCE(NULLIF(trim(COALESCE(p_reason, '')), ''), 'Liberada manualmente por el administrador.')
  );

  RETURN jsonb_build_object('deposit_id', p_deposit, 'released', true);
END;
$function$;
