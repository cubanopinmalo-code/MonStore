ALTER TABLE public.payment_settings
  ADD COLUMN IF NOT EXISTS transfer_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS position smallint NOT NULL DEFAULT 50;

UPDATE public.payment_settings
SET transfer_fields = jsonb_build_array(
      jsonb_build_object('label', 'Número de destino', 'value', destination_number),
      jsonb_build_object('label', 'Teléfono de contacto', 'value', COALESCE(phone_number, ''))
    ),
    position = 10
WHERE payment_method = 'saldo_movil';

UPDATE public.payment_settings
SET transfer_fields = jsonb_build_array(
      jsonb_build_object('label', 'Número de tarjeta', 'value', COALESCE(card_number, '')),
      jsonb_build_object('label', 'Móvil asociado', 'value', COALESCE(phone_number, ''))
    ),
    position = 20
WHERE payment_method = 'tarjeta_cup';

INSERT INTO public.payment_settings
  (payment_method, label, destination_number, instructions, active,
   deposit_bonus_pct, withdrawal_fee_pct, withdrawal_conversion_pct, transfer_fields, position)
SELECT 'usdt', 'USDT', '',
       'Envía la transferencia a la dirección indicada y adjunta la captura para verificarla.',
       true, 0, 0, 0,
       jsonb_build_array(
         jsonb_build_object('label', 'Dirección USDT', 'value', ''),
         jsonb_build_object('label', 'Red', 'value', 'TRC20')
       ),
       30
WHERE NOT EXISTS (
  SELECT 1 FROM public.payment_settings WHERE payment_method = 'usdt'
);

INSERT INTO public.payment_settings
  (payment_method, label, destination_number, instructions, active,
   deposit_bonus_pct, withdrawal_fee_pct, withdrawal_conversion_pct, transfer_fields, position)
SELECT 'zelle', 'Zelle', '',
       'Envía el pago por Zelle a los datos indicados y adjunta la captura para verificarla.',
       true, 0, 0, 0,
       jsonb_build_array(
         jsonb_build_object('label', 'Correo o teléfono Zelle', 'value', ''),
         jsonb_build_object('label', 'Titular', 'value', '')
       ),
       40
WHERE NOT EXISTS (
  SELECT 1 FROM public.payment_settings WHERE payment_method = 'zelle'
);

GRANT INSERT, UPDATE ON public.payment_settings TO authenticated;
GRANT ALL ON public.payment_settings TO service_role;