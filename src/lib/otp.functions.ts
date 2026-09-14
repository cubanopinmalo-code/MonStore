/**
 * FASE 2.15 — Acceso de MonStore: teléfono + código de un solo uso.
 *
 * Único método de autenticación. No hay contraseña, ni acceso por nombre, ni
 * acceso por correo, ni recuperación por correo, ni sesión paralela.
 *
 * El código nunca se devuelve al navegador, nunca se registra en logs y nunca
 * se guarda en claro: solo se guarda su huella (SHA-256 con pimienta de
 * servidor, MONSTORE_OTP_PEPPER).
 *
 * Sesión: tras validar el código, el servidor pide a Supabase Auth (Admin API)
 * un enlace de un solo uso (`generateLink` tipo magiclink) y devuelve al
 * navegador únicamente su `hashed_token`. El navegador lo canjea con
 * `supabase.auth.verifyOtp({ token_hash, type: 'email' })`, lo que produce una
 * sesión NORMAL de Supabase Auth (access + refresh token, auto-refresh).
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import {
  e164Phone,
  isValidCubanMobile,
  nationalPhone,
  phoneToEmailCanonical,
} from "./phone";

// Los límites viven en `public.otp_limits` (solo servidor, ajustables sin
// tocar código). Ver src/lib/otp-config.server.ts.

const OTP_TABLE = "otp_challenges";

interface Challenge {
  id: string;
  phone_e164: string;
  code_hash: string;
  attempts: number;
  max_attempts: number;
  consumed_at: string | null;
  expires_at: string;
  created_at: string;
}

/** Cliente administrativo con una vista mínima de la tabla de desafíos. */
type ChallengeClient = {
  from: (table: string) => any;
};

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function pepper(): string {
  return process.env["MONSTORE_OTP_PEPPER"] ?? process.env["OTP_PEPPER"] ?? "monstore-otp-sin-pimienta";
}

function clientIp(): string {
  const request = getRequest();
  const forwarded = request?.headers?.get("x-forwarded-for") ?? "";
  return forwarded.split(",")[0]?.trim() || "desconocida";
}

