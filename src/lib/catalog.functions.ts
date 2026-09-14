import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { coverFor, publishableClient, signCatalogImages, CATALOG_BUCKET } from "./supabase.server";
import { translateOfferName } from "./offerName";
import {
  ProviderError,
  gameCatalogue,
  gameFields,
  checkPlayerId,
  listCategories,
  listProviderProducts,
  listTopUpGames,
  providerBalance,
  providerHasKey,
} from "./g2bulk.server";

type GameRow = Database["public"]["Tables"]["games"]["Row"];
type ProductRow = Database["public"]["Tables"]["products"]["Row"];
type AdminContext = { supabase: SupabaseClient<Database>; userId: string };

export type CatalogGame = GameRow & { cover: string; offers: number };
export type CatalogProduct = ProductRow & { image: string };

export type ProviderStatus = {
  hasKey: boolean;
  balance: number | null;
  error: string | null;
};

/** Columnas de ofertas visibles para el cliente: nunca incluyen el costo del proveedor. */
const PRODUCT_PUBLIC_COLUMNS =
  "id, game_id, g2bulk_product_id, name, description, image_url, sale_price, currency, delivery_method, active, available, metadata, last_synced_at, created_at, updated_at";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_IMAGE_BYTES = 4_000_000;
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const CHUNK = 200;

function messageFrom(error: unknown, fallback: string): string {
  if (error instanceof ProviderError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

async function requireAdmin({ supabase, userId }: AdminContext): Promise<void> {
  const { data, error } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (error) throw new Error("No se pudo verificar tu permiso de administración.");
  if (!data) throw new Error("Solo el administrador puede usar esta función.");
}

function slugify(value: string, used: Set<string>): string {
  const base =
    value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "juego";
  let slug = base;
  let suffix = 2;
  while (used.has(slug)) slug = `${base}-${suffix++}`;
  used.add(slug);
  return slug;
}

export const DEFAULT_USD_RATE = 1000;
export const DEFAULT_USD_MARGIN = 150;

export type Pricing = { rate: number; margin: number };

/**
 * Precio inicial sugerido en CUP: costo USD × (base del dólar + ganancia por dólar).
 *
 * Solo se usa al dar de alta una oferta nueva o cuando el administrador pide
 * expresamente recalcular. La sincronización con el proveedor NUNCA lo aplica
 * sobre ofertas que ya existen: el precio de venta es un dato comercial de
 * MONSTORE y el costo del proveedor es un dato técnico.
 */
export function priceFromCost(costUsd: number, pricing: Pricing): number {
  const cost = Number(costUsd ?? 0);
  return Math.round(cost * (pricing.rate + pricing.margin) * 100) / 100;
}

async function readPricing(client: SupabaseClient<Database>): Promise<Pricing> {
  const { data } = await client
    .from("platform_settings")
    .select("usd_to_cup,usd_margin_cup")
    .maybeSingle();
  const rate = Number(data?.usd_to_cup ?? DEFAULT_USD_RATE);
  const margin = Number(data?.usd_margin_cup ?? DEFAULT_USD_MARGIN);
  return {
    rate: Number.isFinite(rate) && rate > 0 ? rate : DEFAULT_USD_RATE,
    margin: Number.isFinite(margin) && margin >= 0 ? margin : DEFAULT_USD_MARGIN,
  };
}

export const getUsdRate = createServerFn({ method: "GET" }).handler(async (): Promise<Pricing> => {
  return readPricing(publishableClient());
});

export const DEFAULT_SALDO_RATE = 2.8;

/** Base de conversión: cada peso de saldo móvil equivale a este valor en CUP de wallet. */
export const getSaldoRate = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ rate: number }> => {
    const { data } = await publishableClient()
      .from("platform_settings")
      .select("saldo_conversion_rate")
      .maybeSingle();
    const rate = Number(data?.saldo_conversion_rate ?? DEFAULT_SALDO_RATE);
    return { rate: Number.isFinite(rate) && rate > 0 ? rate : DEFAULT_SALDO_RATE };
  },
);

