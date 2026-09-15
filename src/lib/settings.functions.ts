/**
 * FASE — CONFIGURACIÓN GLOBAL.
 *
 * Única puerta de entrada a los parámetros administrativos de MonStore. Los
 * valores viven en la fila única de `public.platform_settings`; no se duplican
 * en el código. Toda escritura pasa por `admin_update_platform_settings`, que
 * valida rangos, comprueba el rol real en la base de datos y deja auditoría.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface PlatformSettings {
  /** Valor base de 1 USDT en CUP. */
  usd_to_cup: number;
  /** Ganancia en CUP por cada USDT vendido. */
  usd_margin_cup: number;
  /** CUP acreditados por cada peso de saldo móvil. */
  saldo_conversion_rate: number;
  /** Comisión de retiro (%) usada por las nuevas solicitudes. */
  withdrawal_fee_pct: number;
  listing_fee_per_day: number;
  listing_fee_days: Record<string, number>;
  min_deposit_cup: number;
  min_withdrawal_cup: number;
  referral_reward_cup: number;
  maintenance_mode: boolean;
  registration_open: boolean;
  marketplace_enabled: boolean;
  allow_line_reuse: boolean;
  support_whatsapp: string;
  updated_at: string | null;
}

function shape(row: Record<string, unknown> | null): PlatformSettings {
  const rawDays = (row?.["listing_fee_days"] ?? {}) as Record<string, unknown>;
  const listing_fee_days: Record<string, number> = {};
  for (const day of [1, 2, 3, 4, 5]) {
    const value = Number(rawDays[String(day)]);
    if (Number.isFinite(value) && value >= 0) listing_fee_days[String(day)] = value;
  }
  return {
    usd_to_cup: Number(row?.["usd_to_cup"] ?? 0),
    usd_margin_cup: Number(row?.["usd_margin_cup"] ?? 0),
    saldo_conversion_rate: Number(row?.["saldo_conversion_rate"] ?? 0),
    withdrawal_fee_pct: Number(row?.["withdrawal_fee_pct"] ?? 0),
    listing_fee_per_day: Number(row?.["listing_fee_per_day"] ?? 0),
    listing_fee_days,
    min_deposit_cup: Number(row?.["min_deposit_cup"] ?? 0),
    min_withdrawal_cup: Number(row?.["min_withdrawal_cup"] ?? 0),
    referral_reward_cup: Number(row?.["referral_reward_cup"] ?? 0),
    maintenance_mode: Boolean(row?.["maintenance_mode"]),
    registration_open: row?.["registration_open"] === undefined ? true : Boolean(row["registration_open"]),
    marketplace_enabled:
      row?.["marketplace_enabled"] === undefined ? true : Boolean(row["marketplace_enabled"]),
    allow_line_reuse: Boolean(row?.["allow_line_reuse"]),
    support_whatsapp: String(row?.["support_whatsapp"] ?? ""),
    updated_at: (row?.["updated_at"] as string | undefined) ?? null,
  };
}

const COLUMNS =
  "usd_to_cup, usd_margin_cup, saldo_conversion_rate, withdrawal_fee_pct, listing_fee_per_day, listing_fee_days, min_deposit_cup, min_withdrawal_cup, referral_reward_cup, maintenance_mode, registration_open, marketplace_enabled, allow_line_reuse, support_whatsapp, updated_at";

/** Lectura de los parámetros vigentes (sin secretos). */
export const getPlatformSettings = createServerFn({ method: "GET" }).handler(
  async (): Promise<PlatformSettings> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.from("platform_settings").select(COLUMNS).maybeSingle();
    return shape((data ?? null) as Record<string, unknown> | null);
  },
);

export interface PlatformSettingsPatch {
  usd_to_cup?: number;
  usd_margin_cup?: number;
  saldo_conversion_rate?: number;
  withdrawal_fee_pct?: number;
  listing_fee_per_day?: number;
  listing_fee_days?: Record<string, number>;
  min_deposit_cup?: number;
  min_withdrawal_cup?: number;
  referral_reward_cup?: number;
  maintenance_mode?: boolean;
  registration_open?: boolean;
  marketplace_enabled?: boolean;
  allow_line_reuse?: boolean;
  support_whatsapp?: string;
}

const NUMERIC_KEYS = [
  "usd_to_cup",
  "usd_margin_cup",
  "saldo_conversion_rate",
  "withdrawal_fee_pct",
  "listing_fee_per_day",
  "min_deposit_cup",
  "min_withdrawal_cup",
  "referral_reward_cup",
] as const;

const BOOLEAN_KEYS = [
  "maintenance_mode",
  "registration_open",
  "marketplace_enabled",
  "allow_line_reuse",
] as const;

/** El administrador guarda uno o varios parámetros. Valida en servidor y audita. */
export const savePlatformSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: PlatformSettingsPatch) => {
    const payload: Record<string, unknown> = {};
    for (const key of NUMERIC_KEYS) {
      const value = data?.[key];
      if (value === undefined) continue;
      const numeric = Number(value);
      if (!Number.isFinite(numeric) || numeric < 0) {
        throw new Error("Los valores no pueden quedar vacíos ni ser negativos.");
      }
      if (key === "withdrawal_fee_pct" && numeric > 100) {
        throw new Error("La comisión de retiro debe estar entre 0 y 100.");
      }
      payload[key] = Math.round(numeric * 100) / 100;
    }
    for (const key of BOOLEAN_KEYS) {
      if (data?.[key] !== undefined) payload[key] = Boolean(data[key]);
    }
    if (data?.listing_fee_days !== undefined) {
      const byDays: Record<string, number> = {};
      for (const day of [1, 2, 3, 4, 5]) {
        const value = Number(data.listing_fee_days?.[String(day)]);
        if (Number.isFinite(value) && value >= 0) byDays[String(day)] = Math.round(value * 100) / 100;
      }
      payload["listing_fee_days"] = byDays;
    }
    if (data?.support_whatsapp !== undefined) {
      payload["support_whatsapp"] = String(data.support_whatsapp).replace(/\D/g, "").slice(0, 15);
    }
    if (Object.keys(payload).length === 0) throw new Error("No hay cambios que guardar.");
    return payload as PlatformSettingsPatch;
  })
  .handler(async ({ data, context }): Promise<PlatformSettings> => {
    const { data: result, error } = await context.supabase.rpc(
      "admin_update_platform_settings" as never,
      { p_payload: data } as never,
    );
    if (error) throw new Error(error.message || "No se pudo guardar la configuración.");
    return shape((result ?? null) as Record<string, unknown> | null);
  });

