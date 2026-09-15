import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

type Ctx = { supabase: SupabaseClient<Database>; userId: string };

export type ListingPrivateData = {
  viewer: "admin" | "comprador" | "vendedor";
  listing_status: string;
  final_email: string;
  final_password: string;
  final_notes: string;
  original_email: string | null;
  original_password: string | null;
  access_notes: string | null;
  totp_active: boolean;
  totp_secret: string | null;
  totp_uri: string | null;
  totp_code: string | null;
  totp_seconds_left: number | null;
  secure_deadline: string | null;
  sold_at: string | null;
  server_now: number;
};

async function requireAdmin({ supabase, userId }: Ctx): Promise<void> {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error) throw new Error("No se pudo verificar tu permiso de administración.");
  if (!data) throw new Error("Solo el administrador puede usar esta función.");
}

/**
 * Datos privados de una cuenta. La autorización la decide el servidor por
 * identidad, rol y propiedad de la publicación (administrador, comprador de esa
 * cuenta, o vendedor de una publicación que salió del comercio sin venta).
 */
export const getListingPrivateData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { listingId: string }) => {
    const listingId = String(data?.listingId ?? "");
    if (!listingId) throw new Error("Falta la publicación.");
    return { listingId };
  })
  .handler(async ({ data, context }): Promise<ListingPrivateData> => {
    const { data: row, error } = await context.supabase.rpc("read_listing_secrets", {
      p_account: data.listingId,
    });
    if (error) throw new Error(error.message || "No pudimos mostrar los datos de la cuenta.");
    const payload = (row ?? {}) as Record<string, unknown>;
    const secret = typeof payload["totp_secret"] === "string" ? payload["totp_secret"] : null;

    const { totpNow, totpUri } = await import("./totp.server");
    const current = secret ? totpNow(secret) : null;

    return {
      viewer: (payload["viewer"] as ListingPrivateData["viewer"]) ?? "admin",
      listing_status: String(payload["listing_status"] ?? ""),
      final_email: String(payload["final_email"] ?? ""),
      final_password: String(payload["final_password"] ?? ""),
      final_notes: String(payload["final_notes"] ?? ""),
      original_email:
        typeof payload["original_email"] === "string" ? payload["original_email"] : null,
      original_password:
        typeof payload["original_password"] === "string" ? payload["original_password"] : null,
      access_notes: typeof payload["access_notes"] === "string" ? payload["access_notes"] : null,
      totp_active: Boolean(payload["totp_active"]),
      totp_secret: secret,
      totp_uri: secret ? totpUri(secret, String(payload["final_email"] ?? "Cuenta del juego")) : null,
      totp_code: current?.code ?? null,
      totp_seconds_left: current?.secondsLeft ?? null,
      secure_deadline:
        typeof payload["secure_deadline"] === "string" ? payload["secure_deadline"] : null,
      sold_at: typeof payload["sold_at"] === "string" ? payload["sold_at"] : null,
      server_now: Date.now(),
    };
  });

/** El administrador genera o renueva la clave del doble factor de la cuenta del juego. */
export const rotateListingTotp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { listingId: string; secret?: string; active?: boolean }) => {
    const listingId = String(data?.listingId ?? "");
    if (!listingId) throw new Error("Falta la publicación.");
    return {
      listingId,
      secret: typeof data?.secret === "string" ? data.secret : "",
      active: data?.active !== false,
    };
  })
  .handler(async ({ data, context }): Promise<{ secret: string; uri: string; active: boolean }> => {
    await requireAdmin(context);
    const { generateTotpSecret, normalizeSecret, totpNow, totpUri } = await import("./totp.server");
    const secret = data.secret ? normalizeSecret(data.secret) : generateTotpSecret();
    if (!totpNow(secret)) throw new Error("Esa clave de doble factor no es válida.");

    const { error } = await context.supabase.rpc("admin_set_listing_totp", {
      p_listing: data.listingId,
      p_secret: secret,
      p_active: data.active,
    });
    if (error) throw new Error(error.message || "No pudimos guardar el doble factor.");
    return { secret, uri: totpUri(secret, "Cuenta del juego"), active: data.active };
  });

/** El administrador desactiva el doble factor de la cuenta del juego. */
export const disableListingTotp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { listingId: string }) => {
    const listingId = String(data?.listingId ?? "");
    if (!listingId) throw new Error("Falta la publicación.");
    return { listingId };
  })
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await requireAdmin(context);
    const { error } = await context.supabase.rpc("admin_set_listing_totp", {
      p_listing: data.listingId,
      p_secret: "",
      p_active: false,
    });
    if (error) throw new Error(error.message || "No pudimos desactivar el doble factor.");
    return { ok: true };
  });

export type ListingFees = { perDay: number; byDays: Record<string, number> };

export const getListingFees = createServerFn({ method: "GET" }).handler(
  async (): Promise<ListingFees> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("platform_settings")
      .select("listing_fee_per_day, listing_fee_days")
      .maybeSingle();
    const raw = (data?.listing_fee_days ?? {}) as Record<string, unknown>;
    const byDays: Record<string, number> = {};
    for (const day of [1, 2, 3, 4, 5]) {
      const value = Number(raw[String(day)]);
      if (Number.isFinite(value) && value >= 0) byDays[String(day)] = value;
    }
    return { perDay: Number(data?.listing_fee_per_day ?? 150), byDays };
  },
);

export const setListingFees = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { perDay: number; byDays: Record<string, number> }) => {
    const perDay = Number(data?.perDay);
    if (!Number.isFinite(perDay) || perDay < 0) throw new Error("El precio por día no es válido.");
    const byDays: Record<string, number> = {};
    for (const day of [1, 2, 3, 4, 5]) {
      const value = Number(data?.byDays?.[String(day)]);
      if (Number.isFinite(value) && value >= 0) byDays[String(day)] = Math.round(value * 100) / 100;
    }
    return { perDay: Math.round(perDay * 100) / 100, byDays };
  })
  .handler(async ({ data, context }): Promise<ListingFees> => {
    await requireAdmin(context);
    const { error } = await context.supabase
      .from("platform_settings")
      .upsert({ id: true, listing_fee_per_day: data.perDay, listing_fee_days: data.byDays });
    if (error) throw new Error("No se pudieron guardar las comisiones de publicación.");
    return data;
  });
