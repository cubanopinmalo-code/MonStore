CREATE POLICY "listings_read_authenticated" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'listings');

CREATE POLICY "listings_insert_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'listings' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "listings_update_own" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'listings' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'listings' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "listings_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'listings' AND (storage.foldername(name))[1] = auth.uid()::text);