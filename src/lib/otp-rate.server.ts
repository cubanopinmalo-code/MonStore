/**
 * Política de SOLICITUDES de código SMS. SOLO SERVIDOR.
 *
 * - Administradores (rol real en public.user_roles): sin límite de solicitudes
 *   diarias. Mantienen intervalo de reenvío, límite por origen y tope global.
 * - Clientes: máximo `max_per_phone_per_day` solicitudes (3). Al consumir la
 *   última queda bloqueado `block_seconds` (8 h) desde esa solicitud.
 *
 * El estado vive en `public.otp_phone_state` (solo servidor, sin permisos para
 * el navegador). Nada depende del dispositivo del cliente.
 *
 * NO toca la generación, el hash, la caducidad ni la validación del código:
 * esos controles son independientes de esta política de solicitudes.
 */
import { nationalPhone } from "./phone";

const STATE_TABLE = "otp_phone_state";

interface PhoneState {
  phone_e164: string;
  request_count: number;
  window_started_at: string;
  blocked_until: string | null;
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

/**
 * ¿El teléfono pertenece a una cuenta con rol administrativo?
 * Se resuelve SIEMPRE por identidad (UUID) + rol en la base de datos.
 * El teléfono solo sirve para localizar la cuenta, nunca para autorizar.
 */
export async function isAdminPhone(phoneE164: string): Promise<boolean> {
  try {
    const db = await admin();
    const { data: profile } = await db
      .from("profiles")
      .select("id")
      .eq("phone", nationalPhone(phoneE164))
      .maybeSingle();
    const userId = (profile as { id?: string } | null)?.id;
    if (!userId) return false;
    const { data: roles } = await db
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const list = ((roles ?? []) as Array<{ role: string }>).map((r) => r.role);
    return list.some((role) => ADMIN_ROLES.has(role));
  } catch {
    return false;
  }
}

/** Roles considerados administrativos. Ampliable sin tocar la lógica. */
const ADMIN_ROLES = new Set(["admin", "superadmin", "owner", "staff"]);

/**
 * ¿La cuenta de ese teléfono está bloqueada por un administrador?
 * El estado permanente vive en `public.profiles.status` y solo lo cambia la
 * función administrativa `admin_set_user_block`.
 */
export async function isBlockedPhone(phoneE164: string): Promise<boolean> {
  try {
    const db = await admin();
    const { data } = await db
      .from("profiles")
      .select("status")
      .eq("phone", nationalPhone(phoneE164))
      .maybeSingle();
    const status = (data as { status?: string } | null)?.status;
    return Boolean(status) && status !== "activo";
  } catch {
    return false;
  }
}

async function readState(phoneE164: string): Promise<PhoneState | null> {
  const db = await admin();
  const { data } = await db
    .from(STATE_TABLE)
    .select("*")
    .eq("phone_e164", phoneE164)
    .maybeSingle();
  return (data ?? null) as PhoneState | null;
}

export interface QuotaCheck {
  allowed: boolean;
  reason?: "limite_telefono";
  /** Instante (ISO) en el que se podrá volver a solicitar un código. */
  blockedUntil?: string | null;
}

/**
 * Comprobación previa al envío. Solo lee: no consume cuota.
 */
export async function checkPhoneQuota(
  phoneE164: string,
  maxRequests: number,
  isAdmin: boolean,
): Promise<QuotaCheck> {
  if (isAdmin) return { allowed: true };
  try {
    const state = await readState(phoneE164);
    if (!state) return { allowed: true };
    const now = Date.now();
    const blockedUntil = state.blocked_until ? new Date(state.blocked_until).getTime() : 0;
    if (blockedUntil > now) {
      return { allowed: false, reason: "limite_telefono", blockedUntil: state.blocked_until };
    }
    // Bloqueo vencido: la ventana se reinicia en el próximo consumo.
    if (blockedUntil && blockedUntil <= now) return { allowed: true };
    if (state.request_count >= maxRequests) {
      return { allowed: false, reason: "limite_telefono", blockedUntil: state.blocked_until };
    }
    return { allowed: true };
  } catch {
    return { allowed: true };
  }
}

/**
 * Registra una solicitud REALMENTE enviada. Devuelve el bloqueo resultante,
 * que se activa en cuanto se consume la última solicitud permitida.
 */
export async function consumePhoneQuota(
  phoneE164: string,
  maxRequests: number,
  blockSeconds: number,
  isAdmin: boolean,
): Promise<{ blockedUntil: string | null; remaining: number }> {
  if (isAdmin) return { blockedUntil: null, remaining: Number.POSITIVE_INFINITY };
  try {
    const db = await admin();
    const state = await readState(phoneE164);
    const now = Date.now();
    const expired = state?.blocked_until ? new Date(state.blocked_until).getTime() <= now : false;
    const count = (!state || expired ? 0 : state.request_count) + 1;
    const blockedUntil =
      count >= maxRequests ? new Date(now + blockSeconds * 1000).toISOString() : null;

    await db.from(STATE_TABLE).upsert(
      {
        phone_e164: phoneE164,
        request_count: count,
        window_started_at: !state || expired ? new Date(now).toISOString() : state.window_started_at,
        blocked_until: blockedUntil,
      },
      { onConflict: "phone_e164" },
    );

    return { blockedUntil, remaining: Math.max(0, maxRequests - count) };
  } catch {
    return { blockedUntil: null, remaining: 0 };
  }
}
