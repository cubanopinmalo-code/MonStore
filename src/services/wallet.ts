import { mockWallet, mockWalletTransactions } from "@/data/mock/wallet";
import { mockPaymentSettings } from "@/data/mock/admin";
import type { PaymentMethod, PaymentSetting, Wallet, WalletTransaction } from "@/types";

export function getWallet(): Promise<Wallet> {
  return Promise.resolve(mockWallet);
}

export function getWalletTransactions(): Promise<WalletTransaction[]> {
  return Promise.resolve(mockWalletTransactions);
}

export function getPaymentSettings(): Promise<PaymentSetting[]> {
  return Promise.resolve(mockPaymentSettings.filter((setting) => setting.active));
}

export function findPaymentSetting(
  method: Exclude<PaymentMethod, "wallet"> | string,
): PaymentSetting | undefined {
  return mockPaymentSettings.find((setting) => setting.payment_method === method);
}

/** Comisión de retiro por defecto (se usa cuando el método no tiene una propia). */
export const WITHDRAWAL_FEE_PCT = 5;

export interface DepositBreakdown {
  amount: number;
  bonusPct: number;
  bonus: number;
  credited: number;
}

/** Depósito: el importe enviado se convierte con el % configurado por el administrador. */
export function calculateDeposit(
  amount: number,
  method: Exclude<PaymentMethod, "wallet"> | string,
): DepositBreakdown {
  const bonusPct = findPaymentSetting(method)?.deposit_bonus_pct ?? 0;
  const bonus = Math.round((amount * bonusPct) / 100);
  return { amount, bonusPct, bonus, credited: amount + bonus };
}

export interface WithdrawalBreakdown {
  amount: number;
  conversionPct: number;
  conversion: number;
  feePct: number;
  fee: number;
  net: number;
}

/** Retiro: conversión especial (si aplica) y luego comisión sobre el importe convertido. */
export function calculateWithdrawal(
  amount: number,
  method: Exclude<PaymentMethod, "wallet"> | string,
): WithdrawalBreakdown {
  const setting = findPaymentSetting(method);
  const conversionPct = setting?.withdrawal_conversion_pct ?? 0;
  const feePct = setting?.withdrawal_fee_pct ?? WITHDRAWAL_FEE_PCT;
  const conversion = Math.round((amount * conversionPct) / 100);
  const converted = Math.max(amount - conversion, 0);
  const fee = Math.round((converted * feePct) / 100);
  return {
    amount,
    conversionPct,
    conversion,
    feePct,
    fee,
    net: Math.max(converted - fee, 0),
  };
}
