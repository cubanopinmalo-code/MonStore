DO $$
DECLARE
  fn record;
  signature text;
BEGIN
  FOR fn IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND p.proname IN (
        'claim_referral_reward','enter_event_room','place_wallet_order',
        'publish_game_account','read_account_credentials','refund_wallet_order',
        'release_payment_line','request_deposit','request_deposit_v2',
        'request_withdrawal','review_deposit','review_game_account',
        'review_withdrawal','set_display_currency','subscribe_event'
      )
  LOOP
    signature := format('public.%I(%s)', fn.proname, fn.args);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', signature);
  END LOOP;
END $$;