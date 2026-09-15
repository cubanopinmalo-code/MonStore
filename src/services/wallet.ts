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

/**
 * El cálculo de retiros vive solo en el backend: la comisión sale de la
 * configuración global (una única fuente de verdad) y se guarda en cada retiro.
 */
