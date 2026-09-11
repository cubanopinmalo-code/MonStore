-- 1) Solicitud de fondos: recibe el identificador del cliente
DROP FUNCTION IF EXISTS public.request_deposit(numeric, payment_method, text, boolean);

CREATE OR REPLACE FUNCTION public.request_deposit(
  p_user uuid,
  p_amount numeric,
  p_method payment_method,
  p_reference text,
  p_has_proof boolean
)
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
$function$;

-- 2) Premio de referidos: recibe el identificador del cliente
DROP FUNCTION IF EXISTS public.claim_referral_reward();

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
  IF auth.uid() IS NOT NULL AND p_user IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'No puedes reclamar el premio de otra persona.';
  END IF;
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión.';
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

-- 3) Revisión de solicitudes: exige el identificador del administrador
DROP FUNCTION IF EXISTS public.review_deposit(uuid, boolean, text);

CREATE OR REPLACE FUNCTION public.review_deposit(
  p_deposit uuid,
  p_approve boolean,
  p_reason text,
  p_admin uuid
)
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
    SET status = 'aprobado', reviewed_by = p_admin, reviewed_at = now()
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
$function$;

-- 4) Solo la parte privada de la aplicación puede ejecutarlas
REVOKE ALL ON FUNCTION public.request_deposit(uuid, numeric, payment_method, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_deposit(uuid, numeric, payment_method, text, boolean) TO service_role;

REVOKE ALL ON FUNCTION public.claim_referral_reward(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_referral_reward(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.review_deposit(uuid, boolean, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_deposit(uuid, boolean, text, uuid) TO service_role;