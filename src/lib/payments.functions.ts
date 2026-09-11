import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

type DbPaymentMethod = Database["public"]["Enums"]["payment_method"];

/** Dato de transferencia escrito por el administrador (nombre + valor). */
export interface TransferField {
  label: string;
  value: string;
}

export interface PaymentMethodInfo {
  payment_method: string;
  label: string;
  instructions: string;
  active: boolean;
  deposit_bonus_pct: number;
  withdrawal_fee_pct: number;
  withdrawal_conversion_pct: number;
  transfer_fields: TransferField[];
  position: number;
}

interface PaymentSettingsClient {
  from: (table: string) => {
    select: (columns: string) => {
      order: (column: string, options: { ascending: boolean }) => Promise<{
        data: unknown[] | null;
        error: { message: string } | null;
      }>;
    };
    update: (values: Record<string, unknown>) => {
      eq: (column: string, value: string) => Promise<{ error: { message: string } | null }>;
    };
  };
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
}

function parseFields(value: unknown): TransferField[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .map((item) => ({
      label: typeof item["label"] === "string" ? item["label"] : "",
      value: typeof item["value"] === "string" ? item["value"] : "",
    }));
}

async function requireAdmin(supabase: PaymentSettingsClient, userId: string): Promise<void> {
  const { data, error } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (error) throw new Error("No se pudo verificar tu permiso.");
  if (!data) throw new Error("Solo el administrador puede cambiar los métodos de pago.");
}

/** Métodos de pago configurados por el administrador, en el orden de muestra. */
export const listPaymentMethods = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PaymentMethodInfo[]> => {
    const { data, error } = await context.supabase
      .from("payment_settings")
      .select(
        "payment_method, label, instructions, active, deposit_bonus_pct, withdrawal_fee_pct, withdrawal_conversion_pct, transfer_fields, position",
      )
      .order("position", { ascending: true });
    if (error) throw new Error("No se pudieron cargar los métodos de pago.");
    return (data ?? []).map((row) => ({
      payment_method: String(row.payment_method),
      label: String(row.label),
      instructions: String(row.instructions ?? ""),
      active: Boolean(row.active),
      deposit_bonus_pct: Number(row.deposit_bonus_pct ?? 0),
      withdrawal_fee_pct: Number(row.withdrawal_fee_pct ?? 0),
      withdrawal_conversion_pct: Number(row.withdrawal_conversion_pct ?? 0),
      transfer_fields: parseFields(row.transfer_fields),
      position: Number(row.position ?? 50),
    }));
  });

export interface PaymentMethodDraft {
  payment_method: string;
  label: string;
  instructions: string;
  active: boolean;
  deposit_bonus_pct: number;
  withdrawal_fee_pct: number;
  withdrawal_conversion_pct: number;
  transfer_fields: TransferField[];
}

function normaliseDraft(data: PaymentMethodDraft) {
  if (typeof data?.payment_method !== "string" || data.payment_method.length === 0) {
    throw new Error("No se indicó el método de pago.");
  }
  const fields = (Array.isArray(data.transfer_fields) ? data.transfer_fields : [])
    .slice(0, 8)
    .map((field) => ({
      label: String(field?.label ?? "").trim().slice(0, 40),
      value: String(field?.value ?? "").trim().slice(0, 220),
    }))
    .filter((field) => field.label.length > 0);
  return {
    payment_method: data.payment_method,
    label: String(data.label ?? "").trim().slice(0, 40) || data.payment_method,
    instructions: String(data.instructions ?? "").slice(0, 600),
    active: Boolean(data.active),
    deposit_bonus_pct: Math.max(0, Math.min(500, Number(data.deposit_bonus_pct) || 0)),
    withdrawal_fee_pct: Math.max(0, Math.min(100, Number(data.withdrawal_fee_pct) || 0)),
    withdrawal_conversion_pct: Math.max(0, Math.min(100, Number(data.withdrawal_conversion_pct) || 0)),
    transfer_fields: fields,
  };
}

/** El administrador guarda los datos de transferencia y porcentajes de un método. */
export const savePaymentMethod = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: PaymentMethodDraft) => normaliseDraft(data))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase as unknown as PaymentSettingsClient, context.userId);
    const { error } = await context.supabase
      .from("payment_settings")
      .update({
        label: data.label,
        instructions: data.instructions,
        active: data.active,
        deposit_bonus_pct: data.deposit_bonus_pct,
        withdrawal_fee_pct: data.withdrawal_fee_pct,
        withdrawal_conversion_pct: data.withdrawal_conversion_pct,
        transfer_fields: data.transfer_fields,
      })
      .eq("payment_method", data.payment_method as DbPaymentMethod);
    if (error) throw new Error("No se pudo guardar el método de pago.");
    return { saved: true };
  });

const DEPOSIT_METHODS = ["saldo_movil", "tarjeta_cup", "usdt", "zelle"] as const;
export type DepositMethod = (typeof DEPOSIT_METHODS)[number];

export interface RequestDepositInput {
  amount: number;
  method: string;
  reference?: string;
  hasProof: boolean;
}

/**
 * El cliente envía una solicitud de fondos. Solo se aceptan métodos activados
 * por el administrador y el registro lo hace la parte privada de la aplicación.
 */
export const requestDeposit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: RequestDepositInput) => {
    const amount = Math.round(Number(data?.amount) || 0);
    const method = String(data?.method ?? "");
    if (amount <= 0) throw new Error("Escribe un importe válido.");
    if (!DEPOSIT_METHODS.includes(method as DepositMethod)) {
      throw new Error("Ese método de pago no está disponible.");
    }
    return {
      amount,
      method,
      reference: String(data?.reference ?? "").trim().slice(0, 160),
      hasProof: Boolean(data?.hasProof),
    };
  })
  .handler(async ({ data, context }) => {
    const { data: settings, error: settingsError } = await context.supabase
      .from("payment_settings")
      .select("active")
      .eq("payment_method", data.method as DbPaymentMethod)
      .maybeSingle();
    if (settingsError) throw new Error("No se pudo verificar el método de pago.");
    if (!settings || !settings.active) {
      throw new Error("Ese método de pago está desactivado por ahora.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("request_deposit", {
      p_user: context.userId,
      p_amount: data.amount,
      p_method: data.method as DbPaymentMethod,
      p_reference: data.reference,
      p_has_proof: data.hasProof,
    });
    if (error) throw new Error(error.message);
    return { sent: true };
  });

export interface ReviewDepositInput {
  depositId: string;
  approve: boolean;
  reason?: string;
}

/** El administrador aprueba o rechaza una solicitud de fondos. */
export const reviewDeposit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: ReviewDepositInput) => {
    const depositId = String(data?.depositId ?? "");
    if (depositId.length === 0) throw new Error("No se indicó la solicitud.");
    return {
      depositId,
      approve: Boolean(data?.approve),
      reason: String(data?.reason ?? "").trim().slice(0, 300),
    };
  })
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase as unknown as PaymentSettingsClient, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("review_deposit", {
      p_deposit: data.depositId,
      p_approve: data.approve,
      p_reason: data.reason,
      p_admin: context.userId,
    });
    if (error) throw new Error(error.message);
    return { reviewed: true };
  });

/** El cliente cobra el premio de referidos cuando completó la barra. */
export const claimReferralReward = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("claim_referral_reward", {
      p_user: context.userId,
    });
    if (error) throw new Error(error.message);
    return data as { amount: number; balance: number };
  });
