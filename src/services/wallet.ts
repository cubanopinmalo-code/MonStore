import { mockWallet, mockWalletTransactions } from "@/data/mock/wallet";
import { mockPaymentSettings } from "@/data/mock/admin";
import type { PaymentSetting, Wallet, WalletTransaction } from "@/types";

export function getWallet(): Promise<Wallet> {
  return Promise.resolve(mockWallet);
}

export function getWalletTransactions(): Promise<WalletTransaction[]> {
  return Promise.resolve(mockWalletTransactions);
}

export function getPaymentSettings(): Promise<PaymentSetting[]> {
  return Promise.resolve(mockPaymentSettings.filter((setting) => setting.active));
}

export const WITHDRAWAL_FEE_PCT = 5;
