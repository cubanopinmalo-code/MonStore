REVOKE EXECUTE ON FUNCTION public.top_recharged_games(integer) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.top_recharged_games(integer) TO service_role;