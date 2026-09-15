-- 1. Nuevos parámetros operativos en la única fila de configuración
ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS min_deposit_cup numeric NOT NULL DEFAULT 500,
  ADD COLUMN IF NOT EXISTS min_withdrawal_cup numeric NOT NULL DEFAULT 1000,
  ADD COLUMN IF NOT EXISTS referral_reward_cup numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS maintenance_mode boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS registration_open boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS marketplace_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_by uuid;

-- 2. Guardado administrativo validado + auditoría
CREATE OR REPLACE FUNCTION public.admin_update_platform_settings(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_admin uuid := auth.uid();
  v_before public.platform_settings;
  v_after public.platform_settings;
  v_num numeric;
  v_key text;
  v_changes jsonb := '{}'::jsonb;
BEGIN
  IF v_admin IS NULL OR NOT public.has_role(v_admin, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Solo un administrador puede cambiar la configuración.';
  END IF;

  SELECT * INTO v_before FROM public.platform_settings LIMIT 1;
  IF NOT FOUND THEN
    INSERT INTO public.platform_settings (id) VALUES (true);
    SELECT * INTO v_before FROM public.platform_settings LIMIT 1;
  END IF;

  -- Validación de números: nunca negativos; porcentajes entre 0 y 100.
  FOR v_key IN SELECT jsonb_object_keys(p_payload) LOOP
    IF v_key IN ('usd_to_cup','usd_margin_cup','saldo_conversion_rate','withdrawal_fee_pct',
                 'listing_fee_per_day','min_deposit_cup','min_withdrawal_cup','referral_reward_cup') THEN
      v_num := NULLIF(p_payload ->> v_key, '')::numeric;
      IF v_num IS NULL THEN
        RAISE EXCEPTION 'El valor de % no puede quedar vacío.', v_key;
      END IF;
      IF v_num < 0 THEN
        RAISE EXCEPTION 'El valor de % no puede ser negativo.', v_key;
      END IF;
      IF v_key = 'withdrawal_fee_pct' AND v_num > 100 THEN
        RAISE EXCEPTION 'La comisión de retiro debe estar entre 0 y 100.';
      END IF;
    END IF;
  END LOOP;

  UPDATE public.platform_settings SET
    usd_to_cup = COALESCE(NULLIF(p_payload ->> 'usd_to_cup','')::numeric, usd_to_cup),
    usd_margin_cup = COALESCE(NULLIF(p_payload ->> 'usd_margin_cup','')::numeric, usd_margin_cup),
    saldo_conversion_rate = COALESCE(NULLIF(p_payload ->> 'saldo_conversion_rate','')::numeric, saldo_conversion_rate),
    withdrawal_fee_pct = COALESCE(NULLIF(p_payload ->> 'withdrawal_fee_pct','')::numeric, withdrawal_fee_pct),
    listing_fee_per_day = COALESCE(NULLIF(p_payload ->> 'listing_fee_per_day','')::numeric, listing_fee_per_day),
    listing_fee_days = COALESCE(p_payload -> 'listing_fee_days', listing_fee_days),
    min_deposit_cup = COALESCE(NULLIF(p_payload ->> 'min_deposit_cup','')::numeric, min_deposit_cup),
    min_withdrawal_cup = COALESCE(NULLIF(p_payload ->> 'min_withdrawal_cup','')::numeric, min_withdrawal_cup),
    referral_reward_cup = COALESCE(NULLIF(p_payload ->> 'referral_reward_cup','')::numeric, referral_reward_cup),
    maintenance_mode = COALESCE((p_payload ->> 'maintenance_mode')::boolean, maintenance_mode),
    registration_open = COALESCE((p_payload ->> 'registration_open')::boolean, registration_open),
    marketplace_enabled = COALESCE((p_payload ->> 'marketplace_enabled')::boolean, marketplace_enabled),
    allow_line_reuse = COALESCE((p_payload ->> 'allow_line_reuse')::boolean, allow_line_reuse),
    support_whatsapp = COALESCE(NULLIF(p_payload ->> 'support_whatsapp',''), support_whatsapp),
    updated_by = v_admin,
    updated_at = now()
  WHERE id = true
  RETURNING * INTO v_after;

  v_changes := jsonb_build_object(
    'before', to_jsonb(v_before) - 'created_at' - 'updated_at' - 'updated_by',
    'after', to_jsonb(v_after) - 'created_at' - 'updated_at' - 'updated_by'
  );

  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, note, before, after)
  VALUES (v_admin, 'configuracion_actualizada', 'platform_settings', NULL,
          'Configuración global actualizada por un administrador.',
          v_changes -> 'before', v_changes -> 'after');

  RETURN to_jsonb(v_after);
END; $function$;

REVOKE ALL ON FUNCTION public.admin_update_platform_settings(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_platform_settings(jsonb) TO authenticated;

-- 3. Retiros: comisión global como única fuente de verdad + mínimo configurable
CREATE OR REPLACE FUNCTION public.request_withdrawal(p_amount numeric, p_method payment_method, p_destination text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_set record; v_wallet record; v_plat record;
  v_conv_pct numeric := 0; v_fee_pct numeric := 5;
  v_conv numeric; v_fee numeric; v_net numeric;
  v_before numeric; v_after numeric; v_id uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Debes iniciar sesión.'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Escribe un importe válido.'; END IF;
  IF p_method = 'wallet' THEN RAISE EXCEPTION 'Método de retiro no válido.'; END IF;
  IF p_destination IS NULL OR length(trim(p_destination)) < 5 THEN
    RAISE EXCEPTION 'Escribe el destino donde quieres recibir el dinero.';
  END IF;

  SELECT * INTO v_plat FROM public.platform_settings LIMIT 1;
  IF COALESCE(v_plat.min_withdrawal_cup, 0) > 0 AND p_amount < v_plat.min_withdrawal_cup THEN
    RAISE EXCEPTION 'El retiro mínimo es % CUP.', trim(trailing '.' FROM to_char(v_plat.min_withdrawal_cup, 'FM999999990.00'));
  END IF;

  SELECT * INTO v_set FROM public.payment_settings WHERE payment_method = p_method AND active = true LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ese método de retiro no está disponible.'; END IF;
  v_conv_pct := COALESCE(v_set.withdrawal_conversion_pct, 0);
  -- Única fuente de verdad de la comisión: la configuración global.
  v_fee_pct := COALESCE(v_plat.withdrawal_fee_pct, v_set.withdrawal_fee_pct, 5);

  SELECT * INTO v_wallet FROM public.wallets WHERE user_id = v_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No encontramos tu wallet.'; END IF;
  IF v_wallet.status <> 'activa' THEN RAISE EXCEPTION 'Tu wallet está bloqueada. Escribe al administrador.'; END IF;

  v_before := v_wallet.balance;
  v_after := v_before - p_amount;
  IF v_after < 0 THEN RAISE EXCEPTION 'No tienes saldo suficiente para ese retiro.'; END IF;

  v_conv := round(p_amount * v_conv_pct / 100, 2);
  v_fee := round((p_amount - v_conv) * v_fee_pct / 100, 2);
  v_net := GREATEST(p_amount - v_conv - v_fee, 0);

  INSERT INTO public.withdrawals (
    user_id, amount, conversion_pct, fee_pct, fee, net_amount,
    payment_method, payment_destination, status, held_amount
  ) VALUES (
    v_user, p_amount, v_conv_pct, v_fee_pct, v_fee, v_net,
    p_method, trim(p_destination), 'pendiente', p_amount
  ) RETURNING id INTO v_id;

  UPDATE public.wallets
  SET balance = v_after,
      held_balance = COALESCE(held_balance, 0) + p_amount
  WHERE id = v_wallet.id;

  INSERT INTO public.wallet_transactions (
    wallet_id, user_id, type, amount, balance_before, balance_after,
    reference_type, reference_id, description, status
  ) VALUES (
    v_wallet.id, v_user, 'retiro', -p_amount, v_before, v_after,
    'withdrawal', v_id, 'Solicitud de retiro', 'pendiente'
  );

  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, target_user_id, amount, note, after)
  VALUES (v_user, 'retiro_solicitado', 'withdrawal', v_id, v_user, p_amount,
    'Retiro solicitado por el cliente. Importe retenido.',
    jsonb_build_object('status', 'pendiente', 'fee_pct', v_fee_pct, 'fee', v_fee, 'net', v_net, 'held', p_amount));

  INSERT INTO public.notifications (user_id, title, message, type, read)
  VALUES (v_user, 'Solicitud de retiro enviada',
    'Retuvimos ' || trim(trailing '.' FROM to_char(p_amount, 'FM999999990.00')) ||
    ' CUP de tu wallet. Recibirás ' || trim(trailing '.' FROM to_char(v_net, 'FM999999990.00')) ||
    ' CUP al completarse. Si se rechaza, te lo devolvemos.', 'retiro_pendiente', false);

  RETURN jsonb_build_object('withdrawal_id', v_id, 'net', v_net, 'balance', v_after, 'held', p_amount, 'fee_pct', v_fee_pct);
END; $function$;

-- 4. Buscar, bloquear y desbloquear usuarios por teléfono
CREATE OR REPLACE FUNCTION public.admin_find_user_by_phone(p_phone text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_admin uuid := auth.uid();
  v_digits text := regexp_replace(COALESCE(p_phone,''), '\D', '', 'g');
  v_row record;
BEGIN
  IF v_admin IS NULL OR NOT public.has_role(v_admin, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Solo un administrador puede buscar usuarios.';
  END IF;
  IF length(v_digits) < 8 THEN RAISE EXCEPTION 'Escribe el número completo.'; END IF;
  v_digits := right(v_digits, 8);

  SELECT p.id, p.name, p.phone, p.province, p.municipality, p.status, p.created_at,
         COALESCE(w.balance, 0) AS balance
    INTO v_row
    FROM public.profiles p
    LEFT JOIN public.wallets w ON w.user_id = p.id
   WHERE right(regexp_replace(p.phone, '\D', '', 'g'), 8) = v_digits
   LIMIT 1;

  IF NOT FOUND THEN RETURN jsonb_build_object('found', false); END IF;
  RETURN jsonb_build_object('found', true, 'user', to_jsonb(v_row));
END; $function$;

CREATE OR REPLACE FUNCTION public.admin_set_user_block(p_user uuid, p_blocked boolean, p_reason text DEFAULT '')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_admin uuid := auth.uid();
  v_profile record;
  v_before text;
  v_after text;
BEGIN
  IF v_admin IS NULL OR NOT public.has_role(v_admin, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Solo un administrador puede cambiar el estado de una cuenta.';
  END IF;
  SELECT * INTO v_profile FROM public.profiles WHERE id = p_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No encontramos ese usuario.'; END IF;
  IF public.has_role(p_user, 'admin'::app_role) THEN
    RAISE EXCEPTION 'No se puede bloquear una cuenta administrativa.';
  END IF;

  v_before := COALESCE(v_profile.status, 'activo');
  v_after := CASE WHEN p_blocked THEN 'bloqueado' ELSE 'activo' END;

  UPDATE public.profiles SET status = v_after, updated_at = now() WHERE id = p_user;

  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, target_user_id, note, before, after)
  VALUES (v_admin,
          CASE WHEN p_blocked THEN 'usuario_bloqueado' ELSE 'usuario_desbloqueado' END,
          'profile', p_user, p_user,
          COALESCE(NULLIF(trim(p_reason), ''), CASE WHEN p_blocked THEN 'Bloqueo administrativo.' ELSE 'Desbloqueo administrativo.' END),
          jsonb_build_object('status', v_before, 'phone', v_profile.phone),
          jsonb_build_object('status', v_after, 'phone', v_profile.phone));

  INSERT INTO public.notifications (user_id, title, message, type, read)
  VALUES (p_user,
          CASE WHEN p_blocked THEN 'Cuenta bloqueada' ELSE 'Cuenta reactivada' END,
          CASE WHEN p_blocked
               THEN 'Un administrador bloqueó tu cuenta. Escribe a atención al cliente si crees que es un error.'
               ELSE 'Tu cuenta volvió a estar activa. Ya puedes usar MonStore.' END,
          'cuenta', false);

  RETURN jsonb_build_object('ok', true, 'status', v_after);
END; $function$;

REVOKE ALL ON FUNCTION public.admin_find_user_by_phone(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_user_block(uuid, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_find_user_by_phone(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_block(uuid, boolean, text) TO authenticated;

-- 5. Notificaciones masivas: conteo previo y envío idempotente
CREATE OR REPLACE FUNCTION public.admin_campaign_audience_count(p_audience text, p_event uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_admin uuid := auth.uid();
  v_count integer := 0;
BEGIN
  IF v_admin IS NULL OR NOT public.has_role(v_admin, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Solo un administrador puede consultar destinatarios.';
  END IF;
  IF p_audience = 'evento' THEN
    IF p_event IS NULL THEN RETURN 0; END IF;
    SELECT count(DISTINCT s.user_id) INTO v_count
      FROM public.event_subscriptions s
      JOIN public.profiles p ON p.id = s.user_id
     WHERE s.event_id = p_event
       AND COALESCE(p.status, 'activo') = 'activo'
       AND s.cancelled_at IS NULL;
  ELSE
    SELECT count(*) INTO v_count FROM public.profiles WHERE COALESCE(status, 'activo') = 'activo';
  END IF;
  RETURN COALESCE(v_count, 0);
END; $function$;

CREATE OR REPLACE FUNCTION public.admin_send_campaign(
  p_title text, p_message text, p_audience text,
  p_event uuid DEFAULT NULL, p_idempotency text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_admin uuid := auth.uid();
  v_key text := COALESCE(NULLIF(trim(p_idempotency), ''), gen_random_uuid()::text);
  v_campaign uuid;
  v_sent integer := 0;
BEGIN
  IF v_admin IS NULL OR NOT public.has_role(v_admin, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Solo un administrador puede enviar notificaciones.';
  END IF;
  IF length(trim(COALESCE(p_title,''))) < 3 THEN RAISE EXCEPTION 'Escribe un título.'; END IF;
  IF length(trim(COALESCE(p_message,''))) < 3 THEN RAISE EXCEPTION 'Escribe el mensaje.'; END IF;
  IF p_audience NOT IN ('todos','evento') THEN RAISE EXCEPTION 'Público no válido.'; END IF;
  IF p_audience = 'evento' AND p_event IS NULL THEN RAISE EXCEPTION 'Elige el evento.'; END IF;

  -- Protección contra doble envío: la misma clave devuelve la campaña existente.
  SELECT id, recipients_count INTO v_campaign, v_sent
    FROM public.notification_campaigns
   WHERE type = v_key
   LIMIT 1;
  IF v_campaign IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'campaign_id', v_campaign, 'recipients', v_sent, 'duplicated', true);
  END IF;

  INSERT INTO public.notification_campaigns (title, message, type, audience, status, created_by, sent_at)
  VALUES (trim(p_title), trim(p_message), v_key,
          CASE WHEN p_audience = 'evento' THEN 'evento:' || p_event::text ELSE 'todos' END,
          'enviando', v_admin, now())
  RETURNING id INTO v_campaign;

  WITH destinatarios AS (
    SELECT p.id AS user_id
      FROM public.profiles p
     WHERE COALESCE(p.status, 'activo') = 'activo'
       AND (
         p_audience = 'todos'
         OR EXISTS (
           SELECT 1 FROM public.event_subscriptions s
            WHERE s.event_id = p_event AND s.user_id = p.id AND s.cancelled_at IS NULL
         )
       )
  ), insertados AS (
    INSERT INTO public.notifications (user_id, title, message, type, read, campaign_id, dedupe_key)
    SELECT user_id, trim(p_title), trim(p_message), 'aviso', false, v_campaign, v_key || ':' || user_id::text
      FROM destinatarios
    ON CONFLICT DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_sent FROM insertados;

  UPDATE public.notification_campaigns
     SET status = 'enviada', recipients_count = v_sent, delivered_count = v_sent, updated_at = now()
   WHERE id = v_campaign;

  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, note, after)
  VALUES (v_admin, 'notificacion_masiva', 'notification_campaign', v_campaign,
          'Notificación masiva enviada a ' || v_sent || ' cliente(s).',
          jsonb_build_object('audience', p_audience, 'event_id', p_event,
                             'title', trim(p_title), 'recipients', v_sent));

  RETURN jsonb_build_object('ok', true, 'campaign_id', v_campaign, 'recipients', v_sent, 'duplicated', false);
END; $function$;

REVOKE ALL ON FUNCTION public.admin_campaign_audience_count(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_send_campaign(text, text, text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_campaign_audience_count(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_send_campaign(text, text, text, uuid, text) TO authenticated;

-- 6. Premio de referidos configurable (0 = usar el valor del USDT, comportamiento actual)
CREATE OR REPLACE FUNCTION public.claim_referral_reward(p_user uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := p_user;
  v_goal int := 10;
  v_count int;
  v_rate numeric;
  v_wallet record;
  v_before numeric;
  v_after numeric;
  v_ids uuid[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión.';
  END IF;
  IF p_user IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'No puedes reclamar el premio de otra persona.';
  END IF;

  SELECT array_agg(id) INTO v_ids FROM (
    SELECT id FROM public.referrals
    WHERE referrer_user_id = v_user AND reward_claimed_at IS NULL
    ORDER BY created_at
    LIMIT v_goal
    FOR UPDATE
  ) s;

  v_count := COALESCE(array_length(v_ids, 1), 0);
  IF v_count < v_goal THEN
    RAISE EXCEPTION 'Todavía no completaste los % invitados.', v_goal;
  END IF;

  SELECT CASE WHEN COALESCE(referral_reward_cup, 0) > 0 THEN referral_reward_cup ELSE usd_to_cup END
    INTO v_rate FROM public.platform_settings LIMIT 1;
  IF COALESCE(v_rate, 0) <= 0 THEN
    RAISE EXCEPTION 'El administrador aún no configuró el premio por referidos.';
  END IF;

  SELECT * INTO v_wallet FROM public.wallets WHERE user_id = v_user FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No encontramos tu wallet.';
  END IF;

  v_before := v_wallet.balance;
  v_after := v_before + v_rate;

  UPDATE public.wallets SET balance = v_after WHERE id = v_wallet.id;

  UPDATE public.referrals
  SET reward_claimed_at = now(), status = 'activo', reward_amount = round(v_rate / v_goal, 2)
  WHERE id = ANY(v_ids);

  INSERT INTO public.wallet_transactions (
    wallet_id, user_id, type, amount, balance_before, balance_after,
    reference_type, reference_id, description, status
  ) VALUES (
    v_wallet.id, v_user, 'premio', v_rate, v_before, v_after,
    'referral_reward', NULL, 'Premio por 10 invitados', 'completado'
  );

  INSERT INTO public.notifications (user_id, title, message, type, read)
  VALUES (
    v_user, 'Premio de referidos',
    'Agregamos ' || trim(trailing '.' FROM to_char(v_rate, 'FM999999990.00')) ||
      ' CUP a tu wallet por invitar a 10 personas.',
    'premio', false
  );

  RETURN jsonb_build_object('amount', v_rate, 'balance', v_after);
END; $function$;