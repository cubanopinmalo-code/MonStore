/**
 * COMERCIO DE CUENTAS — CONFIGURACIÓN ADMINISTRATIVA.
 *
 * El administrador decide qué juegos se pueden vender, qué regiones y
 * plataformas de acceso se aceptan y qué datos privados debe entregar el
 * vendedor. El cliente solo puede publicar con valores autorizados: la base de
 * datos vuelve a comprobarlo en `publish_game_account_v2`.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type MarketplaceFieldType = "texto" | "correo" | "contrasena" | "numero" | "nota";

export interface MarketplaceField {
  key: string;
  label: string;
  type: MarketplaceFieldType;
  required: boolean;
  position: number;
}

export interface MarketplaceGameConfig {
  id: string;
  game_id: string | null;
  name: string;
  regions: string[];
  platforms: string[];
  fields: MarketplaceField[];
  active: boolean;
  position: number;
}

const FIELD_TYPES: MarketplaceFieldType[] = ["texto", "correo", "contrasena", "numero", "nota"];

function shapeFields(value: unknown): MarketplaceField[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .map((item, index) => ({
      key: String(item["key"] ?? `campo_${index + 1}`),
      label: String(item["label"] ?? ""),
      type: FIELD_TYPES.includes(item["type"] as MarketplaceFieldType)
        ? (item["type"] as MarketplaceFieldType)
        : "texto",
      required: item["required"] === undefined ? true : Boolean(item["required"]),
      position: Number(item["position"] ?? index + 1),
    }))
    .sort((a, b) => a.position - b.position);
}

function shape(row: Record<string, unknown>): MarketplaceGameConfig {
  return {
    id: String(row["id"]),
    game_id: (row["game_id"] as string | null) ?? null,
    name: String(row["name"] ?? ""),
    regions: Array.isArray(row["regions"]) ? (row["regions"] as string[]).map(String) : [],
    platforms: Array.isArray(row["platforms"]) ? (row["platforms"] as string[]).map(String) : [],
    fields: shapeFields(row["fields"]),
    active: Boolean(row["active"]),
    position: Number(row["position"] ?? 0),
  };
}

const COLUMNS = "id, game_id, name, regions, platforms, fields, active, position";

/** Juegos que el cliente puede publicar ahora mismo (solo los activos). */
export const listPublishableGames = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MarketplaceGameConfig[]> => {
    const { data, error } = await context.supabase
      .from("marketplace_game_configs")
      .select(COLUMNS)
      .eq("active", true)
      .order("position", { ascending: true });
    if (error) throw new Error("No se pudieron cargar los juegos disponibles.");
    return (data ?? []).map((row) => shape(row as unknown as Record<string, unknown>));
  });

/** Todos los juegos configurados, activos o no (vista del administrador). */
export const listMarketplaceGameConfigs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MarketplaceGameConfig[]> => {
    const { data, error } = await context.supabase
      .from("marketplace_game_configs")
      .select(COLUMNS)
      .order("position", { ascending: true });
    if (error) throw new Error("No se pudo cargar la configuración del comercio.");
    return (data ?? []).map((row) => shape(row as unknown as Record<string, unknown>));
  });

export interface MarketplaceGameDraft {
  id?: string | null;
  name: string;
  game_id?: string | null;
  regions: string[];
  platforms: string[];
  fields: { key?: string; label: string; type?: string; required?: boolean }[];
  active?: boolean;
  position?: number;
}

/** Crea o edita un juego del comercio. La base de datos valida y audita. */
export const saveMarketplaceGameConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: MarketplaceGameDraft) => {
    const name = String(data?.name ?? "").trim();
    if (name.length < 2) throw new Error("Escribe el nombre del juego.");
    const clean = (list: unknown): string[] =>
      Array.isArray(list)
        ? Array.from(new Set(list.map((item) => String(item).trim()).filter((item) => item.length > 0)))
        : [];
    const regions = clean(data?.regions);
    const platforms = clean(data?.platforms);
    if (regions.length === 0) throw new Error("Añade al menos una región.");
    if (platforms.length === 0) throw new Error("Añade al menos una plataforma de acceso.");
    const fields = (Array.isArray(data?.fields) ? data.fields : [])
      .map((field, index) => ({
        key:
          String(field?.key ?? "")
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9_]/g, "_") || `campo_${index + 1}`,
        label: String(field?.label ?? "").trim().slice(0, 60),
        type: FIELD_TYPES.includes(field?.type as MarketplaceFieldType) ? String(field?.type) : "texto",
        required: field?.required === undefined ? true : Boolean(field.required),
        position: index + 1,
      }))
      .filter((field) => field.label.length > 0);
    if (fields.length === 0) throw new Error("Configura al menos un campo de datos de la cuenta.");
    return {
      id: data?.id ? String(data.id) : null,
      name: name.slice(0, 80),
      game_id: data?.game_id ? String(data.game_id) : null,
      regions,
      platforms,
      fields,
      active: data?.active === undefined ? true : Boolean(data.active),
      position: Number(data?.position ?? 0),
    };
  })
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("admin_save_marketplace_game", {
      p_config: data.id as unknown as string,
      p_name: data.name,
      p_game: data.game_id as unknown as string,
      p_regions: data.regions,
      p_platforms: data.platforms,
      p_fields: data.fields,
      p_active: data.active,
      p_position: data.position,
    });
    if (error) throw new Error(error.message);
    return (result ?? {}) as { config_id?: string };
  });

/** Activa o desactiva un juego del comercio sin borrar publicaciones. */
export const setMarketplaceGameActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; active: boolean }) => {
    const id = String(data?.id ?? "");
    if (id.length === 0) throw new Error("No se indicó el juego.");
    return { id, active: Boolean(data?.active) };
  })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("admin_set_marketplace_game_active", {
      p_config: data.id,
      p_active: data.active,
    });
    if (error) throw new Error(error.message);
    return { active: data.active };
  });

export interface PublishListingInput {
  configId: string;
  price: number;
  region: string;
  platform: string;
  images: string[];
  days: number;
  values: Record<string, string>;
}

/** El vendedor publica una cuenta con los datos autorizados por el administrador. */
export const publishListing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: PublishListingInput) => {
    const configId = String(data?.configId ?? "");
    if (configId.length === 0) throw new Error("Elige el juego.");
    const price = Number(data?.price ?? 0);
    if (!Number.isFinite(price) || price <= 0) throw new Error("Escribe un precio válido.");
    const days = Number(data?.days ?? 0);
    if (![1, 2, 3, 4, 5].includes(days)) throw new Error("Elige la duración de la publicación.");
    const images = (Array.isArray(data?.images) ? data.images : []).map(String).filter(Boolean);
    if (images.length === 0) throw new Error("Sube al menos 1 foto de la cuenta.");
    const values: Record<string, string> = {};
    for (const [key, value] of Object.entries(data?.values ?? {})) {
      values[String(key)] = String(value ?? "").trim().slice(0, 500);
    }
    return {
      configId,
      price: Math.round(price * 100) / 100,
      region: String(data?.region ?? "").trim(),
      platform: String(data?.platform ?? "").trim(),
      images,
      days,
      values,
    };
  })
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("publish_game_account_v2", {
      p_config: data.configId,
      p_price: data.price,
      p_region: data.region,
      p_platform: data.platform,
      p_images: data.images,
      p_days: data.days,
      p_values: data.values,
    });
    if (error) throw new Error(error.message);
    return (result ?? {}) as { listing_id?: string; total?: number; balance?: number };
  });
