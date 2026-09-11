
CREATE OR REPLACE FUNCTION public.request_deposit(
  p_amount numeric,
  p_method payment_method,
  p_reference text,
  p_has_proof boolean
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_rate numeric;
  v_bonus numeric := 0;
  v_credited numeric;
  v_id uuid;
  v_ref text;
BEGIN
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

  INSERT INTO public.deposits (
    user_id, amount, bonus_pct, credited_amount, payment_method, status, payment_reference
  ) VALUES (
    v_user, p_amount, v_bonus, v_credited, p_method, 'pendiente', v_ref
  ) RETURNING id INTO v_id;

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

  RETURN jsonb_build_object('deposit_id', v_id, 'credited', v_credited);
END;
$$;

REVOKE ALL ON FUNCTION public.request_deposit(numeric, payment_method, text, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.request_deposit(numeric, payment_method, text, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.review_deposit(
  p_deposit uuid,
  p_approve boolean,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dep record;
  v_wallet record;
  v_before numeric;
  v_after numeric;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
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
    SET status = 'aprobado', reviewed_by = auth.uid(), reviewed_at = now()
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
    SET status = 'rechazado', reviewed_by = auth.uid(), reviewed_at = now(),
        rejection_reason = NULLIF(trim(COALESCE(p_reason, '')), '')
    WHERE id = p_deposit;

    INSERT INTO public.notifications (user_id, title, message, type, read)
    VALUES (
      v_dep.user_id, 'Solicitud de fondos rechazada',
      'No pudimos verificar tu pago.' || COALESCE(' Motivo: ' || NULLIF(trim(COALESCE(p_reason, '')), ''), ''),
      'deposito_rechazado', false
    );
  END IF;

  RETURN jsonb_build_object('deposit_id', p_deposit, 'changed', true);
END;
$$;

REVOKE ALL ON FUNCTION public.review_deposit(uuid, boolean, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.review_deposit(uuid, boolean, text) TO authenticated;
