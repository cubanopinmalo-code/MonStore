CREATE TABLE public.user_currency_prefs (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  currency text NOT NULL DEFAULT 'CUP',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.user_currency_prefs TO authenticated;
GRANT ALL ON public.user_currency_prefs TO service_role;
ALTER TABLE public.user_currency_prefs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own currency pref" ON public.user_currency_prefs FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.currency_switch_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  currency text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.currency_switch_log TO authenticated;
GRANT ALL ON public.currency_switch_log TO service_role;
ALTER TABLE public.currency_switch_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own currency log" ON public.currency_switch_log FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX currency_switch_log_user_idx ON public.currency_switch_log(user_id, created_at DESC);

CREATE TRIGGER update_user_currency_prefs_updated_at
BEFORE UPDATE ON public.user_currency_prefs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.set_display_currency(p_currency text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_current text;
  v_day int;
  v_week int;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_auth');
  END IF;
  IF p_currency NOT IN ('CUP', 'SALDO') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_currency');
  END IF;

  SELECT currency INTO v_current FROM public.user_currency_prefs WHERE user_id = v_user;
  IF v_current IS NOT NULL AND v_current = p_currency THEN
    RETURN jsonb_build_object('ok', true, 'currency', p_currency, 'unchanged', true);
  END IF;

  SELECT count(*) INTO v_day FROM public.currency_switch_log
    WHERE user_id = v_user AND created_at > now() - interval '24 hours';
  IF v_day >= 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'daily_limit');
  END IF;

  SELECT count(*) INTO v_week FROM public.currency_switch_log
    WHERE user_id = v_user AND created_at > now() - interval '7 days';
  IF v_week >= 4 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'weekly_limit');
  END IF;

  INSERT INTO public.user_currency_prefs (user_id, currency)
  VALUES (v_user, p_currency)
  ON CONFLICT (user_id) DO UPDATE SET currency = EXCLUDED.currency;

  INSERT INTO public.currency_switch_log (user_id, currency) VALUES (v_user, p_currency);

  RETURN jsonb_build_object('ok', true, 'currency', p_currency);
END;
$$;

REVOKE ALL ON FUNCTION public.set_display_currency(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_display_currency(text) TO authenticated;