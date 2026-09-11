DROP VIEW IF EXISTS public.game_accounts_public;

ALTER TABLE public.game_accounts ADD COLUMN seller_name TEXT NOT NULL DEFAULT '';

CREATE TABLE public.game_account_secrets (
  account_id UUID PRIMARY KEY REFERENCES public.game_accounts(id) ON DELETE CASCADE,
  account_email TEXT NOT NULL DEFAULT '',
  account_password TEXT NOT NULL DEFAULT '',
  admin_access_notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.game_account_secrets TO authenticated;
GRANT ALL ON public.game_account_secrets TO service_role;
ALTER TABLE public.game_account_secrets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gas_admin_read" ON public.game_account_secrets FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "gas_seller_insert" ON public.game_account_secrets FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.game_accounts ga WHERE ga.id = account_id AND ga.seller_id = auth.uid()));
CREATE POLICY "gas_admin_all" ON public.game_account_secrets FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

ALTER TABLE public.game_accounts DROP COLUMN account_email;
ALTER TABLE public.game_accounts DROP COLUMN account_password;
ALTER TABLE public.game_accounts DROP COLUMN admin_access_notes;

CREATE POLICY "ga_public_read_approved" ON public.game_accounts FOR SELECT USING (status = 'aprobada');
GRANT SELECT ON public.game_accounts TO anon;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;