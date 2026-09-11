import {
  mockAdminStats,
  mockDeposits,
  mockPaymentSettings,
  mockPayments,
  mockSyncStatus,
  mockWithdrawals,
} from "@/data/mock/admin";
import type {
  AdminStats,
  Deposit,
  Payment,
  PaymentSetting,
  SyncStatus,
  Withdrawal,
} from "@/types";

export function getAdminStats(): Promise<AdminStats> {
  return Promise.resolve(mockAdminStats);
}

export function getDeposits(): Promise<Deposit[]> {
  return Promise.resolve(mockDeposits);
}

export function getWithdrawals(): Promise<Withdrawal[]> {
  return Promise.resolve(mockWithdrawals);
}

export function getPayments(): Promise<Payment[]> {
  return Promise.resolve(mockPayments);
}

export function getAllPaymentSettings(): Promise<PaymentSetting[]> {
  return Promise.resolve(mockPaymentSettings);
}

export function getSyncStatus(): Promise<SyncStatus> {
  return Promise.resolve(mockSyncStatus);
}