export const requestOtp = createServerFn({ method: "POST" })
  .inputValidator((input: { phone: string }) => ({ phone: String(input.phone ?? "") }))
  .handler(async ({ data }) => {
    if (!isValidCubanMobile(data.phone)) {
      return { ok: false as const, reason: "telefono_invalido" };
    }

    const phone = e164Phone(data.phone);
    const ip = clientIp();
    const { getOtpLimits } = await import("./otp-config.server");
    const { logSmsUsage, smsSentLast24h, logAuthEvent } = await import("./otp-usage.server");
    const limits = await getOtpLimits();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as ChallengeClient;
    const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
    const dayAgo = new Date(Date.now() - 86_400_000).toISOString();

    const { data: recent } = await db
      .from(OTP_TABLE)
      .select("id, created_at")
      .eq("phone_e164", phone)
      .gte("created_at", dayAgo)
      .order("created_at", { ascending: false });

    const list = (recent ?? []) as Array<{ created_at: string }>;
    if (list.length >= limits.maxPerPhonePerDay) {
      await logSmsUsage({ phoneE164: phone, ip, outcome: "bloqueado", errorCode: "limite_telefono" });
      await logAuthEvent({ action: "otp_bloqueado", phoneE164: phone, reason: "limite_telefono" });
      return { ok: false as const, reason: "limite_telefono" };
    }
    const last = list[0];
    if (last) {
      const elapsed = (Date.now() - new Date(last.created_at).getTime()) / 1000;
      if (elapsed < limits.resendCooldownSeconds) {
        return {
          ok: false as const,
          reason: "espera",
          retryInSeconds: Math.ceil(limits.resendCooldownSeconds - elapsed),
        };
      }
    }

    const { count: ipCount } = await db
      .from(OTP_TABLE)
      .select("id", { count: "exact", head: true })
      .eq("request_ip", ip)
      .gte("created_at", hourAgo);
    if ((ipCount ?? 0) >= limits.maxPerIpPerHour) {
      await logSmsUsage({ phoneE164: phone, ip, outcome: "bloqueado", errorCode: "limite_origen" });
      await logAuthEvent({ action: "otp_bloqueado", phoneE164: phone, reason: "limite_origen" });
      return { ok: false as const, reason: "limite_origen" };
    }

    if (limits.dailySmsCap != null && (await smsSentLast24h()) >= limits.dailySmsCap) {
      await logSmsUsage({ phoneE164: phone, ip, outcome: "bloqueado", errorCode: "tope_diario" });
      return { ok: false as const, reason: "tope_diario" };
    }

    // Código con generador criptográfico, de la longitud configurada.
    const span = 10 ** limits.codeLength;
    const code = String(crypto.getRandomValues(new Uint32Array(1))[0]! % span).padStart(
      limits.codeLength,
      "0",
    );
    const codeHash = await sha256Hex(`${phone}:${code}:${pepper()}`);

    // Invalidamos los desafíos anteriores: solo el último código es válido.
    await db
      .from(OTP_TABLE)
      .update({ consumed_at: new Date().toISOString() })
      .eq("phone_e164", phone)
      .is("consumed_at", null);

    const minutes = Math.round(limits.ttlSeconds / 60);
    const { sendSms } = await import("./zdsms.server");
    const sms = await sendSms(phone, `MONSTORE: tu codigo es ${code}. Caduca en ${minutes} minutos.`);

    await db.from(OTP_TABLE).insert({
      phone_e164: phone,
      code_hash: codeHash,
      max_attempts: limits.maxAttempts,
      expires_at: new Date(Date.now() + limits.ttlSeconds * 1000).toISOString(),
      request_ip: ip,
      provider_message_id: sms.messageId,
    });

    await logSmsUsage({
      phoneE164: phone,
      ip,
      outcome: sms.ok ? (sms.mode === "mock" ? "simulado" : "enviado") : "fallido",
      providerMode: sms.mode,
      providerMessageId: sms.messageId,
      errorCode: sms.error ?? null,
    });
    await logAuthEvent({
      action: "otp_solicitado",
      phoneE164: phone,
      reason: sms.ok ? sms.mode : (sms.error ?? "envio_fallido"),
    });

    if (!sms.ok) {
      // Nunca se expone el detalle técnico del proveedor al navegador.
      const reason =
        sms.error === "sin_saldo"
          ? "proveedor_sin_saldo"
          : sms.error === "numero_rechazado"
            ? "numero_rechazado"
            : sms.error === "rate_limit_proveedor"
              ? "limite_origen"
              : "sms_no_enviado";
      return { ok: false as const, reason };
    }

    // Respuesta idéntica exista o no la cuenta: no permite enumerar usuarios.
    return { ok: true as const, mode: sms.mode, expiresInSeconds: limits.ttlSeconds };
  });


