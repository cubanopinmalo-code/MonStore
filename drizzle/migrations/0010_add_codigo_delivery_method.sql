-- Aditivo: añade el valor 'codigo' al tipo de entrega.
-- No modifica datos, filas, RLS ni precios existentes.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'delivery_method' AND e.enumlabel = 'codigo'
  ) THEN
    ALTER TYPE public.delivery_method ADD VALUE 'codigo';
  END IF;
END
$$;