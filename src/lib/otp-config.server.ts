/**
 * FASE 2.6.1 — Límites del acceso por código SMS. SOLO SERVIDOR.
 *
 * Los valores viven en la tabla `public.otp_limits` (una sola fila, sin ningún
 * permiso para el navegador). El frontend NO puede leerlos ni modificarlos.
 * Si la tabla no está disponible se usan los valores por defecto de abajo.
 */

export interface OtpLimits {
  codeLength: number;
  ttlSeconds: number;
  maxAttempts: number;
  resendCooldownSeconds: number;
  maxPerPhonePerDay: number;
  maxPerIpPerHour: number;
  /** Tope diario de SMS de todo el proyecto. null = sin tope (pendiente de decisión). */
  dailySmsCap: number | null;
}

export const DEFAULT_OTP_LIMITS: OtpLimits = {
  codeLength: 6,
  ttlSeconds: 300,
  maxAttempts: 5,
  resendCooldownSeconds: 60,
  maxPerPhonePerDay: 5,
  maxPerIpPerHour: 10,
  dailySmsCap: null,
};

export async function getOtpLimits(): Promise<OtpLimits> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await (supabaseAdmin as any)
      .from("otp_limits")
      .select("*")
      .limit(1)
      .maybeSingle();
    if (!data) return DEFAULT_OTP_LIMITS;
    return {
      codeLength: data.code_length ?? DEFAULT_OTP_LIMITS.codeLength,
      ttlSeconds: data.ttl_seconds ?? DEFAULT_OTP_LIMITS.ttlSeconds,
      maxAttempts: data.max_attempts ?? DEFAULT_OTP_LIMITS.maxAttempts,
      resendCooldownSeconds:
        data.resend_cooldown_seconds ?? DEFAULT_OTP_LIMITS.resendCooldownSeconds,
      maxPerPhonePerDay: data.max_per_phone_per_day ?? DEFAULT_OTP_LIMITS.maxPerPhonePerDay,
      maxPerIpPerHour: data.max_per_ip_per_hour ?? DEFAULT_OTP_LIMITS.maxPerIpPerHour,
      dailySmsCap: data.daily_sms_cap ?? null,
    };
  } catch {
    return DEFAULT_OTP_LIMITS;
  }
}