/* ------------------------------------------------------------------ *
 * Bloqueo de usuarios por teléfono
 * ------------------------------------------------------------------ */

export interface FoundUser {
  id: string;
  name: string;
  phone: string;
  province: string;
  municipality: string;
  status: string;
  balance: number;
  created_at: string;
}

export const findUserByPhone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { phone: string }) => {
    const phone = String(data?.phone ?? "").replace(/\D/g, "");
    if (phone.length < 8) throw new Error("Escribe el número completo (8 dígitos).");
    return { phone };
  })
  .handler(async ({ data, context }): Promise<{ found: boolean; user?: FoundUser }> => {
    const { data: result, error } = await context.supabase.rpc(
      "admin_find_user_by_phone" as never,
      { p_phone: data.phone } as never,
    );
    if (error) throw new Error(error.message || "No se pudo buscar el usuario.");
    const payload = (result ?? {}) as { found?: boolean; user?: Record<string, unknown> };
    if (!payload.found || !payload.user) return { found: false };
    const row = payload.user;
    return {
      found: true,
      user: {
        id: String(row["id"]),
        name: String(row["name"] ?? ""),
        phone: String(row["phone"] ?? ""),
        province: String(row["province"] ?? ""),
        municipality: String(row["municipality"] ?? ""),
        status: String(row["status"] ?? "activo"),
        balance: Number(row["balance"] ?? 0),
        created_at: String(row["created_at"] ?? ""),
      },
    };
  });

export const setUserBlock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { userId: string; blocked: boolean; reason?: string }) => {
    const userId = String(data?.userId ?? "");
    if (!userId) throw new Error("Falta el usuario.");
    return {
      userId,
      blocked: Boolean(data.blocked),
      reason: String(data?.reason ?? "").slice(0, 300),
    };
  })
  .handler(async ({ data, context }): Promise<{ status: string }> => {
    const { data: result, error } = await context.supabase.rpc(
      "admin_set_user_block" as never,
      { p_user: data.userId, p_blocked: data.blocked, p_reason: data.reason } as never,
    );
    if (error) throw new Error(error.message || "No se pudo cambiar el estado de la cuenta.");
    return { status: String((result as { status?: string } | null)?.status ?? "activo") };
  });

/* ------------------------------------------------------------------ *
 * Notificaciones masivas
 * ------------------------------------------------------------------ */

export interface CampaignEvent {
  id: string;
  name: string;
}

export const listCampaignEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CampaignEvent[]> => {
    const { data } = await context.supabase
      .from("events")
      .select("id, name, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    return (data ?? []).map((row) => ({ id: String(row.id), name: String(row.name) }));
  });

export const countCampaignAudience = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { audience: "todos" | "evento"; eventId?: string | null }) => ({
    audience: data?.audience === "evento" ? ("evento" as const) : ("todos" as const),
    eventId: data?.eventId ? String(data.eventId) : null,
  }))
  .handler(async ({ data, context }): Promise<{ count: number }> => {
    const { data: result, error } = await context.supabase.rpc(
      "admin_campaign_audience_count" as never,
      { p_audience: data.audience, p_event: data.eventId } as never,
    );
    if (error) throw new Error(error.message || "No se pudo contar los destinatarios.");
    return { count: Number(result ?? 0) };
  });

export const sendCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      title: string;
      message: string;
      audience: "todos" | "evento";
      eventId?: string | null;
      idempotency: string;
    }) => {
      const title = String(data?.title ?? "").trim();
      const message = String(data?.message ?? "").trim();
      if (title.length < 3) throw new Error("Escribe un título.");
      if (message.length < 3) throw new Error("Escribe el mensaje.");
      const audience = data?.audience === "evento" ? ("evento" as const) : ("todos" as const);
      const eventId = data?.eventId ? String(data.eventId) : null;
      if (audience === "evento" && !eventId) throw new Error("Elige el evento.");
      const idempotency = String(data?.idempotency ?? "").slice(0, 60);
      if (!idempotency) throw new Error("Falta la clave de envío.");
      return { title: title.slice(0, 120), message: message.slice(0, 600), audience, eventId, idempotency };
    },
  )
  .handler(
    async ({ data, context }): Promise<{ recipients: number; duplicated: boolean }> => {
      const { data: result, error } = await context.supabase.rpc(
        "admin_send_campaign" as never,
        {
          p_title: data.title,
          p_message: data.message,
          p_audience: data.audience,
          p_event: data.eventId,
          p_idempotency: data.idempotency,
        } as never,
      );
      if (error) throw new Error(error.message || "No se pudo enviar la notificación.");
      const payload = (result ?? {}) as { recipients?: number; duplicated?: boolean };
      return {
        recipients: Number(payload.recipients ?? 0),
        duplicated: Boolean(payload.duplicated),
      };
    },
  );
