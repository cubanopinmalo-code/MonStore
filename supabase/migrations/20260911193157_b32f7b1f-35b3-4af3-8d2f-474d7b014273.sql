ALTER TABLE public.referrals ADD COLUMN IF NOT EXISTS reward_claimed_at timestamptz;

CREATE OR REPLACE FUNCTION public.claim_referral_reward()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_goal int := 10;
  v_count int;
  v_rate numeric;
  v_wallet record;
  v_before numeric;
  v_after numeric;
  v_ids uuid[];
BEGIN
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
$$;

REVOKE EXECUTE ON FUNCTION public.claim_referral_reward() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_referral_reward() TO authenticated;