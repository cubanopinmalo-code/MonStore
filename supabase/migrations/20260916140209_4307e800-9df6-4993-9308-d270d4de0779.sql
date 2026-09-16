REVOKE EXECUTE ON FUNCTION public.admin_create_payment_line(text, text, boolean, payment_method, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_payment_line_active(uuid, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.prepare_funds_sms(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.mark_funds_sms(uuid, text, text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_save_marketplace_game(uuid, text, uuid, text[], text[], jsonb, boolean, smallint) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_marketplace_game_active(uuid, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.publish_game_account_v2(uuid, numeric, text, text, text[], integer, jsonb) FROM anon;