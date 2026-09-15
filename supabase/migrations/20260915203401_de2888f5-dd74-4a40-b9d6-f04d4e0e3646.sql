-- 1) Guardia de operaciones nuevas segun los interruptores globales.
CREATE OR REPLACE FUNCTION public.assert_platform_operations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_maintenance boolean;
  v_marketplace boolean;
  v_scope text := TG_ARGV[0];
BEGIN
  SELECT COALESCE(maintenance_mode, false), COALESCE(marketplace_enabled, true)
    INTO v_maintenance, v_marketplace
    FROM public.platform_settings
   WHERE id = true;

  IF COALESCE(v_maintenance, false) THEN
    RAISE EXCEPTION 'MonStore esta en mantenimiento: no se pueden crear operaciones nuevas ahora mismo.';
  END IF;

  IF v_scope = 'marketplace' AND NOT COALESCE(v_marketplace, true) THEN
    RAISE EXCEPTION 'El comercio de cuentas esta desactivado por ahora.';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_platform_operations() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_platform_operations() FROM anon, authenticated;

DROP TRIGGER IF EXISTS guard_new_deposits ON public.deposits;
CREATE TRIGGER guard_new_deposits BEFORE INSERT ON public.deposits
FOR EACH ROW EXECUTE FUNCTION public.assert_platform_operations('financiero');

DROP TRIGGER IF EXISTS guard_new_withdrawals ON public.withdrawals;
CREATE TRIGGER guard_new_withdrawals BEFORE INSERT ON public.withdrawals
FOR EACH ROW EXECUTE FUNCTION public.assert_platform_operations('financiero');

DROP TRIGGER IF EXISTS guard_new_orders ON public.orders;
CREATE TRIGGER guard_new_orders BEFORE INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.assert_platform_operations('financiero');

DROP TRIGGER IF EXISTS guard_new_event_subscriptions ON public.event_subscriptions;
CREATE TRIGGER guard_new_event_subscriptions BEFORE INSERT ON public.event_subscriptions
FOR EACH ROW EXECUTE FUNCTION public.assert_platform_operations('financiero');

DROP TRIGGER IF EXISTS guard_new_listings ON public.game_accounts;
CREATE TRIGGER guard_new_listings BEFORE INSERT ON public.game_accounts
FOR EACH ROW EXECUTE FUNCTION public.assert_platform_operations('marketplace');

DROP TRIGGER IF EXISTS guard_new_account_sales ON public.game_account_sales;
CREATE TRIGGER guard_new_account_sales BEFORE INSERT ON public.game_account_sales
FOR EACH ROW EXECUTE FUNCTION public.assert_platform_operations('marketplace');

-- 2) Recalculo manual e idempotente de los precios de recargas.
CREATE OR REPLACE FUNCTION public.recalculate_product_prices()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rate numeric;
  v_margin numeric;
  v_updated integer := 0;
  v_recent uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Solo un administrador puede recalcular los precios.';
  END IF;

  SELECT usd_to_cup, usd_margin_cup INTO v_rate, v_margin
    FROM public.platform_settings WHERE id = true;

  IF v_rate IS NULL OR v_rate <= 0 OR v_margin IS NULL OR v_margin < 0 THEN
    RAISE EXCEPTION 'Configura primero el valor del dolar y la ganancia.';
  END IF;

  -- Proteccion contra dobles clics: un recalculo por minuto.
  SELECT id INTO v_recent FROM public.audit_log
   WHERE action = 'precios_recalculados'
     AND created_at > now() - interval '1 minute'
   LIMIT 1;
  IF v_recent IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'reciente', 'updated', 0);
  END IF;

  WITH nuevos AS (
    UPDATE public.products p
       SET sale_price = round(p.g2bulk_cost * (v_rate + v_margin), 2),
           price_updated_at = now(),
           price_source = 'recalculo_manual',
           updated_at = now()
     WHERE p.g2bulk_cost > 0
       AND round(p.g2bulk_cost * (v_rate + v_margin), 2) <> p.sale_price
    RETURNING p.id
  )
  SELECT count(*) INTO v_updated FROM nuevos;

  INSERT INTO public.audit_log (actor_id, action, entity_type, note, metadata)
  VALUES (
    auth.uid(),
    'precios_recalculados',
    'products',
    'Recalculo manual de precios de recargas',
    jsonb_build_object('usd_to_cup', v_rate, 'usd_margin_cup', v_margin, 'ofertas_afectadas', v_updated)
  );

  RETURN jsonb_build_object('ok', true, 'updated', v_updated, 'rate', v_rate, 'margin', v_margin);
END;
$$;

REVOKE ALL ON FUNCTION public.recalculate_product_prices() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.recalculate_product_prices() FROM anon;
GRANT EXECUTE ON FUNCTION public.recalculate_product_prices() TO authenticated;