-- Cierra el acceso anónimo a las funciones de compra y reembolso.
REVOKE ALL ON FUNCTION public.place_wallet_order(uuid, uuid, text, jsonb, text) FROM anon, public;
REVOKE ALL ON FUNCTION public.refund_wallet_order(uuid, text) FROM anon, public;

-- Confirmamos que solo quedan autenticada y service_role.
GRANT EXECUTE ON FUNCTION public.place_wallet_order(uuid, uuid, text, jsonb, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.refund_wallet_order(uuid, text) TO authenticated, service_role;