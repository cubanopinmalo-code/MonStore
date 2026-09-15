REVOKE ALL ON FUNCTION public.complete_withdrawal(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_withdrawal(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.complete_withdrawal(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_withdrawal(uuid, text, text) TO service_role;