export const setSaldoRate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { rate: number }) => {
    const rate = Number(data?.rate);
    if (!Number.isFinite(rate) || rate <= 0) throw new Error("La base de conversión no es válida.");
    if (rate > 1000) throw new Error("Esa base de conversión es demasiado alta.");
    return { rate: Math.round(rate * 100) / 100 };
  })
  .handler(async ({ data, context }): Promise<{ rate: number }> => {
    await requireAdmin(context);
    const { error } = await context.supabase
      .from("platform_settings")
      .upsert({ id: true, saldo_conversion_rate: data.rate });
    if (error) throw new Error("No se pudo guardar la base de conversión.");
    return { rate: data.rate };
  });

export const setUsdRate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { rate: number; margin: number }) => {
    const rate = Number(data?.rate);
    const margin = Number(data?.margin);
    if (!Number.isFinite(rate) || rate <= 0) throw new Error("El valor del dólar no es válido.");
    if (rate > 100000) throw new Error("Ese valor del dólar es demasiado alto.");
    if (!Number.isFinite(margin) || margin < 0) throw new Error("La ganancia no es válida.");
    if (margin > 100000) throw new Error("Esa ganancia es demasiado alta.");
    return { rate: Math.round(rate * 100) / 100, margin: Math.round(margin * 100) / 100 };
  })
  .handler(async ({ data, context }): Promise<{ rate: number; margin: number; updated: number }> => {
    await requireAdmin(context);
    const { error } = await context.supabase
      .from("platform_settings")
      .upsert({ id: true, usd_to_cup: data.rate, usd_margin_cup: data.margin });
    if (error) throw new Error("No se pudo guardar el valor del dólar.");

    // El costo del proveedor solo se lee en servidor, tras validar el rol de administrador.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error: readError } = await supabaseAdmin
      .from("products")
      .select("id,g2bulk_cost")
      .gt("g2bulk_cost", 0);
    if (readError) throw new Error("No se pudieron recalcular los precios.");

    let updated = 0;
    for (const row of rows ?? []) {
      const { error: updateError } = await supabaseAdmin
        .from("products")
        .update({ sale_price: priceFromCost(Number(row.g2bulk_cost), data) })
        .eq("id", row.id);
      if (!updateError) updated += 1;
    }
    return { rate: data.rate, margin: data.margin, updated };
  });

function chunked<T>(items: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size));
  return out;
}

async function withOffers(
  client: SupabaseClient<Database>,
  games: GameRow[],
): Promise<CatalogGame[]> {
  const counts = new Map<string, number>();
  if (games.length > 0) {
    const ids = games.map((game) => game.id);
    const pageSize = 1000;
    for (let from = 0; ; from += pageSize) {
      const { data } = await client
        .from("products")
        .select("game_id")
        .in("game_id", ids)
        .order("game_id")
        .range(from, from + pageSize - 1);
      const rows = data ?? [];
      for (const row of rows) counts.set(row.game_id, (counts.get(row.game_id) ?? 0) + 1);
      if (rows.length < pageSize) break;
    }
  }

  const signed = await signCatalogImages(games.map((game) => game.image_url));
  return games.map((game) => ({
    ...game,
    cover: coverFor(game.image_url, signed),
    offers: counts.get(game.id) ?? 0,
  }));
}

/* ------------------------------------------------------------------ *
 * Lecturas públicas ( anybody puede ver el catálogo )
 * ------------------------------------------------------------------ */

export const listCatalogGames = createServerFn({ method: "GET" }).handler(
  async (): Promise<CatalogGame[]> => {
    const supabase = publishableClient();
    const { data, error } = await supabase
      .from("games")
      .select("*")
      .order("name");
    if (error) throw new Error("No se pudo cargar el catálogo de juegos.");
    return withOffers(supabase, data ?? []);
  },
);

export const getCatalogGame = createServerFn({ method: "GET" })
  .inputValidator((data: { slug: string }) => {
    if (typeof data?.slug !== "string" || data.slug.length === 0) {
      throw new Error("No se indicó el juego.");
    }
    return { slug: data.slug };
  })
  .handler(async ({ data }): Promise<{ game: CatalogGame; products: CatalogProduct[] } | null> => {
    const supabase = publishableClient();
    const { data: game, error } = await supabase
      .from("games")
      .select("*")
      .eq("slug", data.slug)
      .maybeSingle();
    if (error) throw new Error("No se pudo cargar este juego.");
    if (!game) return null;

    const { data: products } = await supabase
      .from("products")
      .select(PRODUCT_PUBLIC_COLUMNS)
      .eq("game_id", game.id)
      .order("sale_price");
    const rows = products ?? [];
    const signed = await signCatalogImages([game.image_url, ...rows.map((row) => row.image_url)]);
    const cover = coverFor(game.image_url, signed);

    return {
      game: { ...game, cover, offers: rows.length },
      products: rows.map((row) => ({
        ...(row as unknown as ProductRow),
        name: translateOfferName(row.name),
        image: coverFor(row.image_url, signed, cover),
      })),
    };
  });

