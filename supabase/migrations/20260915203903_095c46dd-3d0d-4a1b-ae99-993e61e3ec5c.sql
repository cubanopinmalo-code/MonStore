ALTER TABLE public.payment_destinations
  ADD COLUMN IF NOT EXISTS holder_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS guide_image_path text NOT NULL DEFAULT '';

INSERT INTO public.payment_destinations
  (channel, bank, kind, label, description, destination_value, instructions,
   requires_transaction_id, requires_proof, requires_sender_phone, active, position)
SELECT v.channel, v.bank, v.kind, v.label, v.description, '', v.instructions,
       v.req_tx, v.req_proof, false, false, v.position
FROM (VALUES
  ('transfermovil', 'Banco', 'tarjeta', 'Transfermóvil', 'Transferencia por Transfermóvil', 'Abre Transfermóvil, elige Transferencias y envía el importe exacto a la tarjeta indicada.', true, true, 10),
  ('enzona', NULL, 'cuenta', 'EnZona', 'Transferencia por EnZona', 'Abre EnZona, elige Enviar dinero y envía el importe exacto al destino indicado. Adjunta la captura del envío.', true, true, 20),
  ('metropolitana', 'Banco Metropolitano', 'tarjeta', 'Metropolitana — tarjeta', 'Transferencia a tarjeta del Banco Metropolitano', 'Envía el importe exacto a la tarjeta indicada y adjunta la captura.', true, true, 30),
  ('metropolitana', 'Mi Transfer', 'monedero', 'Metropolitana — Monedero Mi Transfer', 'Envío al Monedero Mi Transfer', 'En la app Mi Transfer entra en el monedero y envía el importe exacto al número indicado. Guíate por la imagen.', true, true, 40)
) AS v(channel, bank, kind, label, description, instructions, req_tx, req_proof, position)
WHERE NOT EXISTS (
  SELECT 1 FROM public.payment_destinations d
  WHERE d.channel = v.channel AND d.kind = v.kind
);

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
  p_active boolean
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.payment_destinations;
  v_value text := btrim(coalesce(p_value, ''));
  v_label text := btrim(coalesce(p_label, ''));
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

  IF p_active AND v_value = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'sin_destino');
  END IF;

  -- Monedero y saldo: números; tarjeta/cuenta: dígitos con longitud razonable.
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
      'destination_value', v_row.destination_value, 'instructions', v_row.instructions,
      'requires_transaction_id', v_row.requires_transaction_id,
      'requires_proof', v_row.requires_proof, 'active', v_row.active
    ),
    jsonb_build_object(
      'label', left(v_label, 60), 'bank', nullif(btrim(coalesce(p_bank, '')), ''),
      'holder_name', left(btrim(coalesce(p_holder, '')), 80),
      'destination_value', left(v_value, 120), 'instructions', left(coalesce(p_instructions, ''), 800),
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

CREATE OR REPLACE FUNCTION public.admin_set_destination_guide_image(
  p_destination uuid,
  p_path text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.payment_destinations;
  v_path text := btrim(coalesce(p_path, ''));
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_admin');
  END IF;

  SELECT * INTO v_row FROM public.payment_destinations WHERE id = p_destination FOR UPDATE;
  IF v_row.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_existe');
  END IF;

  UPDATE public.payment_destinations
  SET guide_image_path = left(v_path, 300), updated_at = now()
  WHERE id = p_destination;

  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, before, after, note, metadata)
  VALUES (
    auth.uid(),
    CASE WHEN v_path = '' THEN 'imagen_guia_eliminada' ELSE 'imagen_guia_actualizada' END,
    'payment_destination', p_destination,
    jsonb_build_object('tenia_imagen', v_row.guide_image_path <> ''),
    jsonb_build_object('tiene_imagen', v_path <> ''),
    concat('Imagen educativa del destino ', v_row.channel, ' / ', v_row.kind),
    jsonb_build_object('channel', v_row.channel, 'kind', v_row.kind)
  );

  RETURN jsonb_build_object('ok', true, 'path', left(v_path, 300));
END;
$$;

REVOKE ALL ON FUNCTION public.admin_save_payment_destination(uuid, text, text, text, text, text, text, boolean, boolean, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_destination_guide_image(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_save_payment_destination(uuid, text, text, text, text, text, text, boolean, boolean, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_destination_guide_image(uuid, text) TO authenticated;