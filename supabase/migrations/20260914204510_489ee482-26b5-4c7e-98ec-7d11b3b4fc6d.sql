-- Operaciones que siempre requieren cuenta: fuera del alcance de visitantes.
REVOKE EXECUTE ON FUNCTION public.claim_referral_reward(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.enter_event_room(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.place_wallet_order(uuid, uuid, text, jsonb, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.publish_game_account(uuid, text, numeric, text, text, text[], integer, text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.read_account_credentials(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.refund_wallet_order(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.release_payment_line(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.request_deposit(uuid, numeric, payment_method, text, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.request_deposit_v2(uuid, numeric, payment_method, text, boolean, uuid, text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.request_withdrawal(numeric, payment_method, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.review_deposit(uuid, boolean, text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.review_game_account(uuid, boolean, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.review_withdrawal(uuid, boolean, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_display_currency(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.subscribe_event(uuid, text) FROM anon;

-- Funciones internas de la propia base de datos: nadie las invoca desde la app.
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.keep_profile_phone() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.encrypt_account_credentials() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.log_order_status() FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.otp_challenges IS
  'Desafios OTP. Sin politicas RLS a proposito: ningun rol de la API (anon/authenticated) tiene permisos; solo el servidor con clave de servicio.';
COMMENT ON TABLE public.otp_limits IS
  'Limites OTP. Solo servidor: sin permisos para anon/authenticated.';
COMMENT ON TABLE public.otp_sms_log IS
  'Consumo de SMS OTP. Solo servidor: sin permisos para anon/authenticated.';