export type CatalogOffer = CatalogProduct & {
  game_name: string;
  game_slug: string;
  game_cover: string;
};

export const listCatalogOffers = createServerFn({ method: "GET" })
  .inputValidator((data?: { search?: string }) => ({
    search: String(data?.search ?? "").trim().slice(0, 60),
  }))
  .handler(async ({ data }): Promise<CatalogOffer[]> => {
    const supabase = publishableClient();
    let query = supabase
      .from("products")
      .select(`${PRODUCT_PUBLIC_COLUMNS}, games(name, slug, image_url)`)
      .order("sale_price");
    if (data.search) query = query.ilike("name", `%${data.search}%`);
    const { data: rows, error } = await query.limit(300);
    if (error) throw new Error("No se pudieron cargar las ofertas.");

    const list = rows ?? [];
    const signed = await signCatalogImages(
      list.flatMap((row) => {
        const game = row.games as { image_url?: string } | null;
        return [row.image_url, game?.image_url ?? ""];
      }),
    );

    return list.map((row) => {
      const game = row.games as { name?: string; slug?: string; image_url?: string } | null;
      const cover = coverFor(game?.image_url ?? "", signed);
      return {
        ...(row as unknown as ProductRow),
        name: translateOfferName(row.name),
        image: coverFor(row.image_url, signed, cover),
        game_name: game?.name ?? "",
        game_slug: game?.slug ?? "",
        game_cover: cover,
      };
    });
  });

/* ------------------------------------------------------------------ *
 * Panel de administración
 * ------------------------------------------------------------------ */

export const listGamesAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CatalogGame[]> => {
    await requireAdmin(context);
    const { data, error } = await context.supabase.from("games").select("*").order("name");
    if (error) throw new Error("No se pudieron cargar los juegos.");
    return withOffers(context.supabase, data ?? []);
  });

export const listProductsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Array<CatalogProduct & { game_name: string }>> => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("products")
      .select("*, games(name)")
      .order("created_at", { ascending: false });
    if (error) throw new Error("No se pudieron cargar las ofertas.");
    const rows = data ?? [];
    const signed = await signCatalogImages(
      rows.map((row) => row.image_url).concat(rows.map((row) => (row.games as { name?: string })?.name ?? "")),
    );
    return rows.map((row) => {
      const gameName = (row.games as { name?: string } | null)?.name ?? "";
      return {
        ...(row as unknown as ProductRow),
        image: coverFor(row.image_url, signed),
        game_name: gameName,
      };
    });
  });

export type GameDraft = {
  id?: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  platforms: string[];
  image_url: string;
  active: boolean;
};

export const saveGame = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: GameDraft) => {
    const name = String(data?.name ?? "").trim();
    const slug = String(data?.slug ?? "").trim().toLowerCase();
    if (name.length < 2) throw new Error("El nombre del juego es obligatorio.");
    if (!SLUG_PATTERN.test(slug)) {
      throw new Error("El enlace solo puede llevar letras minúsculas, números y guiones.");
    }
    return {
      id: data.id,
      name,
      slug,
      description: String(data?.description ?? "").trim(),
      category: String(data?.category ?? "").trim(),
      platforms: Array.isArray(data?.platforms) ? data.platforms.map(String) : [],
      image_url: String(data?.image_url ?? "").trim(),
      active: Boolean(data?.active),
    };
  })
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const payload = {
      name: data.name,
      slug: data.slug,
      description: data.description,
      category: data.category,
      platforms: data.platforms,
      image_url: data.image_url,
      active: data.active,
    };

    const query = data.id
      ? context.supabase.from("games").update(payload).eq("id", data.id)
      : context.supabase.from("games").insert(payload);

    const { error } = await query;
    if (error) {
      if (error.code === "23505") throw new Error("Ese enlace ya lo está usando otro juego.");
      if (error.code === "23514") throw new Error("Alguna opción no es válida.");
      throw new Error("No se pudo guardar el juego.");
    }
    return { id: data.id ?? null };
  });

