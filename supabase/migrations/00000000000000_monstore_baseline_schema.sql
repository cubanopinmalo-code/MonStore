-- =====================================================================
-- MonStore — Migración base versionada del esquema (baseline)
-- Generada desde el estado desplegado de la base de datos.
--
-- Contenido: extensiones, enums, tablas, constraints, índices,
-- funciones (incl. SECURITY DEFINER), triggers, GRANTs, RLS, policies,
-- buckets de Storage y sus policies, y configuración de Realtime.
--
-- NO contiene datos de negocio, usuarios, credenciales ni secretos.
-- Es idempotente en lo posible y reproducible en cualquier proyecto
-- Supabase estándar (self-hosted o alojado).
-- =====================================================================

Output format is unaligned.
-- ============ EXTENSIONS ============
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;

-- ============ ENUM TYPES ============
CREATE TYPE public.app_role AS ENUM ('admin', 'user');
CREATE TYPE public.delivery_method AS ENUM ('via_id', 'via_cuenta');
CREATE TYPE public.event_status AS ENUM ('proximamente', 'inscripciones_abiertas', 'meta_alcanzada', 'sala_activa', 'finalizado', 'cancelado', 'meta_no_alcanzada');
CREATE TYPE public.listing_status AS ENUM ('pendiente', 'aprobada', 'rechazada', 'vendida', 'desactivada');
CREATE TYPE public.order_status AS ENUM ('pendiente', 'procesando', 'completado', 'error', 'reembolsado', 'cancelado');
CREATE TYPE public.payment_method AS ENUM ('wallet', 'saldo_movil', 'tarjeta_cup', 'usdt', 'zelle');
CREATE TYPE public.request_status AS ENUM ('pendiente', 'aprobado', 'rechazado');

