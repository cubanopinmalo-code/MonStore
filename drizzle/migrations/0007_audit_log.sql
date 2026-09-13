-- Fase 0.5 / migración 8: estructura de auditoría (sin disparadores todavía).
CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  before jsonb,
  after jsonb,
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_log_entity_idx ON public.audit_log (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS audit_log_created_at_idx ON public.audit_log (created_at DESC);

GRANT SELECT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_log_admin_read ON public.audit_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));