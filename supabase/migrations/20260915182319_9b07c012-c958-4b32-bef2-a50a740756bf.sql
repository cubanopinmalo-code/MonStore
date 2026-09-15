ALTER TYPE public.event_status ADD VALUE IF NOT EXISTS 'evento_iniciado';

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS starts_at timestamptz,
  ADD COLUMN IF NOT EXISTS entry_opens_at timestamptz,
  ADD COLUMN IF NOT EXISTS entry_closes_at timestamptz,
  ADD COLUMN IF NOT EXISTS goal_reached_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminder30_at timestamptz,
  ADD COLUMN IF NOT EXISTS admin_alert15_at timestamptz,
  ADD COLUMN IF NOT EXISTS entry_warning5_at timestamptz,
  ADD COLUMN IF NOT EXISTS activated_at timestamptz,
  ADD COLUMN IF NOT EXISTS entry_closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS started_by uuid,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_reason text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS room_locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS room_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS room_updated_by uuid,
  ADD COLUMN IF NOT EXISTS entry_revenue numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS prize_delivery_status text NOT NULL DEFAULT 'pendiente',
  ADD COLUMN IF NOT EXISTS prize_delivery_error text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS reward_note text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS reward_amount numeric,
  ADD COLUMN IF NOT EXISTS winner_game_account_id text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS winner_character_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS finished_by uuid;

ALTER TABLE public.event_subscriptions
  ADD COLUMN IF NOT EXISTS character_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS charged_at timestamptz,
  ADD COLUMN IF NOT EXISTS charge_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS charge_error text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS wallet_transaction_id uuid,
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS event_subscriptions_event_user_key
  ON public.event_subscriptions (event_id, user_id);
CREATE INDEX IF NOT EXISTS events_starts_at_idx ON public.events (starts_at);
CREATE INDEX IF NOT EXISTS events_status_idx ON public.events (status);

UPDATE public.events
SET starts_at = ((event_date::text || ' ' || COALESCE(NULLIF(event_time, ''), '00:00'))::timestamp
                  AT TIME ZONE 'America/Havana')
WHERE starts_at IS NULL AND event_date IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.event_prize_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  winner_user_id uuid NOT NULL,
  subscription_id uuid REFERENCES public.event_subscriptions(id) ON DELETE SET NULL,
  reward_note text NOT NULL DEFAULT '',
  reward_amount numeric,
  status text NOT NULL DEFAULT 'pendiente',
  error_message text NOT NULL DEFAULT '',
  wallet_transaction_id uuid,
  idempotency_key text NOT NULL,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS event_prize_deliveries_key ON public.event_prize_deliveries (idempotency_key);

GRANT SELECT ON public.event_prize_deliveries TO authenticated;
GRANT ALL ON public.event_prize_deliveries TO service_role;
ALTER TABLE public.event_prize_deliveries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS epd_admin_read ON public.event_prize_deliveries;
CREATE POLICY epd_admin_read ON public.event_prize_deliveries
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.event_sms_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  phone text NOT NULL DEFAULT '',
  kind text NOT NULL DEFAULT 'evento_iniciado',
  status text NOT NULL DEFAULT 'pendiente',
  provider_message_id text NOT NULL DEFAULT '',
  error_message text NOT NULL DEFAULT '',
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS event_sms_log_key ON public.event_sms_log (idempotency_key);

GRANT SELECT ON public.event_sms_log TO authenticated;
GRANT ALL ON public.event_sms_log TO service_role;
ALTER TABLE public.event_sms_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS esms_admin_read ON public.event_sms_log;
CREATE POLICY esms_admin_read ON public.event_sms_log
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS event_prize_deliveries_updated_at ON public.event_prize_deliveries;
CREATE TRIGGER event_prize_deliveries_updated_at BEFORE UPDATE ON public.event_prize_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS event_sms_log_updated_at ON public.event_sms_log;
CREATE TRIGGER event_sms_log_updated_at BEFORE UPDATE ON public.event_sms_log
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE VIEW public.events_public AS
SELECT id, name, game_id, event_type, prize, region, min_participants, max_participants,
       event_date, event_time, entry_price, currency, status, room_activated_at,
       entry_window_minutes, description, banner_url, created_at, finished_at,
       starts_at, entry_opens_at, entry_closes_at, goal_reached_at, activated_at,
       entry_closed_at, started_at, cancelled_at, cancel_reason,
       reward_note, winner_character_name, result_published_at
FROM public.events;

GRANT SELECT ON public.events_public TO anon, authenticated;

CREATE OR REPLACE VIEW public.event_results_public AS
SELECT e.id AS event_id, e.name AS event_name, e.event_type, e.game_id, g.name AS game_name,
       g.image_url AS game_image, e.prize, e.reward_note, e.starts_at, e.finished_at,
       e.result_published_at, e.winner_character_name,
       p.name AS winner_name, p.avatar AS winner_avatar
FROM public.events e
LEFT JOIN public.games g ON g.id = e.game_id
LEFT JOIN public.profiles p ON p.id = e.winner_user_id
WHERE e.status = 'finalizado' AND e.result_published_at IS NOT NULL;

GRANT SELECT ON public.event_results_public TO anon, authenticated;