export const deleteGame = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => {
    if (!data?.id) throw new Error("Falta el juego.");
    return { id: data.id };
  })
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { count } = await context.supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("game_id", data.id);
    if ((count ?? 0) > 0) {
      throw new Error("Primero elimina las ofertas de este juego o cámbialas de juego.");
    }
    const { error } = await context.supabase.from("games").delete().eq("id", data.id);
    if (error) throw new Error("No se pudo eliminar el juego.");
    return { ok: true };
  });

export type ProductDraft = {
  id?: string;
  game_id: string;
  name: string;
  description: string;
  g2bulk_product_id: string;
  g2bulk_cost: number;
  sale_price: number;
  currency: string;
  delivery_method: "via_id" | "codigo" | "via_cuenta";
  active: boolean;
  available: boolean;
  image_url: string;
  fields: string[];
};

export const saveProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: ProductDraft) => {
    const name = String(data?.name ?? "").trim();
    if (!data?.game_id) throw new Error("Elige el juego al que pertenece la oferta.");
    if (name.length < 2) throw new Error("El nombre de la oferta es obligatorio.");
    const cost = Number(data?.g2bulk_cost ?? 0);
    const price = Number(data?.sale_price ?? 0);
    if (!Number.isFinite(cost) || cost < 0) throw new Error("El costo del proveedor no es válido.");
    if (!Number.isFinite(price) || price <= 0) throw new Error("El precio de venta debe ser mayor que cero.");
    return {
      id: data.id,
      game_id: data.game_id,
      name,
      description: String(data?.description ?? "").trim(),
      g2bulk_product_id: String(data?.g2bulk_product_id ?? "").trim(),
      g2bulk_cost: cost,
      sale_price: price,
      currency: String(data?.currency ?? "CUP"),
      // El catálogo del proveedor solo admite "via_id" o "codigo".
      delivery_method: data.delivery_method === "via_id" ? ("via_id" as const) : ("codigo" as const),
      active: Boolean(data?.active),
      available: Boolean(data?.available),
      image_url: String(data?.image_url ?? "").trim(),
      fields: Array.isArray(data?.fields) ? data.fields.map(String) : [],
    };
  })
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const payload = {
      game_id: data.game_id,
      name: data.name,
      description: data.description,
      g2bulk_product_id: data.g2bulk_product_id,
      g2bulk_cost: data.g2bulk_cost,
      sale_price: data.sale_price,
      currency: data.currency,
      delivery_method: data.delivery_method,
      active: data.active,
      available: data.available,
      image_url: data.image_url,
      metadata: { fields: data.fields },
      last_synced_at: new Date().toISOString(),
    };

    const query = data.id
      ? context.supabase.from("products").update(payload).eq("id", data.id)
      : context.supabase.from("products").insert(payload);

    const { error } = await query;
    if (error) {
      if (error.code === "23505") throw new Error("Esa referencia del proveedor ya está guardada.");
      throw new Error("No se pudo guardar la oferta.");
    }
    return { id: data.id ?? null };
  });

export const deleteProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => {
    if (!data?.id) throw new Error("Falta la oferta.");
    return { id: data.id };
  })
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { error } = await context.supabase.from("products").delete().eq("id", data.id);
    if (error) throw new Error("No se pudo eliminar la oferta.");
    return { ok: true };
  });

export const uploadCatalogImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { name: string; mime: string; base64: string }) => {
    if (!data?.base64) throw new Error("No llegó la imagen.");
    return {
      name: String(data?.name ?? "imagen"),
      mime: String(data?.mime ?? ""),
      base64: String(data.base64),
    };
  })
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    if (!ALLOWED_IMAGE_TYPES.includes(data.mime)) {
      throw new Error("Formato no permitido. Usa JPG, PNG o WEBP.");
    }
    const buffer = Buffer.from(data.base64, "base64");
    if (buffer.byteLength === 0) throw new Error("La imagen llegó vacía.");
    if (buffer.byteLength > MAX_IMAGE_BYTES) {
      throw new Error("La imagen no puede pasar de 4 MB.");
    }

    const safeName = data.name
      .toLowerCase()
      .replace(/[^a-z0-9.]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(-60);
    const path = `juegos/${Date.now()}-${safeName || "imagen"}`;

    const { error } = await context.supabase.storage
      .from(CATALOG_BUCKET)
      .upload(path, new Uint8Array(buffer), { contentType: data.mime, upsert: true });
    if (error) throw new Error("No se pudo subir la imagen.");
    return { path };
  });

