-- Fase 0.5 / migración 3: permisos de ejecución por grupo.
-- ADVERTENCIA: revertir estos permisos REINTRODUCE la posibilidad de llamadas anónimas
-- a funciones de dinero. No es una operación rutinaria.

-- Grupo 1 y 2: usuario autenticado / administrador autenticado.
REVOKE EXECUTE ON FUNCTION public.place_wallet_order(uuid, uuid, text, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.place_wallet_order(uuid, uuid, text, jsonb, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.request_deposit(uuid, numeric, payment_method, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_deposit(uuid, numeric, payment_method, text, boolean) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.request_deposit_v2(uuid, numeric, payment_method, text, boolean, uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_deposit_v2(uuid, numeric, payment_method, text, boolean, uuid, text, text, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.claim_referral_reward(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_referral_reward(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.request_withdrawal(numeric, payment_method, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_withdrawal(numeric, payment_method, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.publish_game_account(uuid, text, numeric, text, text, text[], integer, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_game_account(uuid, text, numeric, text, text, text[], integer, text, text, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.subscribe_event(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.subscribe_event(uuid, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.enter_event_room(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enter_event_room(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.set_display_currency(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_display_currency(text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.review_deposit(uuid, boolean, text, uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.review_deposit(uuid, boolean, text, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.review_withdrawal(uuid, boolean, text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.review_withdrawal(uuid, boolean, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.review_game_account(uuid, boolean, text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.review_game_account(uuid, boolean, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.release_payment_line(uuid, text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.release_payment_line(uuid, text) TO authenticated;

-- Grupo 3: backend interno únicamente.
REVOKE EXECUTE ON FUNCTION public.refund_wallet_order(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refund_wallet_order(uuid, text) TO service_role;

-- Grupo 4: lectura pública agregada.
GRANT EXECUTE ON FUNCTION public.event_participant_counts() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.top_recharged_games(integer) TO anon, authenticated;

-- Grupo 5: internas de trigger / policies.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.keep_profile_phone() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;

-- Tablas: el rol anónimo no necesita escritura en ninguna tabla.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM anon;

-- Credenciales de cuentas publicadas: el vendedor solo inserta, nunca lee.
REVOKE ALL ON public.game_account_secrets FROM anon;
REVOKE ALL ON public.game_account_secrets FROM authenticated;
GRANT INSERT ON public.game_account_secrets TO authenticated;
GRANT ALL ON public.game_account_secrets TO service_role;