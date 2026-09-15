-- 1) Nuevo campo: móvil que el cliente debe dar para confirmar la transferencia.
ALTER TABLE public.payment_destinations
  ADD COLUMN IF NOT EXISTS confirm_phone text NOT NULL DEFAULT '';

-- 2) Reorganización de destinos (ninguna solicitud histórica los referencia).
UPDATE public.payment_destinations
   SET channel = 'tarjeta_cup', bank = NULL, kind = 'tarjeta',
       label = 'Tarjeta CUP', description = 'Transferencia a tarjeta en CUP',
       position = 10, requires_transaction_id = true, requires_proof = true
 WHERE channel = 'metropolitana' AND kind = 'tarjeta';

UPDATE public.payment_destinations
   SET bank = 'Bandec', label = 'Transfermóvil — BANDEC',
       description = 'Transferencia por Transfermóvil a tarjeta BANDEC',
       kind = 'tarjeta', position = 20
 WHERE channel = 'transfermovil' AND coalesce(bank, '') = 'Banco';

UPDATE public.payment_destinations
   SET channel = 'transfermovil', bank = 'Metropolitana', kind = 'monedero',
       label = 'Transfermóvil — Metropolitana (Monedero Mi Transfer)',
       description = 'Envío al Monedero Mi Transfer desde Transfermóvil',
       position = 40
 WHERE channel = 'metropolitana' AND kind = 'monedero';

UPDATE public.payment_destinations
   SET position = 50, requires_proof = true, label = 'EnZona'
 WHERE channel = 'enzona';

INSERT INTO public.payment_destinations
  (channel, bank, kind, label, description, position, requires_transaction_id, requires_proof, active)
SELECT 'transfermovil', 'BPA', 'tarjeta', 'Transfermóvil — BPA',
       'Transferencia por Transfermóvil a tarjeta BPA', 30, true, true, false
 WHERE NOT EXISTS (
   SELECT 1 FROM public.payment_destinations WHERE channel = 'transfermovil' AND bank = 'BPA'
 );

INSERT INTO public.payment_destinations
  (channel, bank, kind, label, description, position, requires_transaction_id, requires_proof, active)
SELECT 'iphone', NULL, 'app', 'Utilizo iPhone',
       'Pago manual verificado por MONSTORE', 60, false, true, false
 WHERE NOT EXISTS (
   SELECT 1 FROM public.payment_destinations WHERE channel = 'iphone'
 );

-- 3) Guardado administrativo con móvil a confirmar, validado y auditado.
CREATE OR REPLACE FUNCTION public.admin_save_payment_destination(
  p_destination uuid,
  p_label text,
  p_description text,
  p_bank text,
  p_holder text,
  p_value text,
  p_instructions text,
  p_requires_transaction_id boolean,
  p_requires_proof boolean,
  p_active boolean,
  p_confirm_phone text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.payment_destinations;
  v_value text := btrim(coalesce(p_value, ''));
  v_label text := btrim(coalesce(p_label, ''));
  v_confirm text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_admin');
  END IF;

  SELECT * INTO v_row FROM public.payment_destinations WHERE id = p_destination FOR UPDATE;
  IF v_row.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_existe');
  END IF;

  IF v_label = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'sin_nombre');
  END IF;

  -- Móvil a confirmar: se mantiene el anterior si no se envía nada.
  IF p_confirm_phone IS NULL THEN
    v_confirm := v_row.confirm_phone;
  ELSIF btrim(p_confirm_phone) = '' THEN
    v_confirm := '';
  ELSE
    v_confirm := public.normalize_cuban_mobile(p_confirm_phone);
    IF v_confirm IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'movil_invalido');
    END IF;
  END IF;

  -- El destino necesita un valor cuando corresponde (iPhone no lleva número de destino).
  IF p_active AND v_value = '' AND v_row.kind <> 'app' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'sin_destino');
  END IF;

  IF v_value <> '' AND v_row.kind IN ('tarjeta', 'cuenta', 'monedero') THEN
    IF regexp_replace(v_value, '\D', '', 'g') = '' THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'formato_invalido');
    END IF;
    IF v_row.kind = 'tarjeta' AND length(regexp_replace(v_value, '\D', '', 'g')) NOT BETWEEN 16 AND 19 THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'tarjeta_invalida');
    END IF;
    IF v_row.kind = 'monedero' AND length(regexp_replace(v_value, '\D', '', 'g')) NOT BETWEEN 8 AND 16 THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'monedero_invalido');
    END IF;
  END IF;

  UPDATE public.payment_destinations SET
    label = left(v_label, 60),
    description = left(btrim(coalesce(p_description, '')), 200),
    bank = nullif(btrim(coalesce(p_bank, '')), ''),
    holder_name = left(btrim(coalesce(p_holder, '')), 80),
    destination_value = left(v_value, 120),
    confirm_phone = v_confirm,
    instructions = left(coalesce(p_instructions, ''), 800),
    requires_transaction_id = coalesce(p_requires_transaction_id, v_row.requires_transaction_id),
    requires_proof = coalesce(p_requires_proof, v_row.requires_proof),
    active = coalesce(p_active, false),
    updated_at = now()
  WHERE id = p_destination;

  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, before, after, note, metadata)
  VALUES (
    auth.uid(), 'destino_pago_actualizado', 'payment_destination', p_destination,
    jsonb_build_object(
      'label', v_row.label, 'bank', v_row.bank, 'holder_name', v_row.holder_name,
      'destination_value', v_row.destination_value, 'confirm_phone', v_row.confirm_phone,
      'instructions', v_row.instructions,
      'requires_transaction_id', v_row.requires_transaction_id,
      'requires_proof', v_row.requires_proof, 'active', v_row.active
    ),
    jsonb_build_object(
      'label', left(v_label, 60), 'bank', nullif(btrim(coalesce(p_bank, '')), ''),
      'holder_name', left(btrim(coalesce(p_holder, '')), 80),
      'destination_value', left(v_value, 120), 'confirm_phone', v_confirm,
      'instructions', left(coalesce(p_instructions, ''), 800),
      'requires_transaction_id', coalesce(p_requires_transaction_id, v_row.requires_transaction_id),
      'requires_proof', coalesce(p_requires_proof, v_row.requires_proof),
      'active', coalesce(p_active, false)
    ),
    concat('Destino de pago actualizado: ', v_row.channel, ' / ', v_row.kind),
    jsonb_build_object('channel', v_row.channel, 'kind', v_row.kind)
  );

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_save_payment_destination(uuid, text, text, text, text, text, text, boolean, boolean, boolean, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_save_payment_destination(uuid, text, text, text, text, text, text, boolean, boolean, boolean, text) TO authenticated;