-- ============ TABLES ============
CREATE TABLE public.api_transactions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  order_id uuid,
  provider text DEFAULT 'g2bulk'::text NOT NULL,
  request_data jsonb DEFAULT '{}'::jsonb NOT NULL,
  response_data jsonb DEFAULT '{}'::jsonb NOT NULL,
  provider_transaction_id text,
  status text DEFAULT 'ok'::text NOT NULL,
  error_message text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.currency_switch_log (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  currency text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.deposits (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  amount numeric(14,2) NOT NULL,
  bonus_pct numeric(6,2) DEFAULT 0 NOT NULL,
  credited_amount numeric(14,2) DEFAULT 0 NOT NULL,
  payment_method payment_method NOT NULL,
  status request_status DEFAULT 'pendiente'::request_status NOT NULL,
  proof_image_url text,
  payment_reference text DEFAULT ''::text NOT NULL,
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  rejection_reason text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  line_id uuid,
  line_number smallint,
  line_phone text,
  line_assigned_at timestamp with time zone,
  line_released_at timestamp with time zone,
  payment_channel text,
  payment_submethod text,
  bank text,
  destination_id uuid,
  destination_value text,
  transaction_id text,
  sender_phone text,
  payment_received_at timestamp with time zone,
  approval_method text DEFAULT 'manual'::text NOT NULL,
  flow_status text DEFAULT 'pendiente'::text NOT NULL
);
CREATE TABLE public.event_subscriptions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  event_id uuid NOT NULL,
  user_id uuid NOT NULL,
  game_account_id text NOT NULL,
  g2bulk_account_name text,
  status text DEFAULT 'inscrito'::text NOT NULL,
  payment_status text DEFAULT 'pending'::text NOT NULL,
  entered_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  game_id uuid,
  event_type text DEFAULT 'sala_personalizada'::text NOT NULL,
  prize text DEFAULT ''::text NOT NULL,
  region text DEFAULT ''::text NOT NULL,
  min_participants integer DEFAULT 0 NOT NULL,
  max_participants integer DEFAULT 0 NOT NULL,
  event_date date,
  event_time text DEFAULT ''::text NOT NULL,
  entry_price numeric(14,2) DEFAULT 0 NOT NULL,
  currency text DEFAULT 'CUP'::text NOT NULL,
  status event_status DEFAULT 'proximamente'::event_status NOT NULL,
  room_id text,
  room_password text,
  room_activated_at timestamp with time zone,
  entry_window_minutes integer DEFAULT 15 NOT NULL,
  description text DEFAULT ''::text NOT NULL,
  banner_url text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  finished_at timestamp with time zone
);
CREATE TABLE public.game_account_secrets (
  account_id uuid NOT NULL,
  account_email text DEFAULT ''::text NOT NULL,
  account_password text DEFAULT ''::text NOT NULL,
  admin_access_notes text DEFAULT ''::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.game_accounts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  seller_id uuid NOT NULL,
  game_id uuid,
  title text NOT NULL,
  description text DEFAULT ''::text NOT NULL,
  region text DEFAULT ''::text NOT NULL,
  platform text DEFAULT ''::text NOT NULL,
  price numeric(14,2) DEFAULT 0 NOT NULL,
  currency text DEFAULT 'CUP'::text NOT NULL,
  images text[] DEFAULT '{}'::text[] NOT NULL,
  status listing_status DEFAULT 'pendiente'::listing_status NOT NULL,
  rejection_reason text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  seller_name text DEFAULT ''::text NOT NULL,
  duration_days smallint DEFAULT 1 NOT NULL,
  publish_fee numeric DEFAULT 0 NOT NULL,
  published_at timestamp with time zone,
  expires_at timestamp with time zone
);
CREATE TABLE public.games (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  g2bulk_id text DEFAULT ''::text NOT NULL,
  name text NOT NULL,
  slug text NOT NULL,
  image_url text DEFAULT ''::text NOT NULL,
  description text DEFAULT ''::text NOT NULL,
  category text DEFAULT ''::text NOT NULL,
  platforms text[] DEFAULT '{}'::text[] NOT NULL,
  active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.notifications (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  title text NOT NULL,
  message text DEFAULT ''::text NOT NULL,
  type text DEFAULT 'general'::text NOT NULL,
  read boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.orders (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  code text DEFAULT ('ORD-'::text || upper(substr(replace((gen_random_uuid())::text, '-'::text, ''::text), 1, 8))) NOT NULL,
  user_id uuid NOT NULL,
  product_id uuid,
  game_id uuid,
  player_id text DEFAULT ''::text NOT NULL,
  player_data jsonb DEFAULT '{}'::jsonb NOT NULL,
  quantity integer DEFAULT 1 NOT NULL,
  unit_price numeric(14,2) DEFAULT 0 NOT NULL,
  total_amount numeric(14,2) DEFAULT 0 NOT NULL,
  currency text DEFAULT 'CUP'::text NOT NULL,
  payment_method payment_method DEFAULT 'wallet'::payment_method NOT NULL,
  status order_status DEFAULT 'pendiente'::order_status NOT NULL,
  g2bulk_transaction_id text,
  error_message text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  completed_at timestamp with time zone,
  idempotency_key text
);
CREATE TABLE public.payment_destinations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  channel text NOT NULL,
  bank text,
  kind text DEFAULT 'tarjeta'::text NOT NULL,
  label text DEFAULT ''::text NOT NULL,
  description text DEFAULT ''::text NOT NULL,
  destination_value text DEFAULT ''::text NOT NULL,
  instructions text DEFAULT ''::text NOT NULL,
  requires_transaction_id boolean DEFAULT false NOT NULL,
  requires_proof boolean DEFAULT false NOT NULL,
  requires_sender_phone boolean DEFAULT false NOT NULL,
  active boolean DEFAULT true NOT NULL,
  "position" smallint DEFAULT 50 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.payment_line_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  line_id uuid,
  deposit_id uuid,
  user_id uuid,
  actor_id uuid,
  action text NOT NULL,
  note text DEFAULT ''::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.payment_lines (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  payment_method payment_method DEFAULT 'saldo_movil'::payment_method NOT NULL,
  line_number smallint NOT NULL,
  label text DEFAULT ''::text NOT NULL,
  phone_number text DEFAULT ''::text NOT NULL,
  active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.payment_settings (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  payment_method payment_method NOT NULL,
  label text NOT NULL,
  destination_number text DEFAULT ''::text NOT NULL,
  card_number text,
  phone_number text,
  instructions text DEFAULT ''::text NOT NULL,
  active boolean DEFAULT true NOT NULL,
  deposit_bonus_pct numeric(6,2) DEFAULT 0 NOT NULL,
  withdrawal_fee_pct numeric(6,2) DEFAULT 0 NOT NULL,
  withdrawal_conversion_pct numeric(6,2) DEFAULT 0 NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  transfer_fields jsonb DEFAULT '[]'::jsonb NOT NULL,
  "position" smallint DEFAULT 50 NOT NULL
);
CREATE TABLE public.payments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  order_id uuid,
  amount numeric(14,2) NOT NULL,
  method payment_method NOT NULL,
  status text DEFAULT 'pendiente'::text NOT NULL,
  reference text DEFAULT ''::text NOT NULL,
  proof_image_url text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.platform_settings (
  id boolean DEFAULT true NOT NULL,
  usd_to_cup numeric DEFAULT 1150 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  usd_margin_cup numeric DEFAULT 150 NOT NULL,
  saldo_conversion_rate numeric DEFAULT 2.8 NOT NULL,
  listing_fee_per_day numeric DEFAULT 150 NOT NULL,
  allow_line_reuse boolean DEFAULT false NOT NULL,
  support_whatsapp text DEFAULT '5351115040'::text NOT NULL
);
CREATE TABLE public.products (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  game_id uuid NOT NULL,
  g2bulk_product_id text DEFAULT ''::text NOT NULL,
  name text NOT NULL,
  description text DEFAULT ''::text NOT NULL,
  image_url text DEFAULT ''::text NOT NULL,
  g2bulk_cost numeric(14,2) DEFAULT 0 NOT NULL,
  sale_price numeric(14,2) DEFAULT 0 NOT NULL,
  currency text DEFAULT 'CUP'::text NOT NULL,
  delivery_method delivery_method DEFAULT 'via_id'::delivery_method NOT NULL,
  active boolean DEFAULT true NOT NULL,
  available boolean DEFAULT true NOT NULL,
  metadata jsonb DEFAULT '{"fields": []}'::jsonb NOT NULL,
  last_synced_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.profiles (
  id uuid NOT NULL,
  name text DEFAULT ''::text NOT NULL,
  phone text DEFAULT ''::text NOT NULL,
  province text DEFAULT ''::text NOT NULL,
  municipality text DEFAULT ''::text NOT NULL,
  avatar text,
  referral_code text DEFAULT upper(substr(replace((gen_random_uuid())::text, '-'::text, ''::text), 1, 8)) NOT NULL,
  referred_by uuid,
  status text DEFAULT 'activo'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.referrals (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  referrer_user_id uuid NOT NULL,
  referred_user_id uuid NOT NULL,
  status text DEFAULT 'registrado'::text NOT NULL,
  reward_amount numeric(14,2) DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  reward_claimed_at timestamp with time zone
);
CREATE TABLE public.user_currency_prefs (
  user_id uuid NOT NULL,
  currency text DEFAULT 'CUP'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.user_favorite_games (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  game_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.user_roles (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  role app_role NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.wallet_transactions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  wallet_id uuid NOT NULL,
  user_id uuid NOT NULL,
  type text NOT NULL,
  amount numeric(14,2) NOT NULL,
  balance_before numeric(14,2) DEFAULT 0 NOT NULL,
  balance_after numeric(14,2) DEFAULT 0 NOT NULL,
  reference_type text,
  reference_id uuid,
  description text DEFAULT ''::text NOT NULL,
  status text DEFAULT 'completado'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.wallets (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  balance numeric(14,2) DEFAULT 0 NOT NULL,
  currency text DEFAULT 'CUP'::text NOT NULL,
  status text DEFAULT 'activa'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.withdrawals (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  amount numeric(14,2) NOT NULL,
  conversion_pct numeric(6,2) DEFAULT 0 NOT NULL,
  fee_pct numeric(6,2) DEFAULT 0 NOT NULL,
  fee numeric(14,2) DEFAULT 0 NOT NULL,
  net_amount numeric(14,2) DEFAULT 0 NOT NULL,
  payment_method payment_method NOT NULL,
  payment_destination text DEFAULT ''::text NOT NULL,
  status request_status DEFAULT 'pendiente'::request_status NOT NULL,
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  rejection_reason text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- ============ CONSTRAINTS (PK, UNIQUE, CHECK, FK) ============
ALTER TABLE public.api_transactions ADD CONSTRAINT api_transactions_pkey PRIMARY KEY (id);
ALTER TABLE public.currency_switch_log ADD CONSTRAINT currency_switch_log_pkey PRIMARY KEY (id);
ALTER TABLE public.deposits ADD CONSTRAINT deposits_pkey PRIMARY KEY (id);
ALTER TABLE public.event_subscriptions ADD CONSTRAINT event_subscriptions_pkey PRIMARY KEY (id);
ALTER TABLE public.events ADD CONSTRAINT events_pkey PRIMARY KEY (id);
ALTER TABLE public.game_account_secrets ADD CONSTRAINT game_account_secrets_pkey PRIMARY KEY (account_id);
ALTER TABLE public.game_accounts ADD CONSTRAINT game_accounts_pkey PRIMARY KEY (id);
ALTER TABLE public.games ADD CONSTRAINT games_pkey PRIMARY KEY (id);
ALTER TABLE public.notifications ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);
ALTER TABLE public.orders ADD CONSTRAINT orders_pkey PRIMARY KEY (id);
ALTER TABLE public.payment_destinations ADD CONSTRAINT payment_destinations_pkey PRIMARY KEY (id);
ALTER TABLE public.payment_line_events ADD CONSTRAINT payment_line_events_pkey PRIMARY KEY (id);
ALTER TABLE public.payment_lines ADD CONSTRAINT payment_lines_pkey PRIMARY KEY (id);
ALTER TABLE public.payment_settings ADD CONSTRAINT payment_settings_pkey PRIMARY KEY (id);
ALTER TABLE public.payments ADD CONSTRAINT payments_pkey PRIMARY KEY (id);
ALTER TABLE public.platform_settings ADD CONSTRAINT platform_settings_pkey PRIMARY KEY (id);
ALTER TABLE public.products ADD CONSTRAINT products_pkey PRIMARY KEY (id);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);
ALTER TABLE public.referrals ADD CONSTRAINT referrals_pkey PRIMARY KEY (id);
ALTER TABLE public.user_currency_prefs ADD CONSTRAINT user_currency_prefs_pkey PRIMARY KEY (user_id);
ALTER TABLE public.user_favorite_games ADD CONSTRAINT user_favorite_games_pkey PRIMARY KEY (id);
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);
ALTER TABLE public.wallet_transactions ADD CONSTRAINT wallet_transactions_pkey PRIMARY KEY (id);
ALTER TABLE public.wallets ADD CONSTRAINT wallets_pkey PRIMARY KEY (id);
ALTER TABLE public.withdrawals ADD CONSTRAINT withdrawals_pkey PRIMARY KEY (id);
ALTER TABLE public.event_subscriptions ADD CONSTRAINT event_subscriptions_event_id_game_account_id_key UNIQUE (event_id, game_account_id);
ALTER TABLE public.event_subscriptions ADD CONSTRAINT event_subscriptions_event_id_user_id_key UNIQUE (event_id, user_id);
ALTER TABLE public.games ADD CONSTRAINT games_slug_key UNIQUE (slug);
ALTER TABLE public.orders ADD CONSTRAINT orders_code_key UNIQUE (code);
ALTER TABLE public.payment_lines ADD CONSTRAINT payment_lines_payment_method_line_number_key UNIQUE (payment_method, line_number);
ALTER TABLE public.payment_settings ADD CONSTRAINT payment_settings_payment_method_key UNIQUE (payment_method);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_referral_code_key UNIQUE (referral_code);
ALTER TABLE public.referrals ADD CONSTRAINT referrals_referred_user_id_key UNIQUE (referred_user_id);
ALTER TABLE public.user_favorite_games ADD CONSTRAINT user_favorite_games_user_id_game_id_key UNIQUE (user_id, game_id);
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);
ALTER TABLE public.wallets ADD CONSTRAINT wallets_user_id_key UNIQUE (user_id);
ALTER TABLE public.platform_settings ADD CONSTRAINT platform_settings_rate_positive CHECK ((usd_to_cup > (0)::numeric));
ALTER TABLE public.platform_settings ADD CONSTRAINT platform_settings_single_row CHECK (id);
ALTER TABLE public.api_transactions ADD CONSTRAINT api_transactions_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL;
ALTER TABLE public.currency_switch_log ADD CONSTRAINT currency_switch_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.deposits ADD CONSTRAINT deposits_destination_id_fkey FOREIGN KEY (destination_id) REFERENCES payment_destinations(id);
ALTER TABLE public.deposits ADD CONSTRAINT deposits_line_id_fkey FOREIGN KEY (line_id) REFERENCES payment_lines(id) ON DELETE SET NULL;
ALTER TABLE public.deposits ADD CONSTRAINT deposits_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.event_subscriptions ADD CONSTRAINT event_subscriptions_event_id_fkey FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE;
ALTER TABLE public.event_subscriptions ADD CONSTRAINT event_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.events ADD CONSTRAINT events_game_id_fkey FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE SET NULL;
ALTER TABLE public.game_account_secrets ADD CONSTRAINT game_account_secrets_account_id_fkey FOREIGN KEY (account_id) REFERENCES game_accounts(id) ON DELETE CASCADE;
ALTER TABLE public.game_accounts ADD CONSTRAINT game_accounts_game_id_fkey FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE SET NULL;
ALTER TABLE public.game_accounts ADD CONSTRAINT game_accounts_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.orders ADD CONSTRAINT orders_game_id_fkey FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE SET NULL;
ALTER TABLE public.orders ADD CONSTRAINT orders_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;
ALTER TABLE public.orders ADD CONSTRAINT orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.payment_line_events ADD CONSTRAINT payment_line_events_deposit_id_fkey FOREIGN KEY (deposit_id) REFERENCES deposits(id) ON DELETE SET NULL;
ALTER TABLE public.payment_line_events ADD CONSTRAINT payment_line_events_line_id_fkey FOREIGN KEY (line_id) REFERENCES payment_lines(id) ON DELETE SET NULL;
ALTER TABLE public.payments ADD CONSTRAINT payments_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL;
ALTER TABLE public.payments ADD CONSTRAINT payments_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.products ADD CONSTRAINT products_game_id_fkey FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_referred_by_fkey FOREIGN KEY (referred_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE public.referrals ADD CONSTRAINT referrals_referred_user_id_fkey FOREIGN KEY (referred_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.referrals ADD CONSTRAINT referrals_referrer_user_id_fkey FOREIGN KEY (referrer_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.user_currency_prefs ADD CONSTRAINT user_currency_prefs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.user_favorite_games ADD CONSTRAINT user_favorite_games_game_id_fkey FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE;
ALTER TABLE public.user_favorite_games ADD CONSTRAINT user_favorite_games_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.wallet_transactions ADD CONSTRAINT wallet_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.wallet_transactions ADD CONSTRAINT wallet_transactions_wallet_id_fkey FOREIGN KEY (wallet_id) REFERENCES wallets(id) ON DELETE CASCADE;
ALTER TABLE public.wallets ADD CONSTRAINT wallets_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.withdrawals ADD CONSTRAINT withdrawals_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- ============ INDEXES ============
CREATE INDEX currency_switch_log_user_idx ON public.currency_switch_log USING btree (user_id, created_at DESC);
CREATE INDEX deposits_line_pending_idx ON public.deposits USING btree (line_id) WHERE (status = 'pendiente'::request_status);
CREATE UNIQUE INDEX games_g2bulk_id_uq ON public.games USING btree (g2bulk_id) WHERE (g2bulk_id <> ''::text);
CREATE UNIQUE INDEX games_slug_uq ON public.games USING btree (slug);
CREATE UNIQUE INDEX orders_idempotency_key_uidx ON public.orders USING btree (idempotency_key) WHERE (idempotency_key IS NOT NULL);
CREATE UNIQUE INDEX payment_destinations_channel_bank_idx ON public.payment_destinations USING btree (channel, COALESCE(bank, ''::text));
CREATE INDEX products_active_sale_idx ON public.products USING btree (active, sale_price);
CREATE UNIQUE INDEX products_g2bulk_product_id_uq ON public.products USING btree (g2bulk_product_id) WHERE (g2bulk_product_id <> ''::text);
CREATE INDEX products_game_active_idx ON public.products USING btree (game_id, active);
CREATE INDEX idx_user_favorite_games_user ON public.user_favorite_games USING btree (user_id);

-- ============ FUNCTIONS ============
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
$function$
;

CREATE OR REPLACE FUNCTION public.enter_event_room(p_event uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid(); v_event record; v_sub record; v_wallet record;
  v_before numeric; v_after numeric;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Debes iniciar sesión.'; END IF;

  SELECT * INTO v_event FROM public.events WHERE id = p_event;
  IF NOT FOUND THEN RAISE EXCEPTION 'No encontramos ese evento.'; END IF;
  IF v_event.status <> 'sala_activa' OR v_event.room_activated_at IS NULL THEN
    RAISE EXCEPTION 'La sala todavía no está activa.';
  END IF;
  IF now() > v_event.room_activated_at + make_interval(mins => COALESCE(v_event.entry_window_minutes, 15)) THEN
    RAISE EXCEPTION 'La ventana para entrar a la sala ya cerró.';
  END IF;

  SELECT * INTO v_sub FROM public.event_subscriptions
  WHERE event_id = p_event AND user_id = v_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No estás inscrito en este evento.'; END IF;

  IF v_sub.payment_status = 'pagado' THEN
    RETURN jsonb_build_object('room_id', v_event.room_id, 'room_password', v_event.room_password, 'charged', false);
  END IF;

  SELECT * INTO v_wallet FROM public.wallets WHERE user_id = v_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No encontramos tu wallet.'; END IF;

  v_before := v_wallet.balance;
  v_after := v_before - v_event.entry_price;
  IF v_after < 0 THEN RAISE EXCEPTION 'No tienes saldo suficiente para entrar a la sala.'; END IF;

  UPDATE public.wallets SET balance = v_after WHERE id = v_wallet.id;
  UPDATE public.event_subscriptions
  SET payment_status = 'pagado', status = 'en_sala', entered_at = now()
  WHERE id = v_sub.id;

  INSERT INTO public.wallet_transactions (
    wallet_id, user_id, type, amount, balance_before, balance_after,
    reference_type, reference_id, description, status
  ) VALUES (
    v_wallet.id, v_user, 'evento', -v_event.entry_price, v_before, v_after,
    'event', p_event, 'Entrada al evento ' || v_event.name, 'completado'
  );

  INSERT INTO public.notifications (user_id, title, message, type, read)
  VALUES (v_user, 'Entraste a la sala',
    'Cobramos ' || trim(trailing '.' FROM to_char(v_event.entry_price, 'FM999999990.00')) ||
    ' CUP por tu entrada a ' || v_event.name || '.', 'evento', false);

  RETURN jsonb_build_object('room_id', v_event.room_id, 'room_password', v_event.room_password,
    'charged', true, 'balance', v_after);
END; $function$
;

CREATE OR REPLACE FUNCTION public.event_participant_counts()
 RETURNS TABLE(event_id uuid, participants bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT s.event_id, count(*)::bigint
  FROM public.event_subscriptions s
  WHERE s.status <> 'cancelado'
  GROUP BY s.event_id
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE ref_code TEXT; ref_id UUID;
BEGIN
  ref_code := NEW.raw_user_meta_data ->> 'referral_code';
  IF ref_code IS NOT NULL THEN
    SELECT id INTO ref_id FROM public.profiles WHERE referral_code = upper(ref_code);
  END IF;
  INSERT INTO public.profiles (id, name, phone, referred_by)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data ->> 'name',''), COALESCE(NEW.raw_user_meta_data ->> 'phone',''), ref_id);
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user') ON CONFLICT DO NOTHING;
  INSERT INTO public.wallets (user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  IF ref_id IS NOT NULL THEN
    INSERT INTO public.referrals (referrer_user_id, referred_user_id) VALUES (ref_id, NEW.id) ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END; $function$
;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles AS ur
    WHERE ur.user_id = _user_id
      AND ur.role = _role
  );
$function$
;

CREATE OR REPLACE FUNCTION public.keep_profile_phone()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.phone IS DISTINCT FROM OLD.phone THEN
    NEW.phone := OLD.phone;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.place_wallet_order(p_user uuid, p_product uuid, p_player_id text, p_player_data jsonb, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.publish_game_account(p_game uuid, p_title text, p_price numeric, p_region text, p_platform text, p_images text[], p_days integer, p_email text, p_password text, p_notes text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_fee_day numeric;
  v_total numeric;
  v_wallet record;
  v_before numeric;
  v_after numeric;
  v_listing uuid;
  v_name text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión.';
  END IF;
  IF p_days IS NULL OR p_days < 1 OR p_days > 5 THEN
    RAISE EXCEPTION 'Elige entre 1 y 5 días de publicación.';
  END IF;
  IF p_game IS NULL THEN
    RAISE EXCEPTION 'Selecciona el juego.';
  END IF;
  IF p_price IS NULL OR p_price <= 0 THEN
    RAISE EXCEPTION 'Escribe un precio válido.';
  END IF;
  IF p_images IS NULL OR array_length(p_images, 1) IS NULL THEN
    RAISE EXCEPTION 'Debes enviar al menos 1 foto de la cuenta.';
  END IF;
  IF p_region IS NULL OR length(trim(p_region)) = 0
     OR p_platform IS NULL OR length(trim(p_platform)) = 0 THEN
    RAISE EXCEPTION 'Completa la región y la plataforma de acceso.';
  END IF;
  IF p_email IS NULL OR length(trim(p_email)) = 0
     OR p_password IS NULL OR length(trim(p_password)) = 0 THEN
    RAISE EXCEPTION 'Completa el correo y la contraseña de la cuenta.';
  END IF;

  SELECT COALESCE(listing_fee_per_day, 150) INTO v_fee_day FROM public.platform_settings LIMIT 1;
  v_fee_day := COALESCE(v_fee_day, 150);
  v_total := v_fee_day * p_days;

  SELECT * INTO v_wallet FROM public.wallets WHERE user_id = v_user FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No encontramos tu wallet.';
  END IF;
  IF v_wallet.status <> 'activa' THEN
    RAISE EXCEPTION 'Tu wallet está bloqueada. Escribe al administrador.';
  END IF;

  v_before := v_wallet.balance;
  v_after := v_before - v_total;
  IF v_after < 0 THEN
    RAISE EXCEPTION 'No tienes saldo suficiente para publicar (% CUP).', trim(trailing '.' FROM to_char(v_total, 'FM999999990.00'));
  END IF;

  SELECT COALESCE(name, 'Vendedor') INTO v_name FROM public.profiles WHERE id = v_user;

  INSERT INTO public.game_accounts (
    seller_id, seller_name, game_id, title, description, region, platform,
    price, currency, images, status, duration_days, publish_fee
  ) VALUES (
    v_user, COALESCE(v_name, 'Vendedor'), p_game, COALESCE(NULLIF(trim(p_title), ''), 'Cuenta en venta'),
    '', trim(p_region), trim(p_platform), p_price, 'CUP', p_images, 'pendiente', p_days, v_total
  )
  RETURNING id INTO v_listing;

  INSERT INTO public.game_account_secrets (account_id, account_email, account_password, admin_access_notes)
  VALUES (v_listing, trim(p_email), p_password, COALESCE(p_notes, ''));

  UPDATE public.wallets SET balance = v_after, updated_at = now() WHERE id = v_wallet.id;

  INSERT INTO public.wallet_transactions (
    wallet_id, user_id, type, amount, balance_before, balance_after,
    reference_type, reference_id, description, status
  ) VALUES (
    v_wallet.id, v_user, 'publicacion', -v_total, v_before, v_after,
    'game_account', v_listing,
    'Publicación de cuenta por ' || p_days || ' día(s)', 'completado'
  );

  INSERT INTO public.notifications (user_id, title, message, type, read)
  VALUES (
    v_user, 'Cuenta enviada a revisión',
    'Se descontaron ' || trim(trailing '.' FROM to_char(v_total, 'FM999999990.00')) ||
    ' CUP de tu wallet por ' || p_days || ' día(s) de publicación. Al ser aprobada, tu cuenta será publicada por las horas contratadas para que todos los que usan la app la vean. ¡Buena suerte con la venta!',
    'comercio', false
  );

  RETURN jsonb_build_object('listing_id', v_listing, 'total', v_total, 'balance', v_after, 'days', p_days);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.refund_wallet_order(p_order uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

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
$function$
;

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
$function$
;

CREATE OR REPLACE FUNCTION public.request_deposit_v2(p_user uuid, p_amount numeric, p_method payment_method, p_reference text, p_has_proof boolean, p_destination uuid DEFAULT NULL::uuid, p_transaction_id text DEFAULT NULL::text, p_sender_phone text DEFAULT NULL::text, p_proof_url text DEFAULT NULL::text)
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
  v_dest record;
  v_txn text := NULLIF(trim(COALESCE(p_transaction_id, '')), '');
  v_sender text := NULLIF(regexp_replace(COALESCE(p_sender_phone, ''), '\D', '', 'g'), '');
  v_proof text := NULLIF(trim(COALESCE(p_proof_url, '')), '');
  v_flow text := 'pendiente';
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

  SELECT EXISTS (
    SELECT 1 FROM public.payment_lines WHERE payment_method = p_method AND active
  ) INTO v_has_lines;

  IF v_has_lines THEN
    SELECT COALESCE(allow_line_reuse, false) INTO v_reuse FROM public.platform_settings LIMIT 1;

    SELECT l.* INTO v_line
    FROM public.payment_lines l
    WHERE l.active
      AND l.payment_method = p_method
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
END;
$function$
;

CREATE OR REPLACE FUNCTION public.request_withdrawal(p_amount numeric, p_method payment_method, p_destination text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_set record; v_wallet record;
  v_conv_pct numeric := 0; v_fee_pct numeric := 5;
  v_conv numeric; v_fee numeric; v_net numeric;
  v_before numeric; v_after numeric; v_id uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Debes iniciar sesión.'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Escribe un importe válido.'; END IF;
  IF p_method = 'wallet' THEN RAISE EXCEPTION 'Método de retiro no válido.'; END IF;
  IF p_destination IS NULL OR length(trim(p_destination)) < 5 THEN
    RAISE EXCEPTION 'Escribe el destino donde quieres recibir el dinero.';
  END IF;

  SELECT * INTO v_set FROM public.payment_settings WHERE payment_method = p_method AND active = true LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ese método de retiro no está disponible.'; END IF;
  v_conv_pct := COALESCE(v_set.withdrawal_conversion_pct, 0);
  v_fee_pct := COALESCE(v_set.withdrawal_fee_pct, 5);

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
    payment_method, payment_destination, status
  ) VALUES (
    v_user, p_amount, v_conv_pct, v_fee_pct, v_fee, v_net,
    p_method, trim(p_destination), 'pendiente'
  ) RETURNING id INTO v_id;

  UPDATE public.wallets SET balance = v_after WHERE id = v_wallet.id;

  INSERT INTO public.wallet_transactions (
    wallet_id, user_id, type, amount, balance_before, balance_after,
    reference_type, reference_id, description, status
  ) VALUES (
    v_wallet.id, v_user, 'retiro', -p_amount, v_before, v_after,
    'withdrawal', v_id, 'Solicitud de retiro', 'pendiente'
  );

  INSERT INTO public.notifications (user_id, title, message, type, read)
  VALUES (v_user, 'Solicitud de retiro enviada',
    'Descontamos ' || trim(trailing '.' FROM to_char(p_amount, 'FM999999990.00')) ||
    ' CUP de tu wallet. Recibirás ' || trim(trailing '.' FROM to_char(v_net, 'FM999999990.00')) ||
    ' CUP al aprobarse. Si se rechaza, te lo devolvemos.', 'retiro_pendiente', false);

  RETURN jsonb_build_object('withdrawal_id', v_id, 'net', v_net, 'balance', v_after);
END; $function$
;

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
        flow_status = 'aprobada', approval_method = 'manual',
        payment_received_at = COALESCE(payment_received_at, now()),
        line_released_at = COALESCE(line_released_at, now())
    WHERE id = p_deposit;

    INSERT INTO public.notifications (user_id, title, message, type, read)
    VALUES (
      v_dep.user_id, 'Fondos acreditados',
      'Tus fondos han sido aprobados y ya están disponibles en tu saldo de MONSTORE: ' ||
        trim(trailing '.' FROM to_char(v_dep.credited_amount, 'FM999999990.00')) || ' CUP.',
      'deposito_aprobado', false
    );
  ELSE
    UPDATE public.deposits
    SET status = 'rechazado', reviewed_by = p_admin, reviewed_at = now(),
        flow_status = 'rechazada', approval_method = 'manual',
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
$function$
;

CREATE OR REPLACE FUNCTION public.review_game_account(p_listing uuid, p_approve boolean, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_admin uuid := auth.uid();
  v_listing record;
  v_wallet record;
  v_before numeric;
  v_after numeric;
  v_expires timestamptz;
BEGIN
  IF v_admin IS NULL OR NOT public.has_role(v_admin, 'admin') THEN
    RAISE EXCEPTION 'Solo el administrador puede revisar publicaciones.';
  END IF;

  SELECT * INTO v_listing FROM public.game_accounts WHERE id = p_listing FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No encontramos la publicación.';
  END IF;
  IF v_listing.status <> 'pendiente' THEN
    RAISE EXCEPTION 'Esta publicación ya fue revisada.';
  END IF;

  IF p_approve THEN
    v_expires := now() + make_interval(hours => v_listing.duration_days * 24);
    UPDATE public.game_accounts
    SET status = 'aprobada', published_at = now(), expires_at = v_expires,
        rejection_reason = NULL, updated_at = now()
    WHERE id = p_listing;

    INSERT INTO public.notifications (user_id, title, message, type, read)
    VALUES (
      v_listing.seller_id, 'Publicación aprobada',
      'Tu cuenta ya está publicada en el comercio por ' || (v_listing.duration_days * 24) ||
      ' horas. ¡Buena suerte con la venta!', 'comercio', false
    );

    RETURN jsonb_build_object('status', 'aprobada', 'expires_at', v_expires);
  END IF;

  UPDATE public.game_accounts
  SET status = 'rechazada', rejection_reason = COALESCE(NULLIF(trim(p_reason), ''), 'Datos incorrectos'),
      updated_at = now()
  WHERE id = p_listing;

  IF v_listing.publish_fee > 0 THEN
    SELECT * INTO v_wallet FROM public.wallets WHERE user_id = v_listing.seller_id FOR UPDATE;
    IF FOUND THEN
      v_before := v_wallet.balance;
      v_after := v_before + v_listing.publish_fee;
      UPDATE public.wallets SET balance = v_after, updated_at = now() WHERE id = v_wallet.id;
      INSERT INTO public.wallet_transactions (
        wallet_id, user_id, type, amount, balance_before, balance_after,
        reference_type, reference_id, description, status
      ) VALUES (
        v_wallet.id, v_listing.seller_id, 'reembolso', v_listing.publish_fee, v_before, v_after,
        'game_account', p_listing, 'Devolución por publicación rechazada', 'completado'
      );
    END IF;
  END IF;

  INSERT INTO public.notifications (user_id, title, message, type, read)
  VALUES (
    v_listing.seller_id, 'Publicación rechazada',
    'Tu cuenta no fue aprobada: ' || COALESCE(NULLIF(trim(p_reason), ''), 'Datos incorrectos') ||
    '. Te devolvimos el importe de la publicación a tu wallet.', 'comercio', false
  );

  RETURN jsonb_build_object('status', 'rechazada');
END;
$function$
;

CREATE OR REPLACE FUNCTION public.review_withdrawal(p_withdrawal uuid, p_approve boolean, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_admin uuid := auth.uid(); v_w record; v_wallet record;
  v_before numeric; v_after numeric;
BEGIN
  IF v_admin IS NULL OR NOT public.has_role(v_admin, 'admin') THEN
    RAISE EXCEPTION 'Solo el administrador puede revisar retiros.';
  END IF;

  SELECT * INTO v_w FROM public.withdrawals WHERE id = p_withdrawal FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No encontramos esa solicitud.'; END IF;
  IF v_w.status <> 'pendiente' THEN
    RETURN jsonb_build_object('withdrawal_id', p_withdrawal, 'changed', false, 'status', v_w.status);
  END IF;

  IF p_approve THEN
    UPDATE public.withdrawals SET status = 'aprobado', reviewed_by = v_admin, reviewed_at = now()
    WHERE id = p_withdrawal;

    UPDATE public.wallet_transactions SET status = 'completado'
    WHERE reference_type = 'withdrawal' AND reference_id = p_withdrawal AND type = 'retiro';

    INSERT INTO public.notifications (user_id, title, message, type, read)
    VALUES (v_w.user_id, 'Retiro aprobado',
      'Tu retiro de ' || trim(trailing '.' FROM to_char(v_w.amount, 'FM999999990.00')) ||
      ' CUP fue aprobado. Recibirás ' || trim(trailing '.' FROM to_char(v_w.net_amount, 'FM999999990.00')) ||
      ' CUP en ' || v_w.payment_destination || '.', 'retiro_aprobado', false);

    RETURN jsonb_build_object('withdrawal_id', p_withdrawal, 'changed', true);
  END IF;

  SELECT * INTO v_wallet FROM public.wallets WHERE user_id = v_w.user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No encontramos la wallet del cliente.'; END IF;
  v_before := v_wallet.balance;
  v_after := v_before + v_w.amount;
  UPDATE public.wallets SET balance = v_after WHERE id = v_wallet.id;

  UPDATE public.withdrawals
  SET status = 'rechazado', reviewed_by = v_admin, reviewed_at = now(),
      rejection_reason = NULLIF(trim(COALESCE(p_reason, '')), '')
  WHERE id = p_withdrawal;

  UPDATE public.wallet_transactions SET status = 'cancelado'
  WHERE reference_type = 'withdrawal' AND reference_id = p_withdrawal AND type = 'retiro';

  INSERT INTO public.wallet_transactions (
    wallet_id, user_id, type, amount, balance_before, balance_after,
    reference_type, reference_id, description, status
  ) VALUES (
    v_wallet.id, v_w.user_id, 'reembolso', v_w.amount, v_before, v_after,
    'withdrawal', p_withdrawal, 'Devolución de retiro rechazado', 'completado'
  );

  INSERT INTO public.notifications (user_id, title, message, type, read)
  VALUES (v_w.user_id, 'Retiro rechazado',
    'Devolvimos ' || trim(trailing '.' FROM to_char(v_w.amount, 'FM999999990.00')) ||
    ' CUP a tu wallet.' || COALESCE(' Motivo: ' || NULLIF(trim(COALESCE(p_reason, '')), ''), ''),
    'retiro_rechazado', false);

  RETURN jsonb_build_object('withdrawal_id', p_withdrawal, 'changed', true, 'refunded', true);
END; $function$
;

CREATE OR REPLACE FUNCTION public.set_display_currency(p_currency text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_current text;
  v_day int;
  v_week int;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_auth');
  END IF;
  IF p_currency NOT IN ('CUP', 'SALDO') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_currency');
  END IF;

  SELECT currency INTO v_current FROM public.user_currency_prefs WHERE user_id = v_user;
  IF v_current IS NOT NULL AND v_current = p_currency THEN
    RETURN jsonb_build_object('ok', true, 'currency', p_currency, 'unchanged', true);
  END IF;

  SELECT count(*) INTO v_day FROM public.currency_switch_log
    WHERE user_id = v_user AND created_at > now() - interval '24 hours';
  IF v_day >= 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'daily_limit');
  END IF;

  SELECT count(*) INTO v_week FROM public.currency_switch_log
    WHERE user_id = v_user AND created_at > now() - interval '7 days';
  IF v_week >= 4 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'weekly_limit');
  END IF;

  INSERT INTO public.user_currency_prefs (user_id, currency)
  VALUES (v_user, p_currency)
  ON CONFLICT (user_id) DO UPDATE SET currency = EXCLUDED.currency;

  INSERT INTO public.currency_switch_log (user_id, currency) VALUES (v_user, p_currency);

  RETURN jsonb_build_object('ok', true, 'currency', p_currency);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.subscribe_event(p_event uuid, p_game_account_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid(); v_event record; v_count int; v_id uuid; v_acc text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Debes iniciar sesión.'; END IF;
  v_acc := NULLIF(trim(COALESCE(p_game_account_id, '')), '');
  IF v_acc IS NULL THEN RAISE EXCEPTION 'Escribe el identificador de tu cuenta en el juego.'; END IF;

  SELECT * INTO v_event FROM public.events WHERE id = p_event FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No encontramos ese evento.'; END IF;
  IF v_event.status NOT IN ('inscripciones_abiertas', 'meta_alcanzada') THEN
    RAISE EXCEPTION 'Las inscripciones de este evento no están abiertas.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.event_subscriptions WHERE event_id = p_event AND user_id = v_user) THEN
    RAISE EXCEPTION 'Ya estás inscrito en este evento.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.event_subscriptions WHERE event_id = p_event AND game_account_id = v_acc) THEN
    RAISE EXCEPTION 'Ese identificador de cuenta ya está inscrito en este evento.';
  END IF;

  SELECT count(*) INTO v_count FROM public.event_subscriptions
  WHERE event_id = p_event AND status <> 'cancelado';
  IF v_count >= v_event.max_participants THEN
    RAISE EXCEPTION 'El evento ya está completo.';
  END IF;

  INSERT INTO public.event_subscriptions (event_id, user_id, game_account_id, status, payment_status)
  VALUES (p_event, v_user, v_acc, 'inscrito', 'pendiente')
  RETURNING id INTO v_id;

  v_count := v_count + 1;
  IF v_count >= v_event.min_participants AND v_event.status = 'inscripciones_abiertas' THEN
    UPDATE public.events SET status = 'meta_alcanzada' WHERE id = p_event;
  END IF;

  INSERT INTO public.notifications (user_id, title, message, type, read)
  VALUES (v_user, 'Inscripción confirmada',
    'Te inscribiste en ' || v_event.name || '. Se cobrará la entrada solo cuando entres a la sala.',
    'evento', false);

  RETURN jsonb_build_object('subscription_id', v_id, 'participants', v_count);
END; $function$
;

CREATE OR REPLACE FUNCTION public.top_recharged_games(_limit integer DEFAULT 3)
 RETURNS TABLE(game_id uuid, orders_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT o.game_id, count(*)::bigint AS orders_count
  FROM public.orders o
  WHERE o.game_id IS NOT NULL
    AND o.status IN ('completado', 'procesando')
  GROUP BY o.game_id
  ORDER BY count(*) DESC
  LIMIT GREATEST(COALESCE(_limit, 3), 1)
$function$
;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $function$
;


-- ============ TRIGGERS ============
CREATE TRIGGER apitx_updated BEFORE UPDATE ON public.api_transactions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER events_updated BEFORE UPDATE ON public.events FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER ga_updated BEFORE UPDATE ON public.game_accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER games_updated BEFORE UPDATE ON public.games FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER orders_updated BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_payment_destinations_updated_at BEFORE UPDATE ON public.payment_destinations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_payment_lines_updated_at BEFORE UPDATE ON public.payment_lines FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER psettings_updated BEFORE UPDATE ON public.payment_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER payments_updated BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_platform_settings_updated_at BEFORE UPDATE ON public.platform_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER products_updated BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER profiles_keep_phone BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION keep_profile_phone();
CREATE TRIGGER profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_user_currency_prefs_updated_at BEFORE UPDATE ON public.user_currency_prefs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER wallets_updated BEFORE UPDATE ON public.wallets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============ GRANTS (tablas) ============
GRANT ALL ON public.api_transactions TO anon;
GRANT ALL ON public.api_transactions TO authenticated;
GRANT ALL ON public.api_transactions TO service_role;
GRANT ALL ON public.currency_switch_log TO anon;
GRANT ALL ON public.currency_switch_log TO authenticated;
GRANT ALL ON public.currency_switch_log TO service_role;
GRANT ALL ON public.deposits TO anon;
GRANT ALL ON public.deposits TO authenticated;
GRANT ALL ON public.deposits TO service_role;
GRANT ALL ON public.event_subscriptions TO anon;
GRANT ALL ON public.event_subscriptions TO authenticated;
GRANT ALL ON public.event_subscriptions TO service_role;
GRANT ALL ON public.events TO anon;
GRANT ALL ON public.events TO authenticated;
GRANT ALL ON public.events TO service_role;
GRANT ALL ON public.game_account_secrets TO anon;
GRANT ALL ON public.game_account_secrets TO authenticated;
GRANT ALL ON public.game_account_secrets TO service_role;
GRANT ALL ON public.game_accounts TO anon;
GRANT ALL ON public.game_accounts TO authenticated;
GRANT ALL ON public.game_accounts TO service_role;
GRANT ALL ON public.games TO anon;
GRANT ALL ON public.games TO authenticated;
GRANT ALL ON public.games TO service_role;
GRANT ALL ON public.notifications TO anon;
GRANT ALL ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
GRANT ALL ON public.orders TO anon;
GRANT ALL ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;
GRANT ALL ON public.payment_destinations TO anon;
GRANT ALL ON public.payment_destinations TO authenticated;
GRANT ALL ON public.payment_destinations TO service_role;
GRANT ALL ON public.payment_line_events TO anon;
GRANT ALL ON public.payment_line_events TO authenticated;
GRANT ALL ON public.payment_line_events TO service_role;
GRANT ALL ON public.payment_lines TO anon;
GRANT ALL ON public.payment_lines TO authenticated;
GRANT ALL ON public.payment_lines TO service_role;
GRANT ALL ON public.payment_settings TO anon;
GRANT ALL ON public.payment_settings TO authenticated;
GRANT ALL ON public.payment_settings TO service_role;
GRANT ALL ON public.payments TO anon;
GRANT ALL ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
GRANT ALL ON public.platform_settings TO anon;
GRANT ALL ON public.platform_settings TO authenticated;
GRANT ALL ON public.platform_settings TO service_role;
GRANT ALL ON public.products TO anon;
GRANT ALL ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
GRANT ALL ON public.profiles TO anon;
GRANT ALL ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
GRANT ALL ON public.referrals TO anon;
GRANT ALL ON public.referrals TO authenticated;
GRANT ALL ON public.referrals TO service_role;
GRANT ALL ON public.user_currency_prefs TO anon;
GRANT ALL ON public.user_currency_prefs TO authenticated;
GRANT ALL ON public.user_currency_prefs TO service_role;
GRANT ALL ON public.user_favorite_games TO anon;
GRANT ALL ON public.user_favorite_games TO authenticated;
GRANT ALL ON public.user_favorite_games TO service_role;
GRANT ALL ON public.user_roles TO anon;
GRANT ALL ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
GRANT ALL ON public.wallet_transactions TO anon;
GRANT ALL ON public.wallet_transactions TO authenticated;
GRANT ALL ON public.wallet_transactions TO service_role;
GRANT ALL ON public.wallets TO anon;
GRANT ALL ON public.wallets TO authenticated;
GRANT ALL ON public.wallets TO service_role;
GRANT ALL ON public.withdrawals TO anon;
GRANT ALL ON public.withdrawals TO authenticated;
GRANT ALL ON public.withdrawals TO service_role;

-- ============ GRANTS (funciones) ============
GRANT EXECUTE ON FUNCTION public.claim_referral_reward(p_user uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.claim_referral_reward(p_user uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_referral_reward(p_user uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.enter_event_room(p_event uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.enter_event_room(p_event uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.enter_event_room(p_event uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.event_participant_counts() TO anon;
GRANT EXECUTE ON FUNCTION public.event_participant_counts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.event_participant_counts() TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO anon;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
GRANT EXECUTE ON FUNCTION public.has_role(_user_id uuid, _role app_role) TO anon;
GRANT EXECUTE ON FUNCTION public.has_role(_user_id uuid, _role app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(_user_id uuid, _role app_role) TO service_role;
GRANT EXECUTE ON FUNCTION public.keep_profile_phone() TO anon;
GRANT EXECUTE ON FUNCTION public.keep_profile_phone() TO authenticated;
GRANT EXECUTE ON FUNCTION public.keep_profile_phone() TO service_role;
GRANT EXECUTE ON FUNCTION public.place_wallet_order(p_user uuid, p_product uuid, p_player_id text, p_player_data jsonb, p_idempotency_key text) TO anon;
GRANT EXECUTE ON FUNCTION public.place_wallet_order(p_user uuid, p_product uuid, p_player_id text, p_player_data jsonb, p_idempotency_key text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.place_wallet_order(p_user uuid, p_product uuid, p_player_id text, p_player_data jsonb, p_idempotency_key text) TO service_role;
GRANT EXECUTE ON FUNCTION public.publish_game_account(p_game uuid, p_title text, p_price numeric, p_region text, p_platform text, p_images text[], p_days integer, p_email text, p_password text, p_notes text) TO anon;
GRANT EXECUTE ON FUNCTION public.publish_game_account(p_game uuid, p_title text, p_price numeric, p_region text, p_platform text, p_images text[], p_days integer, p_email text, p_password text, p_notes text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.publish_game_account(p_game uuid, p_title text, p_price numeric, p_region text, p_platform text, p_images text[], p_days integer, p_email text, p_password text, p_notes text) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_wallet_order(p_order uuid, p_reason text) TO anon;
GRANT EXECUTE ON FUNCTION public.refund_wallet_order(p_order uuid, p_reason text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refund_wallet_order(p_order uuid, p_reason text) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_payment_line(p_deposit uuid, p_reason text) TO anon;
GRANT EXECUTE ON FUNCTION public.release_payment_line(p_deposit uuid, p_reason text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_payment_line(p_deposit uuid, p_reason text) TO service_role;
GRANT EXECUTE ON FUNCTION public.request_deposit(p_user uuid, p_amount numeric, p_method payment_method, p_reference text, p_has_proof boolean) TO anon;
GRANT EXECUTE ON FUNCTION public.request_deposit(p_user uuid, p_amount numeric, p_method payment_method, p_reference text, p_has_proof boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_deposit(p_user uuid, p_amount numeric, p_method payment_method, p_reference text, p_has_proof boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.request_deposit_v2(p_user uuid, p_amount numeric, p_method payment_method, p_reference text, p_has_proof boolean, p_destination uuid, p_transaction_id text, p_sender_phone text, p_proof_url text) TO anon;
GRANT EXECUTE ON FUNCTION public.request_deposit_v2(p_user uuid, p_amount numeric, p_method payment_method, p_reference text, p_has_proof boolean, p_destination uuid, p_transaction_id text, p_sender_phone text, p_proof_url text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_deposit_v2(p_user uuid, p_amount numeric, p_method payment_method, p_reference text, p_has_proof boolean, p_destination uuid, p_transaction_id text, p_sender_phone text, p_proof_url text) TO service_role;
GRANT EXECUTE ON FUNCTION public.request_withdrawal(p_amount numeric, p_method payment_method, p_destination text) TO anon;
GRANT EXECUTE ON FUNCTION public.request_withdrawal(p_amount numeric, p_method payment_method, p_destination text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_withdrawal(p_amount numeric, p_method payment_method, p_destination text) TO service_role;
GRANT EXECUTE ON FUNCTION public.review_deposit(p_deposit uuid, p_approve boolean, p_reason text, p_admin uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.review_deposit(p_deposit uuid, p_approve boolean, p_reason text, p_admin uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_deposit(p_deposit uuid, p_approve boolean, p_reason text, p_admin uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.review_game_account(p_listing uuid, p_approve boolean, p_reason text) TO anon;
GRANT EXECUTE ON FUNCTION public.review_game_account(p_listing uuid, p_approve boolean, p_reason text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_game_account(p_listing uuid, p_approve boolean, p_reason text) TO service_role;
GRANT EXECUTE ON FUNCTION public.review_withdrawal(p_withdrawal uuid, p_approve boolean, p_reason text) TO anon;
GRANT EXECUTE ON FUNCTION public.review_withdrawal(p_withdrawal uuid, p_approve boolean, p_reason text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_withdrawal(p_withdrawal uuid, p_approve boolean, p_reason text) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_display_currency(p_currency text) TO anon;
GRANT EXECUTE ON FUNCTION public.set_display_currency(p_currency text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_display_currency(p_currency text) TO service_role;
GRANT EXECUTE ON FUNCTION public.subscribe_event(p_event uuid, p_game_account_id text) TO anon;
GRANT EXECUTE ON FUNCTION public.subscribe_event(p_event uuid, p_game_account_id text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.subscribe_event(p_event uuid, p_game_account_id text) TO service_role;
GRANT EXECUTE ON FUNCTION public.top_recharged_games(_limit integer) TO anon;
GRANT EXECUTE ON FUNCTION public.top_recharged_games(_limit integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.top_recharged_games(_limit integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO anon;
GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO service_role;

-- ============ ROW LEVEL SECURITY ============
ALTER TABLE public.api_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.currency_switch_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deposits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_account_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_destinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_line_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_currency_prefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_favorite_games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.withdrawals ENABLE ROW LEVEL SECURITY;

-- ============ POLICIES ============
CREATE POLICY apitx_admin_all ON public.api_transactions AS PERMISSIVE FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "own currency log" ON public.currency_switch_log AS PERMISSIVE FOR SELECT TO authenticated
  USING ((auth.uid() = user_id));
CREATE POLICY deposits_admin_all ON public.deposits AS PERMISSIVE FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY deposits_read_own ON public.deposits AS PERMISSIVE FOR SELECT TO authenticated
  USING (((user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY esub_admin_all ON public.event_subscriptions AS PERMISSIVE FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY esub_read_own ON public.event_subscriptions AS PERMISSIVE FOR SELECT TO authenticated
  USING (((user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY events_admin_all ON public.events AS PERMISSIVE FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY events_public_read ON public.events AS PERMISSIVE FOR SELECT TO public
  USING (true);
CREATE POLICY gas_admin_all ON public.game_account_secrets AS PERMISSIVE FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY gas_admin_read ON public.game_account_secrets AS PERMISSIVE FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY gas_seller_insert ON public.game_account_secrets AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM game_accounts ga
  WHERE ((ga.id = game_account_secrets.account_id) AND (ga.seller_id = auth.uid())))));
CREATE POLICY ga_admin_all ON public.game_accounts AS PERMISSIVE FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY ga_insert_own ON public.game_accounts AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((seller_id = auth.uid()));
CREATE POLICY ga_public_read_approved ON public.game_accounts AS PERMISSIVE FOR SELECT TO anon, authenticated
  USING (((status = 'aprobada'::listing_status) AND ((expires_at IS NULL) OR (expires_at > now()))));
CREATE POLICY ga_read_own ON public.game_accounts AS PERMISSIVE FOR SELECT TO authenticated
  USING (((seller_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY ga_update_own ON public.game_accounts AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((seller_id = auth.uid()))
  WITH CHECK ((seller_id = auth.uid()));
CREATE POLICY games_admin_all ON public.games AS PERMISSIVE FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY games_public_read ON public.games AS PERMISSIVE FOR SELECT TO public
  USING (true);
CREATE POLICY notif_admin_all ON public.notifications AS PERMISSIVE FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY notif_read_own ON public.notifications AS PERMISSIVE FOR SELECT TO authenticated
  USING (((user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY notif_update_own ON public.notifications AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((user_id = auth.uid()))
  WITH CHECK ((user_id = auth.uid()));
CREATE POLICY orders_admin_all ON public.orders AS PERMISSIVE FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY orders_read_own ON public.orders AS PERMISSIVE FOR SELECT TO authenticated
  USING (((user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Destinos activos visibles para clientes" ON public.payment_destinations AS PERMISSIVE FOR SELECT TO authenticated
  USING ((active OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Solo el administrador administra destinos" ON public.payment_destinations AS PERMISSIVE FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins read line history" ON public.payment_line_events AS PERMISSIVE FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users read own line history" ON public.payment_line_events AS PERMISSIVE FOR SELECT TO authenticated
  USING ((user_id = auth.uid()));
CREATE POLICY "Admins manage payment lines" ON public.payment_lines AS PERMISSIVE FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY psettings_admin_all ON public.payment_settings AS PERMISSIVE FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY psettings_read ON public.payment_settings AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);
CREATE POLICY payments_admin_all ON public.payments AS PERMISSIVE FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY payments_read_own ON public.payments AS PERMISSIVE FOR SELECT TO authenticated
  USING (((user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Cualquiera puede leer los ajustes publicos" ON public.platform_settings AS PERMISSIVE FOR SELECT TO public
  USING (true);
CREATE POLICY products_admin_all ON public.products AS PERMISSIVE FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY products_public_read ON public.products AS PERMISSIVE FOR SELECT TO public
  USING (true);
CREATE POLICY profiles_insert_own ON public.profiles AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((id = auth.uid()));
CREATE POLICY profiles_read_own ON public.profiles AS PERMISSIVE FOR SELECT TO authenticated
  USING (((id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY profiles_update_own ON public.profiles AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role)))
  WITH CHECK (((id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY referrals_admin_all ON public.referrals AS PERMISSIVE FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY referrals_read_own ON public.referrals AS PERMISSIVE FOR SELECT TO authenticated
  USING (((referrer_user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "own currency pref" ON public.user_currency_prefs AS PERMISSIVE FOR ALL TO authenticated
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users manage their favorites" ON public.user_favorite_games AS PERMISSIVE FOR ALL TO authenticated
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));
CREATE POLICY roles_admin_all ON public.user_roles AS PERMISSIVE FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY roles_self_read ON public.user_roles AS PERMISSIVE FOR SELECT TO authenticated
  USING ((user_id = auth.uid()));
CREATE POLICY wtx_admin_all ON public.wallet_transactions AS PERMISSIVE FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY wtx_read_own ON public.wallet_transactions AS PERMISSIVE FOR SELECT TO authenticated
  USING (((user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY wallets_admin_all ON public.wallets AS PERMISSIVE FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY wallets_read_own ON public.wallets AS PERMISSIVE FOR SELECT TO authenticated
  USING (((user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY withdrawals_admin_all ON public.withdrawals AS PERMISSIVE FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY withdrawals_read_own ON public.withdrawals AS PERMISSIVE FOR SELECT TO authenticated
  USING (((user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role)));

-- ============ STORAGE: BUCKETS ============
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', 'f', 5242880, NULL)
ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('catalog', 'catalog', 'f', 5242880, NULL)
ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('deposit-proofs', 'deposit-proofs', 'f', 8388608, NULL)
ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('listings', 'listings', 'f', 5242880, NULL)
ON CONFLICT (id) DO NOTHING;

-- ============ STORAGE: POLICIES (storage.objects) ============
CREATE POLICY "Cliente borra su comprobante no enviado" ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated
  USING (((bucket_id = 'deposit-proofs'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
CREATE POLICY "Cliente sube su comprobante" ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((bucket_id = 'deposit-proofs'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
CREATE POLICY "Cliente ve su comprobante" ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated
  USING (((bucket_id = 'deposit-proofs'::text) AND (((storage.foldername(name))[1] = (auth.uid())::text) OR has_role(auth.uid(), 'admin'::app_role))));
CREATE POLICY avatars_delete_own ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated
  USING (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
CREATE POLICY avatars_insert_own ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
CREATE POLICY avatars_select_own ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated
  USING (((bucket_id = 'avatars'::text) AND ((owner = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role))));
CREATE POLICY avatars_update_own ON storage.objects AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)))
  WITH CHECK (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
CREATE POLICY catalog_admin_delete ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated
  USING (((bucket_id = 'catalog'::text) AND has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY catalog_admin_insert ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((bucket_id = 'catalog'::text) AND has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY catalog_admin_update ON storage.objects AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((bucket_id = 'catalog'::text) AND has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY catalog_read ON storage.objects AS PERMISSIVE FOR SELECT TO public
  USING ((bucket_id = 'catalog'::text));
CREATE POLICY listings_delete_own ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated
  USING (((bucket_id = 'listings'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
CREATE POLICY listings_insert_own ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((bucket_id = 'listings'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
CREATE POLICY listings_read_authenticated ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated
  USING ((bucket_id = 'listings'::text));
CREATE POLICY listings_update_own ON storage.objects AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((bucket_id = 'listings'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)))
  WITH CHECK (((bucket_id = 'listings'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

-- ============ REALTIME ============
-- La publicación 'supabase_realtime' no tiene ninguna tabla publicada
-- en el estado actual. Para habilitar Realtime en una tabla:
--   ALTER TABLE public.<tabla> REPLICA IDENTITY FULL;
--   ALTER PUBLICATION supabase_realtime ADD TABLE public.<tabla>;

-- ============ NOTAS DE PARIDAD ============
-- 1) La función public.handle_new_user() existe, pero en el estado actual
--    NO hay ningún trigger sobre auth.users que la invoque. Este baseline
--    refleja ese estado tal cual, sin cambiar el comportamiento.
--    En un proyecto Supabase propio se activaría con:
--      CREATE TRIGGER on_auth_user_created
--        AFTER INSERT ON auth.users
--        FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
-- 2) Los objetos de los esquemas auth, storage, realtime y vault los crea
--    la propia plataforma Supabase y no se replican aquí.
-- 3) Secretos y variables de entorno (claves de API, URL del proyecto,
--    claves de servicio) se configuran fuera de la base de datos.
