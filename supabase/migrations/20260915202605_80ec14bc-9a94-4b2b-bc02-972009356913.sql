CREATE OR REPLACE FUNCTION public.release_line_on_final_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Estado final = ya no está pendiente de procesarse: la línea vuelve a estar libre.
  IF NEW.line_id IS NOT NULL
     AND NEW.status IS DISTINCT FROM 'pendiente'::request_status
     AND NEW.line_released_at IS NULL THEN
    NEW.line_released_at := now();
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS deposits_release_line ON public.deposits;
CREATE TRIGGER deposits_release_line
BEFORE UPDATE ON public.deposits
FOR EACH ROW EXECUTE FUNCTION public.release_line_on_final_status();

CREATE OR REPLACE FUNCTION public.log_line_release()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.line_id IS NOT NULL
     AND NEW.line_released_at IS NOT NULL
     AND OLD.line_released_at IS NULL THEN
    INSERT INTO public.payment_line_events (line_id, deposit_id, user_id, actor_id, action, note)
    VALUES (NEW.line_id, NEW.id, NEW.user_id, auth.uid(), 'liberada',
      'Línea liberada automáticamente al quedar la solicitud en estado ' || NEW.status::text || '.');
  END IF;
  RETURN NULL;
END; $$;

DROP TRIGGER IF EXISTS deposits_log_line_release ON public.deposits;
CREATE TRIGGER deposits_log_line_release
AFTER UPDATE ON public.deposits
FOR EACH ROW EXECUTE FUNCTION public.log_line_release();