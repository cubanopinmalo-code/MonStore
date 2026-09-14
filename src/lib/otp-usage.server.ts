/**
 * FASE 2.6.1 — Registro de consumo de SMS. SOLO SERVIDOR.
 *
 * Nunca se guarda el código (ni en claro ni en el registro). El teléfono se
 * guarda como huella y como máscara (últimas 4 cifras) para poder auditar sin
 * exponer la lista de números. El origen se guarda como huella, nunca en claro.
 */

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function pepper(): string {
  return process.env["OTP_PEPPER"] ?? process.env["OTP_TEST_PEPPER"] ?? "monstore-fase-2-6-prueba";
}

export function maskPhone(phoneE164: string): string {
  return `***${phoneE164.slice(-4)}`;
}

export interface SmsUsageEntry {
  phoneE164: string;
  ip: string;
  outcome: "enviado" | "simulado" | "fallido" | "bloqueado";
  providerMode?: string;
  providerMessageId?: string | null;
  errorCode?: string | null;
}

export async function logSmsUsage(entry: SmsUsageEntry): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await (supabaseAdmin as any).from("otp_sms_log").insert({
      phone_hash: await sha256Hex(`${entry.phoneE164}:${pepper()}`),
      phone_masked: maskPhone(entry.phoneE164),
      ip_hash: entry.ip ? await sha256Hex(`${entry.ip}:${pepper()}`) : null,
      outcome: entry.outcome,
      provider_mode: entry.providerMode ?? null,
      provider_message_id: entry.providerMessageId ?? null,
      error_code: entry.errorCode ?? null,
    });
  } catch {
    // El registro de consumo nunca debe impedir el acceso del usuario.
  }
}

/** Cantidad de SMS realmente enviados (o simulados) en las últimas 24 horas. */
export async function smsSentLast24h(): Promise<number> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - 86_400_000).toISOString();
    const { count } = await (supabaseAdmin as any)
      .from("otp_sms_log")
      .select("id", { count: "exact", head: true })
      .in("outcome", ["enviado", "simulado"])
      .gte("created_at", since);
    return count ?? 0;
  } catch {
    return 0;
  }
}
