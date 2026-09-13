-- Fase 0.5 / migración 4: idempotencia real de pedidos.
CREATE UNIQUE INDEX IF NOT EXISTS orders_idempotency_key_uidx
  ON public.orders (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.place_wallet_order(p_user uuid, p_product uuid, p_player_id text, p_player_data jsonb, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_product record;
  v_wallet record;
  v_existing record;
  v_order_id uuid;
  v_code text;
  v_total numeric;
  v_before numeric;
  v_after numeric;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión.';
  END IF;
  IF p_user IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'No puedes registrar pedidos de otra persona.';
  END IF;
  IF p_product IS NULL THEN
    RAISE EXCEPTION 'Faltan datos del pedido.';
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

  v_code := 'MS' || to_char(now(), 'YYMMDDHH24MI') || '-' ||
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 5));

  -- La inserción es la que decide: si la clave de idempotencia ya existe,
  -- no se crea pedido y no se cobra nada.
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
  ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
  RETURNING id INTO v_order_id;

  IF v_order_id IS NULL THEN
    SELECT id, code, total_amount INTO v_existing
    FROM public.orders
    WHERE idempotency_key = p_idempotency_key;

    RETURN jsonb_build_object(
      'order_id', v_existing.id,
      'code', v_existing.code,
      'total', v_existing.total_amount,
      'balance', v_before,
      'duplicated', true
    );
  END IF;

  IF v_after < 0 THEN
    RAISE EXCEPTION 'No tienes saldo suficiente. Agrega fondos para continuar.';
  END IF;

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
$function$;