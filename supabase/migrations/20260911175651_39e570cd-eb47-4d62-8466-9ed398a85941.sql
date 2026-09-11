CREATE TABLE IF NOT EXISTS public._offer_sync (
  game_id uuid PRIMARY KEY,
  code text NOT NULL,
  request_id bigint
);
ALTER TABLE public._offer_sync ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public._offer_sync TO service_role;