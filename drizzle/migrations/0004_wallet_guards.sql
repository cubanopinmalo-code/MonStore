-- Fase 0.5 / migración 5: integridad estructural de la wallet (solo estructura).
ALTER TABLE public.wallets
  ADD COLUMN IF NOT EXISTS held_balance numeric NOT NULL DEFAULT 0;

ALTER TABLE public.wallets
  ADD CONSTRAINT wallets_balance_non_negative CHECK (balance >= 0);

ALTER TABLE public.wallets
  ADD CONSTRAINT wallets_held_balance_non_negative CHECK (held_balance >= 0);

ALTER TABLE public.wallets
  ADD CONSTRAINT wallets_balance_covers_held CHECK (balance >= held_balance);