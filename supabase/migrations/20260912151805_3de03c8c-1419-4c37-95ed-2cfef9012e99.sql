CREATE POLICY "Cliente sube su comprobante"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'deposit-proofs' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Cliente ve su comprobante"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'deposit-proofs'
    AND ((storage.foldername(name))[1] = auth.uid()::text OR public.has_role(auth.uid(), 'admin'))
  );

CREATE POLICY "Cliente borra su comprobante no enviado"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'deposit-proofs' AND (storage.foldername(name))[1] = auth.uid()::text);

REVOKE EXECUTE ON FUNCTION public.request_deposit_v2(uuid, numeric, payment_method, text, boolean, uuid, text, text, text) FROM anon, authenticated;