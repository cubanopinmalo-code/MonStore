-- 1) iPhone: pasa a ser un destino de transferencia con tarjeta receptora.
UPDATE public.payment_destinations
SET kind = 'tarjeta',
    requires_proof = true,
    updated_at = now()
WHERE channel = 'iphone';

-- 2) Única fuente de verdad: el estado del método de transferencia se deriva
--    de los destinos configurados por el administrador.
CREATE OR REPLACE FUNCTION public.sync_transfer_method_active()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.payment_settings s
  SET active = EXISTS (
        SELECT 1 FROM public.payment_destinations d WHERE d.active
      ),
      updated_at = now()
  WHERE s.payment_method = 'tarjeta_cup'
    AND s.active IS DISTINCT FROM EXISTS (
        SELECT 1 FROM public.payment_destinations d WHERE d.active
      );
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_transfer_method_active() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sync_transfer_method_active ON public.payment_destinations;
CREATE TRIGGER trg_sync_transfer_method_active
AFTER INSERT OR UPDATE OR DELETE ON public.payment_destinations
FOR EACH STATEMENT EXECUTE FUNCTION public.sync_transfer_method_active();

-- 3) Sincronización inicial con el estado actual de los destinos.
UPDATE public.payment_settings s
SET active = EXISTS (SELECT 1 FROM public.payment_destinations d WHERE d.active),
    updated_at = now()
WHERE s.payment_method = 'tarjeta_cup';