-- 1. CATÁLOGO: capa comercial de MonStore (separada de los datos técnicos del proveedor)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS region text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'g2bulk',
  ADD COLUMN IF NOT EXISTS discount_pct numeric(6,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS promo_price numeric(14,2),
  ADD COLUMN IF NOT EXISTS promo_starts_at timestamptz,
  ADD COLUMN IF NOT EXISTS promo_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS featured boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS price_source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS applied_rule_id uuid,
  ADD COLUMN IF NOT EXISTS price_updated_at timestamptz;

CREATE INDEX IF NOT EXISTS products_featured_idx ON public.products (featured, sort_order);

-- 2. SISTEMA DE PRECIOS
CREATE TABLE IF NOT EXISTS public.pricing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL CHECK (scope IN ('product','game','category','region','delivery_method','cost_range','global')),
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  game_id uuid REFERENCES public.games(id) ON DELETE CASCADE,
  category text,
  region text,
  delivery_method delivery_method,
  cost_min numeric(14,2),
  cost_max numeric(14,2),
  priority integer NOT NULL DEFAULT 100,
  margin_pct numeric(6,2) NOT NULL DEFAULT 0,
  margin_fixed numeric(14,2) NOT NULL DEFAULT 0,
  rounding_step numeric(14,2) NOT NULL DEFAULT 0,
  min_price numeric(14,2),
  max_price numeric(14,2),
  active boolean NOT NULL DEFAULT true,
  starts_at timestamptz,
  ends_at timestamptz,
  note text NOT NULL DEFAULT '',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pricing_rules TO authenticated;
GRANT ALL ON public.pricing_rules TO service_role;
ALTER TABLE public.pricing_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin gestiona reglas de precio" ON public.pricing_rules
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER pricing_rules_updated BEFORE UPDATE ON public.pricing_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.price_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  rule_id uuid REFERENCES public.pricing_rules(id) ON DELETE SET NULL,
  provider_cost numeric(14,2) NOT NULL DEFAULT 0,
  price_before numeric(14,2) NOT NULL DEFAULT 0,
  price_after numeric(14,2) NOT NULL DEFAULT 0,
  origin text NOT NULL DEFAULT 'manual',
  reverted_at timestamptz,
  actor_id uuid,
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS price_history_batch_idx ON public.price_history (batch_id);
CREATE INDEX IF NOT EXISTS price_history_product_idx ON public.price_history (product_id, created_at DESC);

GRANT SELECT, INSERT ON public.price_history TO authenticated;
GRANT ALL ON public.price_history TO service_role;
ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin ve historial de precios" ON public.price_history
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.products
  ADD CONSTRAINT products_applied_rule_fk FOREIGN KEY (applied_rule_id)
  REFERENCES public.pricing_rules(id) ON DELETE SET NULL;

-- 3. PEDIDOS: historial de estados
CREATE TABLE IF NOT EXISTS public.order_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  status_before order_status,
  status_after order_status NOT NULL,
  actor_id uuid,
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_status_history_order_idx ON public.order_status_history (order_id, created_at DESC);

GRANT SELECT ON public.order_status_history TO authenticated;
GRANT ALL ON public.order_status_history TO service_role;
ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Cliente ve el historial de sus pedidos" ON public.order_status_history
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admin ve todo el historial de pedidos" ON public.order_status_history
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.log_order_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.order_status_history (order_id, user_id, status_before, status_after, actor_id, note)
    VALUES (NEW.id, NEW.user_id, NULL, NEW.status, auth.uid(), 'Pedido creado');
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.order_status_history (order_id, user_id, status_before, status_after, actor_id, note)
    VALUES (NEW.id, NEW.user_id, OLD.status, NEW.status, auth.uid(), COALESCE(NEW.error_message, ''));
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER orders_status_history AFTER INSERT OR UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.log_order_status();

-- 4. EVENTOS: resultado, ganador y premio
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS winner_user_id uuid,
  ADD COLUMN IF NOT EXISTS winner_subscription_id uuid,
  ADD COLUMN IF NOT EXISTS result_note text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS prize_delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS result_published_at timestamptz;

ALTER TABLE public.events
  ADD CONSTRAINT events_winner_subscription_fk FOREIGN KEY (winner_subscription_id)
  REFERENCES public.event_subscriptions(id) ON DELETE SET NULL;

-- 5. RETIROS: línea, retención y procesado
ALTER TABLE public.withdrawals
  ADD COLUMN IF NOT EXISTS line_id uuid REFERENCES public.payment_lines(id),
  ADD COLUMN IF NOT EXISTS line_number smallint,
  ADD COLUMN IF NOT EXISTS line_released_at timestamptz,
  ADD COLUMN IF NOT EXISTS held_amount numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS processed_at timestamptz,
  ADD COLUMN IF NOT EXISTS transaction_id text;

CREATE INDEX IF NOT EXISTS withdrawals_line_idx ON public.withdrawals (line_id, status);

-- 6. LÍNEAS DE PAGO: independencia, moneda y capacidad
ALTER TABLE public.payment_lines
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'CUP',
  ADD COLUMN IF NOT EXISTS max_pending_amount numeric(14,2),
  ADD COLUMN IF NOT EXISTS notes text NOT NULL DEFAULT '';

-- 7. AJUSTES: comisión de retiro administrable
ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS withdrawal_fee_pct numeric(6,2) NOT NULL DEFAULT 15;

-- 8. NOTIFICACIONES: campañas masivas y anti-duplicado
CREATE TABLE IF NOT EXISTS public.notification_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  message text NOT NULL,
  type text NOT NULL DEFAULT 'aviso',
  audience text NOT NULL DEFAULT 'todos',
  status text NOT NULL DEFAULT 'borrador' CHECK (status IN ('borrador','enviando','enviada','cancelada')),
  recipients_count integer NOT NULL DEFAULT 0,
  delivered_count integer NOT NULL DEFAULT 0,
  created_by uuid,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_campaigns TO authenticated;
GRANT ALL ON public.notification_campaigns TO service_role;
ALTER TABLE public.notification_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin gestiona campañas" ON public.notification_campaigns
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER notification_campaigns_updated BEFORE UPDATE ON public.notification_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS campaign_id uuid REFERENCES public.notification_campaigns(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS dedupe_key text;

CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedupe_uidx ON public.notifications (dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS notifications_user_idx ON public.notifications (user_id, created_at DESC);

-- 9. WALLET: idempotencia real de movimientos
ALTER TABLE public.wallet_transactions
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS wallet_transactions_idem_uidx ON public.wallet_transactions (idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS wallet_transactions_user_idx ON public.wallet_transactions (user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS wallet_transactions_ref_uidx
  ON public.wallet_transactions (reference_type, reference_id, type)
  WHERE reference_type IS NOT NULL AND reference_id IS NOT NULL
    AND type IN ('reembolso','deposito','premio');

-- 10. AUDITORÍA: contexto completo
ALTER TABLE public.audit_log
  ADD COLUMN IF NOT EXISTS target_user_id uuid,
  ADD COLUMN IF NOT EXISTS amount numeric(14,2),
  ADD COLUMN IF NOT EXISTS line_id uuid,
  ADD COLUMN IF NOT EXISTS event_id uuid,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 11. PRECISIÓN MONETARIA COHERENTE
ALTER TABLE public.game_accounts ALTER COLUMN publish_fee TYPE numeric(14,2);

-- 12. TIEMPO REAL
ALTER TABLE public.deposits REPLICA IDENTITY FULL;
ALTER TABLE public.withdrawals REPLICA IDENTITY FULL;
ALTER TABLE public.events REPLICA IDENTITY FULL;
ALTER TABLE public.event_subscriptions REPLICA IDENTITY FULL;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER TABLE public.platform_settings REPLICA IDENTITY FULL;
ALTER TABLE public.payment_settings REPLICA IDENTITY FULL;
ALTER TABLE public.wallets REPLICA IDENTITY FULL;
ALTER TABLE public.wallet_transactions REPLICA IDENTITY FULL;
ALTER TABLE public.orders REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.deposits, public.withdrawals, public.events,
  public.event_subscriptions, public.notifications, public.platform_settings, public.payment_settings,
  public.wallets, public.wallet_transactions, public.orders;