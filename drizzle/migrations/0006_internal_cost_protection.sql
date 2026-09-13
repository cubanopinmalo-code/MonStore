-- Fase 0.5 / migración 7: el coste interno del proveedor deja de ser legible por el cliente.
-- ADVERTENCIA: revertir REINTRODUCE la exposición del margen comercial.
REVOKE SELECT (g2bulk_cost) ON public.products FROM anon, authenticated;