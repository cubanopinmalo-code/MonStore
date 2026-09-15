REVOKE ALL ON FUNCTION public.listing_fee_for_days(integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.listing_fee_for_days(integer) TO authenticated;

REVOKE ALL ON FUNCTION public.release_account_sale(uuid) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.process_due_account_sales() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.expire_due_listings() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_account_sale(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.process_due_account_sales() TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_due_listings() TO service_role;