/* ------------------------------------------------------------------ *
 * Sincronización con el proveedor (catálogo público, sin clave)
 * ------------------------------------------------------------------ */

export type SyncResult = {
  gamesCreated: number;
  offersCreated: number;
  offersUpdated: number;
  notes: string[];
};

export const syncProviderCatalog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SyncResult> => {
    await requireAdmin(context);
    const rate = await readPricing(context.supabase);


    const [categories, providerProducts, topUpGames] = await Promise.all([
      listCategories(),
      listProviderProducts(),
      listTopUpGames(),
    ]);

    const existing = await context.supabase.from("games").select("id,slug,g2bulk_id");
    const usedSlugs = new Set((existing.data ?? []).map((game) => game.slug));
    const gamesByRef = new Map<string, string>();
    for (const game of existing.data ?? []) {
      if (game.g2bulk_id) gamesByRef.set(game.g2bulk_id, game.id);
    }

    const notes: string[] = [];
    const newGames: Array<{
      name: string;
      slug: string;
      description: string;
      category: string;
      platforms: string[];
      image_url: string;
      active: boolean;
      g2bulk_id: string;
    }> = [];

    const sellableCategories = categories.filter((category) => (category.product_count ?? 0) > 0);
    for (const category of sellableCategories) {
      const ref = `category:${category.id}`;
      if (gamesByRef.has(ref)) continue;
      newGames.push({
        name: category.title.trim(),
        slug: slugify(category.title, usedSlugs),
        description: (category.description ?? "").trim(),
        category: "Tarjetas y códigos",
        platforms: [],
        image_url: (category.image_url ?? "").trim(),
        active: true,
        g2bulk_id: ref,
      });
    }
    for (const game of topUpGames) {
      const ref = `game:${game.code}`;
      if (gamesByRef.has(ref)) continue;
      newGames.push({
        name: game.name.trim(),
        slug: slugify(game.name, usedSlugs),
        description: "",
        category: "Recarga directa",
        platforms: [],
        image_url: (game.image_url ?? "").trim(),
        active: true,
        g2bulk_id: ref,
      });
    }

    let gamesCreated = 0;
    for (const group of chunked(newGames)) {
      const { data, error } = await context.supabase
        .from("games")
        .insert(group)
        .select("id,g2bulk_id");
      if (error) {
        notes.push("Algunos juegos nuevos no se pudieron añadir.");
        break;
      }
      for (const row of data ?? []) {
        gamesByRef.set(row.g2bulk_id, row.id);
        gamesCreated += 1;
      }
    }

    const { supabaseAdmin: adminClient } = await import("@/integrations/supabase/client.server");
    const existingOffers = await adminClient
      .from("products")
      .select("id,g2bulk_product_id,g2bulk_cost,available,name");
    const offersByRef = new Map<string, ProductRow & { id: string }>();
    for (const offer of existingOffers.data ?? []) {
      if (offer.g2bulk_product_id) {
        offersByRef.set(offer.g2bulk_product_id, offer as unknown as ProductRow & { id: string });
      }
    }

    const newOffers: Array<ProductRow | (Omit<ProductRow, "id"> & { game_id: string })> = [];
    const sellableRefs = new Set(sellableCategories.map((category) => `category:${category.id}`));
    for (const product of providerProducts) {
      const gameId = gamesByRef.get(`category:${product.category_id}`);
      if (!gameId || !sellableRefs.has(`category:${product.category_id}`)) continue;
      const ref = `p:${product.id}`;
      if (offersByRef.has(ref)) continue;
      newOffers.push({
        game_id: gameId,
        name: product.title.trim(),
        description: (product.description ?? "").trim(),
        g2bulk_product_id: ref,
        g2bulk_cost: Number(product.unit_price ?? 0),
        sale_price: priceFromCost(Number(product.unit_price ?? 0), rate),
        currency: "CUP",
        // Los productos automáticos del proveedor entregan un código/tarjeta.
        // "via_cuenta" queda reservado al comercio de cuentas entre usuarios.
        delivery_method: "codigo",
        active: true,
        available: Number(product.stock ?? 0) > 0,
        metadata: { fields: [] },
        image_url: (product.image_url ?? "").trim(),
        last_synced_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as unknown as Omit<ProductRow, "id"> & { game_id: string });
    }

    let offersCreated = 0;
    for (const group of chunked(newOffers)) {
      const { data, error } = await context.supabase
        .from("products")
        .insert(group)
        .select("id");
      if (error) {
        notes.push("Algunas ofertas nuevas no se pudieron añadir.");
        break;
      }
      offersCreated += (data ?? []).length;
    }

    let offersUpdated = 0;
    const pendingUpdates = providerProducts
      .map((product) => ({ product, ref: `p:${product.id}` }))
      .filter(({ ref }) => offersByRef.has(ref))
      .slice(0, 300);
    for (const { product, ref } of pendingUpdates) {
      const current = offersByRef.get(ref);
      if (!current) continue;
      const { error } = await context.supabase
        .from("products")
        // Solo datos técnicos del proveedor. El precio de venta y el resto de la
        // configuración comercial de MONSTORE no se tocan en la sincronización.
        .update({
          g2bulk_cost: Number(product.unit_price ?? 0),
          available: Number(product.stock ?? 0) > 0,
          last_synced_at: new Date().toISOString(),
        })
        .eq("id", current.id);
      if (!error) offersUpdated += 1;
    }

    if (newGames.length === 0 && newOffers.length === 0 && offersUpdated === 0) {
      notes.push("Ya estabas al día: el proveedor no trajo nada nuevo.");
    }

    return { gamesCreated, offersCreated, offersUpdated, notes };
  });

