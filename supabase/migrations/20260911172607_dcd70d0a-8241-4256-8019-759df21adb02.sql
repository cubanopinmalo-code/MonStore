-- ============================================================
-- MONSTORE: compras con saldo atómicas + reembolsos controlados
-- ============================================================

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS orders_idempotency_key_uidx
  ON public.orders (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ------------------------------------------------------------
-- Compra con saldo: pedido + descuento de wallet en un solo paso
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.place_wallet_order(
  p_user uuid,
  p_product uuid,
  p_player_id text,
  p_player_data jsonb,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_product record;
  v_wallet record;
  v_existing uuid;
  v_order_id uuid;
  v_code text;
  v_total numeric;
  v_before numeric;
  v_after numeric;
BEGIN
  IF auth.uid() IS NOT NULL AND p_user IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'No puedes registrar pedidos de otra persona.';
  END IF;
  IF p_user IS NULL OR p_product IS NULL THEN
    RAISE EXCEPTION 'Faltan datos del pedido.';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing FROM public.orders WHERE idempotency_key = p_idempotency_key;
    IF v_existing IS NOT NULL THEN
      RETURN jsonb_build_object('order_id', v_existing, 'duplicated', true);
    END IF;
  END IF;

  SELECT * INTO v_product
  FROM public.products
  WHERE id = p_product AND active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Esta oferta ya no está disponible.';
  END IF;
  IF v_product.available IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Esta oferta está agotada por ahora.';
  END IF;
  IF v_product.sale_price <= 0 THEN
    RAISE EXCEPTION 'Esta oferta todavía no tiene precio de venta.';
  END IF;
  IF p_player_id IS NULL OR length(trim(p_player_id)) = 0 THEN
    RAISE EXCEPTION 'Escribe el identificador de tu cuenta en el juego.';
  END IF;

  SELECT * INTO v_wallet
  FROM public.wallets
  WHERE user_id = p_user
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No encontramos tu wallet.';
  END IF;
  IF v_wallet.status <> 'activa' THEN
    RAISE EXCEPTION 'Tu wallet está bloqueada. Escribe al administrador.';
  END IF;

  v_total := v_product.sale_price;
  v_before := v_wallet.balance;
  v_after := v_before - v_total;

  IF v_after < 0 THEN
    RAISE EXCEPTION 'No tienes saldo suficiente. Agrega fondos para continuar.';
  END IF;

  v_code := 'MS' || to_char(now(), 'YYMMDDHH24MI') || '-' ||
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 5));

  INSERT INTO public.orders (
    code, user_id, product_id, game_id, player_id, player_data,
    quantity, unit_price, total_amount, currency, payment_method,
    status, idempotency_key
  )
  VALUES (
    v_code, p_user, v_product.id, v_product.game_id, trim(p_player_id),
    COALESCE(p_player_data, '{}'::jsonb), 1, v_product.sale_price, v_total,
    v_product.currency, 'wallet', 'pendiente', p_idempotency_key
  )
  RETURNING id INTO v_order_id;

  UPDATE public.wallets SET balance = v_after WHERE id = v_wallet.id;

  INSERT INTO public.wallet_transactions (
    wallet_id, user_id, type, amount, balance_before, balance_after,
    reference_type, reference_id, description, status
  )
  VALUES (
    v_wallet.id, p_user, 'compra', -v_total, v_before, v_after,
    'order', v_order_id, 'Compra de ' || v_product.name, 'completado'
  );

  INSERT INTO public.notifications (user_id, title, message, type, read)
  VALUES (
    p_user, 'Pedido ' || v_code,
    'Tu pedido de ' || v_product.name || ' quedó registrado. Importe: ' ||
      trim(trailing '.' FROM to_char(v_total, 'FM999999990.00')) || ' CUP.',
    'pedido', false
  );

  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'code', v_code,
    'total', v_total,
    'balance', v_after
  );
END;
$fn$;

-- ------------------------------------------------------------
-- Reembolso: devuelve el importe al saldo del cliente
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refund_wallet_order(
  p_order uuid,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_order record;
  v_wallet record;
  v_done uuid;
  v_before numeric;
  v_after numeric;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Solo el administrador puede reembolsar pedidos.';
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
$fn$;

-- ------------------------------------------------------------
-- Permisos de ejecución
-- ------------------------------------------------------------
REVOKE ALL ON FUNCTION public.place_wallet_order(uuid, uuid, text, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refund_wallet_order(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_wallet_order(uuid, uuid, text, jsonb, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.refund_wallet_order(uuid, text) TO authenticated, service_role;