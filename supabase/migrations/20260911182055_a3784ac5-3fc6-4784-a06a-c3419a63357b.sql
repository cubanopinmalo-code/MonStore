CREATE TABLE public.user_favorite_games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, game_id)
);

GRANT SELECT, INSERT, DELETE ON public.user_favorite_games TO authenticated;
GRANT ALL ON public.user_favorite_games TO service_role;

ALTER TABLE public.user_favorite_games ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their favorites"
ON public.user_favorite_games FOR ALL TO authenticated
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_user_favorite_games_user ON public.user_favorite_games(user_id);

CREATE OR REPLACE FUNCTION public.top_recharged_games(_limit integer DEFAULT 3)
RETURNS TABLE (game_id uuid, orders_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.game_id, count(*)::bigint AS orders_count
  FROM public.orders o
  WHERE o.game_id IS NOT NULL
    AND o.status IN ('completado', 'procesando')
  GROUP BY o.game_id
  ORDER BY count(*) DESC
  LIMIT GREATEST(COALESCE(_limit, 3), 1)
$$;

GRANT EXECUTE ON FUNCTION public.top_recharged_games(integer) TO anon, authenticated, service_role;