export const syncGameOffers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { gameId: string }) => {
    if (!data?.gameId) throw new Error("Falta el juego.");
    return { gameId: data.gameId };
  })
  .handler(async ({ data, context }): Promise<SyncResult> => {
    await requireAdmin(context);
    const rate = await readPricing(context.supabase);
    const { data: game } = await context.supabase
      .from("games")
      .select("id,name,g2bulk_id")
      .eq("id", data.gameId)
      .maybeSingle();
    if (!game) throw new Error("Ese juego ya no existe.");
    if (!game.g2bulk_id.startsWith("game:")) {
      throw new Error("Las ofertas de este juego se actualizan con el catálogo general.");
    }

    const code = game.g2bulk_id.slice(5);
    const [offers, fields] = await Promise.all([gameCatalogue(code), gameFields(code)]);
    if (offers.length === 0) throw new Error("El proveedor no mostró ofertas para este juego.");

    const existingOffers = await context.supabase
      .from("products")
      .select("id,g2bulk_product_id")
      .eq("game_id", game.id);
    const known = new Set(
      (existingOffers.data ?? []).map((offer) => offer.g2bulk_product_id).filter(Boolean),
    );

    const newOffers = offers
      .filter((offer) => !known.has(`topup:${code}:${offer.id}`))
      .map((offer) => ({
        game_id: game.id,
        name: offer.name.trim(),
        description: "",
        g2bulk_product_id: `topup:${code}:${offer.id}`,
        g2bulk_cost: Number(offer.amount ?? 0),
        sale_price: priceFromCost(Number(offer.amount ?? 0), rate),
        currency: "CUP",
        delivery_method: "via_id" as const,
        active: true,
        available: true,
        metadata: { fields, game_code: code },
        image_url: "",
        last_synced_at: new Date().toISOString(),
      }));

    let offersCreated = 0;
    const notes: string[] = [];
    for (const group of chunked(newOffers)) {
      const { data: inserted, error } = await context.supabase
        .from("products")
        .insert(group)
        .select("id");
      if (error) {
        notes.push("Algunas ofertas no se pudieron añadir.");
        break;
      }
      offersCreated += (inserted ?? []).length;
    }

    return { gamesCreated: 0, offersCreated, offersUpdated: 0, notes };
  });

export type BulkOffersResult = SyncResult & { processed: number; remaining: number };

/**
 * Trae las ofertas de los juegos de recarga que todavía no tienen ninguna.
 * Se procesa en tandas para no agotar el tiempo del servidor.
 */