export const verifyOtp = createServerFn({ method: "POST" })
  .inputValidator((input: { phone: string; code: string; referralCode?: string }) => ({
    phone: String(input.phone ?? ""),
    code: String(input.code ?? ""),
    referralCode: String(input.referralCode ?? "").slice(0, 32),
  }))
  .handler(async ({ data }) => {
    if (!isValidCubanMobile(data.phone) || !/^\d{4,8}$/.test(data.code)) {
      return { ok: false as const, reason: "datos_invalidos" };
    }

    const phone = e164Phone(data.phone);
    const { logAuthEvent } = await import("./otp-usage.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as ChallengeClient;

    const { data: rows } = await db
      .from(OTP_TABLE)
      .select("*")
      .eq("phone_e164", phone)
      .is("consumed_at", null)
      .order("created_at", { ascending: false })
      .limit(1);

    const challenge = ((rows ?? [])[0] ?? null) as Challenge | null;
    if (!challenge) {
      await logAuthEvent({ action: "otp_rechazado", phoneE164: phone, reason: "sin_codigo" });
      return { ok: false as const, reason: "sin_codigo" };
    }
    if (new Date(challenge.expires_at).getTime() < Date.now()) {
      await logAuthEvent({ action: "otp_rechazado", phoneE164: phone, reason: "caducado" });
      return { ok: false as const, reason: "caducado" };
    }
    if (challenge.attempts >= challenge.max_attempts) {
      await logAuthEvent({ action: "otp_bloqueado", phoneE164: phone, reason: "intentos" });
      return { ok: false as const, reason: "bloqueado" };
    }

    const candidate = await sha256Hex(`${phone}:${data.code}:${pepper()}`);
    if (candidate !== challenge.code_hash) {
      const attempts = challenge.attempts + 1;
      const patch: Record<string, unknown> = { attempts };
      if (attempts >= challenge.max_attempts) patch['consumed_at'] = new Date().toISOString();
      await db.from(OTP_TABLE).update(patch).eq("id", challenge.id);
      await logAuthEvent({
        action: attempts >= challenge.max_attempts ? "otp_bloqueado" : "otp_rechazado",
        phoneE164: phone,
        reason: "codigo_incorrecto",
      });
      return {
        ok: false as const,
        reason: attempts >= challenge.max_attempts ? "bloqueado" : "codigo_incorrecto",
        attemptsLeft: Math.max(0, challenge.max_attempts - attempts),
      };
    }

    // Consumo inmediato y condicionado: un código, un uso (protección de repetición).
    const { data: consumed } = await db
      .from(OTP_TABLE)
      .update({ consumed_at: new Date().toISOString(), attempts: challenge.attempts + 1 })
      .eq("id", challenge.id)
      .is("consumed_at", null)
      .select("id");
    if (!consumed || (consumed as unknown[]).length === 0) {
      await logAuthEvent({ action: "otp_rechazado", phoneE164: phone, reason: "reutilizado" });
      return { ok: false as const, reason: "sin_codigo" };
    }

    const email = phoneToEmailCanonical(phone);
    const national = nationalPhone(phone);

    // 1) Identidad Auth: una sola cuenta por teléfono. El UUID existente NUNCA se toca.
    let created = false;
    const { data: createdUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      email_confirm: true,
      phone_confirm: false,
      user_metadata: { phone: national },
    });
    if (!createError) created = true;
    else if (!/already|registered|exists/i.test(createError.message)) {
      await logAuthEvent({ action: "login_fallido", phoneE164: phone, reason: "alta_fallida" });
      return { ok: false as const, reason: "alta_fallida" };
    }

    // 2) Enlace de acceso de un solo uso -> token canjeable por sesión real.
    const { data: link, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    if (linkError || !link?.properties?.hashed_token) {
      await logAuthEvent({ action: "login_fallido", phoneE164: phone, reason: "sesion_no_emitida" });
      return { ok: false as const, reason: "sesion_no_emitida" };
    }

    const userId = createdUser?.user?.id ?? link.user?.id ?? null;

    // 3) Perfil + rol cliente + wallet a 0 CUP, de forma idempotente y sin
    //    ningún movimiento financiero. Repetir la llamada no duplica nada.
    if (userId) {
      const { error: provisionError } = await (supabaseAdmin as any).rpc("provision_user_account", {
        _user_id: userId,
        _phone: national,
        _referral_code: data.referralCode || null,
      });
      if (provisionError) {
        await logAuthEvent({ action: "login_fallido", phoneE164: phone, reason: "alta_incompleta" });
        return { ok: false as const, reason: "alta_fallida" };
      }
    }

    await logAuthEvent({
      action: "login",
      phoneE164: phone,
      userId,
      reason: created ? "cuenta_nueva" : "cuenta_existente",
    });

    return {
      ok: true as const,
      created,
      tokenHash: link.properties.hashed_token,
    };
  });
