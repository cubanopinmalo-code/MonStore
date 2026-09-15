CREATE POLICY "Admin gestiona imagenes de pago"
ON storage.objects FOR ALL TO authenticated
USING (bucket_id = 'payment-guides' AND public.has_role(auth.uid(), 'admin'))
WITH CHECK (bucket_id = 'payment-guides' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Usuarios ven imagenes de pago"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'payment-guides');