
CREATE OR REPLACE FUNCTION public.event_participant_counts()
RETURNS TABLE(event_id uuid, participants bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.event_id, count(*)::bigint
  FROM public.event_subscriptions s
  WHERE s.status <> 'cancelado'
  GROUP BY s.event_id
$$;
REVOKE ALL ON FUNCTION public.event_participant_counts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.event_participant_counts() TO authenticated;
