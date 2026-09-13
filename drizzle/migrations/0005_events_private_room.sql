-- Fase 0.5 / migración 6: la contraseña de sala deja de ser pública.
-- ADVERTENCIA: revertir REINTRODUCE la exposición pública de room_id y room_password.

CREATE OR REPLACE VIEW public.events_public
WITH (security_invoker = false, security_barrier = true) AS
SELECT
  id, name, game_id, event_type, prize, region,
  min_participants, max_participants, event_date, event_time,
  entry_price, currency, status, room_activated_at, entry_window_minutes,
  description, banner_url, created_at, finished_at
FROM public.events;

GRANT SELECT ON public.events_public TO anon, authenticated;

-- Lectura directa de events: solo administradores (policy events_admin_all).
DROP POLICY IF EXISTS events_public_read ON public.events;
REVOKE SELECT ON public.events FROM anon;