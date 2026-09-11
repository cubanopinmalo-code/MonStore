
-- Politicas de almacenamiento para fotos de perfil
CREATE POLICY "avatars_select_own" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'avatars' AND (owner = auth.uid() OR public.has_role(auth.uid(), 'admin')));

CREATE POLICY "avatars_insert_own" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "avatars_update_own" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "avatars_delete_own" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- El telefono de registro no se puede cambiar
CREATE OR REPLACE FUNCTION public.keep_profile_phone()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.phone IS DISTINCT FROM OLD.phone THEN
    NEW.phone := OLD.phone;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_keep_phone ON public.profiles;
CREATE TRIGGER profiles_keep_phone
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.keep_profile_phone();
