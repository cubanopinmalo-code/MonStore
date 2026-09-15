ALTER PUBLICATION supabase_realtime ADD TABLE public.game_accounts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.audit_log;
ALTER TABLE public.game_accounts REPLICA IDENTITY FULL;
ALTER TABLE public.audit_log REPLICA IDENTITY FULL;