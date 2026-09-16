CREATE OR REPLACE FUNCTION public.gateway_fix_marker() RETURNS void LANGUAGE sql AS $$ SELECT 1 $$;
DROP FUNCTION public.gateway_fix_marker();

DO $$
DECLARE v_src text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname='public' AND p.proname='gateway_process_event';

  v_src := replace(v_src,
$old$    IF v_matches = 0 OR v_deposit_id IS NULL THEN
      v_matches := LEAST(v_matches, 1);
      IF v_matches = 0 THEN
        v_reason := 'No hay ninguna solicitud pendiente que coincida.';
      END IF;
    END IF;$old$,
$new$    IF v_matches = 0 THEN
      v_reason := 'No hay ninguna solicitud pendiente que coincida.';
    END IF;$new$);

  EXECUTE v_src;
END $$;

REVOKE ALL ON FUNCTION public.gateway_process_event(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gateway_process_event(jsonb) TO service_role;