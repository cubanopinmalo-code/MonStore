-- FASE 2.9.0.1 — Revocación de los tres permisos concedidos de más (R3 de la auditoría 2.9.0).
-- Estas tres tablas son exclusivamente de servidor: se leen y escriben con la clave de
-- servicio (otp-config.server.ts, otp-usage.server.ts) o por funciones SECURITY DEFINER
-- (audit_log). Ningún código de navegador las consulta, por lo que retirar los privilegios
-- de anon y authenticated no afecta a ninguna funcionalidad legítima.

REVOKE ALL ON TABLE public.audit_log FROM anon, authenticated;
REVOKE ALL ON TABLE public.otp_limits FROM anon, authenticated;
REVOKE ALL ON TABLE public.otp_sms_log FROM anon, authenticated;

-- El acceso privilegiado se mantiene intacto.
GRANT ALL ON TABLE public.audit_log TO service_role;
GRANT ALL ON TABLE public.otp_limits TO service_role;
GRANT ALL ON TABLE public.otp_sms_log TO service_role;
