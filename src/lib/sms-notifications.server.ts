/**
 * Aviso SMS de "fondos acreditados".
 *
 * Solo servidor. El cobro, el historial y la devolución en caso de fallo viven
 * en la base de datos (`prepare_funds_sms` / `mark_funds_sms`); aquí únicamente
 * se realiza el envío real con ZdSMS. Si el cliente no activó el aviso, si no
 * hay saldo o si el depósito no está acreditado, no se envía ni se cobra nada.
 */
import { e164Phone } from "./phone";

/** Texto exacto que recibe el cliente. No debe modificarse. */
export const FUNDS_SMS_TEXT =
  "MonStore : Sus fondos fueron agregados correctamente y ya puede realizar su compra";

interface RpcClient {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
}

export interface FundsSmsOutcome {
  sent: boolean;
  reason: string;
}

/** Intenta enviar el aviso tras acreditar un depósito. Nunca lanza. */
export async function notifyFundsCredited(
  supabase: RpcClient,
  depositId: string,
): Promise<FundsSmsOutcome> {
  const prepared = await supabase.rpc("prepare_funds_sms", { p_deposit: depositId });
  if (prepared.error) return { sent: false, reason: "no_preparado" };

  const payload = (prepared.data ?? {}) as {
    send?: boolean;
    reason?: string;
    log_id?: string;
    phone?: string;
  };
  if (!payload.send || !payload.log_id || !payload.phone) {
    return { sent: false, reason: String(payload.reason ?? "no_enviado") };
  }

  const { sendSms } = await import("./zdsms.server");
  const result = await sendSms(e164Phone(payload.phone), FUNDS_SMS_TEXT);

  await supabase.rpc("mark_funds_sms", {
    p_log: payload.log_id,
    p_status: result.ok ? "enviado" : "fallido",
    p_provider_mode: result.mode,
    p_provider_id: result.messageId ?? "",
    p_error: result.ok ? "" : (result.error ?? "envio_fallido"),
  });

  return { sent: result.ok, reason: result.ok ? "enviado" : (result.error ?? "envio_fallido") };
}