export const syncMissingGameOffers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data?: { batch?: number }) => ({
    batch: Math.min(Math.max(Number(data?.batch ?? 20), 1), 40),
  }))
  .handler(async ({ data, context }): Promise<BulkOffersResult> => {
    await requireAdmin(context);
    const pricing = await readPricing(context.supabase);

    const { data: games } = await context.supabase
      .from("games")
      .select("id,g2bulk_id")
      .like("g2bulk_id", "game:%")
      .order("name");
    const all = games ?? [];

    const withOffers = new Set<string>();
    for (const group of chunked(all.map((game) => game.id))) {
      const { data: rows } = await context.supabase
        .from("products")
        .select("game_id")
        .in("game_id", group);
      for (const row of rows ?? []) if (row.game_id) withOffers.add(row.game_id);
    }

    const pending = all.filter((game) => !withOffers.has(game.id));
    const slice = pending.slice(0, data.batch);

    let offersCreated = 0;
    let processed = 0;
    const notes: string[] = [];

    for (const game of slice) {
      const code = game.g2bulk_id.slice(5);
      processed += 1;
      let offers: Awaited<ReturnType<typeof gameCatalogue>> = [];
      try {
        offers = await gameCatalogue(code);
      } catch {
        continue;
      }
      if (offers.length === 0) continue;
      const fields = await gameFields(code);

      const rows = offers.map((offer) => ({
        game_id: game.id,
        name: offer.name.trim(),
        description: "",
        g2bulk_product_id: `topup:${code}:${offer.id}`,
        g2bulk_cost: Number(offer.amount ?? 0),
        sale_price: priceFromCost(Number(offer.amount ?? 0), pricing),
        currency: "CUP",
        delivery_method: "via_id" as const,
        active: true,
        available: true,
        metadata: { fields, game_code: code },
        image_url: "",
        last_synced_at: new Date().toISOString(),
      }));

      for (const group of chunked(rows)) {
        const { data: inserted, error } = await context.supabase
          .from("products")
          .insert(group)
          .select("id");
        if (error) {
          notes.push(`No se pudieron añadir las ofertas de ${code}.`);
          break;
        }
        offersCreated += (inserted ?? []).length;
      }
    }

    const remaining = Math.max(pending.length - processed, 0);
    if (processed === 0) notes.push("Todos los juegos ya tienen sus ofertas.");

    return { gamesCreated: 0, offersCreated, offersUpdated: 0, notes, processed, remaining };
  });



export const getProviderStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ProviderStatus> => {
    await requireAdmin(context);
    if (!providerHasKey()) {
      return { hasKey: false, balance: null, error: null };
    }
    try {
      const { balance } = await providerBalance();
      return { hasKey: true, balance, error: null };
    } catch (error) {
      return {
        hasKey: true,
        balance: null,
        error: messageFrom(error, "No se pudo leer el saldo del proveedor."),
      };
    }
  });

export type PlayerCheck = {
  valid: boolean;
  name: string | null;
  message: string | null;
};

export const checkGamePlayer = createServerFn({ method: "POST" })
  .inputValidator((data: {
    gameCode: string;
    playerId: string;
    serverId?: string;
    charname?: string;
  }) => {
    const gameCode = String(data?.gameCode ?? "").trim();
    const playerId = String(data?.playerId ?? "").trim();
    if (!gameCode) throw new Error("No se indicó el juego.");
    if (!playerId) throw new Error("Escribe el ID del jugador.");
    return {
      gameCode: gameCode.slice(0, 60),
      playerId: playerId.slice(0, 60),
      serverId: String(data?.serverId ?? "").trim().slice(0, 60),
      charname: String(data?.charname ?? "").trim().slice(0, 60),
    };
  })
  .handler(async ({ data }): Promise<PlayerCheck> => {
    try {
      const body: {
        game: string;
        user_id: string;
        server_id?: string;
        charname?: string;
      } = { game: data.gameCode, user_id: data.playerId };
      if (data.serverId) body.server_id = data.serverId;
      if (data.charname) body.charname = data.charname;

      const result = await checkPlayerId(body);
      const flag = result.valid.toLowerCase();
      const valid = flag === "valid" || flag === "true" || flag === "1" || flag === "ok";
      if (!valid) {
        return {
          valid: false,
          name: null,
          message: "No encontramos una cuenta con ese ID.",
        };
      }
      return { valid: true, name: result.name, message: null };
    } catch (error) {
      return {
        valid: false,
        name: null,
        message: messageFrom(error, "No pudimos verificar el ID ahora mismo."),
      };
    }
  });
