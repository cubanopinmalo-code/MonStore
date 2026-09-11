-- Las funciones del dinero quedan reservadas al sistema interno (service_role).
REVOKE ALL ON FUNCTION public.place_wallet_order(uuid, uuid, text, jsonb, text) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.place_wallet_order(uuid, uuid, text, jsonb, text) TO service_role;

REVOKE ALL ON FUNCTION public.refund_wallet_order(uuid, text) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.refund_wallet_order(uuid, text) TO service_role;