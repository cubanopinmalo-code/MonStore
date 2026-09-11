import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { coverFor, publishableClient, signCatalogImages, CATALOG_BUCKET } from "./supabase.server";
import {
  ProviderError,
  gameCatalogue,
  gameFields,
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

export const DEFAULT_USD_RATE = 1150;

/** Precio de venta en CUP a partir del costo en USD del proveedor. */
export function priceFromCost(costUsd: number, rate: number): number {
  return Math.round(Number(costUsd ?? 0) * rate * 100) / 100;
}

async function readUsdRate(client: SupabaseClient<Database>): Promise<number> {
  const { data } = await client.from("platform_settings").select("usd_to_cup").maybeSingle();
  const rate = Number(data?.usd_to_cup ?? DEFAULT_USD_RATE);
  return Number.isFinite(rate) && rate > 0 ? rate : DEFAULT_USD_RATE;
}

export const getUsdRate = createServerFn({ method: "GET" }).handler(async (): Promise<number> => {
  return readUsdRate(publishableClient());
});

export const setUsdRate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { rate: number }) => {
    const rate = Number(data?.rate);
    if (!Number.isFinite(rate) || rate <= 0) throw new Error("El valor del dólar no es válido.");
    if (rate > 100000) throw new Error("Ese valor del dólar es demasiado alto.");
    return { rate: Math.round(rate * 100) / 100 };
  })
  .handler(async ({ data, context }): Promise<{ rate: number; updated: number }> => {
    await requireAdmin(context);
    const { error } = await context.supabase
      .from("platform_settings")
      .upsert({ id: true, usd_to_cup: data.rate });
    if (error) throw new Error("No se pudo guardar el valor del dólar.");

    const { data: rows, error: readError } = await context.supabase
      .from("products")
      .select("id,g2bulk_cost")
      .gt("g2bulk_cost", 0);
    if (readError) throw new Error("No se pudieron recalcular los precios.");

    let updated = 0;
    for (const row of rows ?? []) {
      const { error: updateError } = await context.supabase
        .from("products")
        .update({ sale_price: priceFromCost(Number(row.g2bulk_cost), data.rate) })
        .eq("id", row.id);
      if (!updateError) updated += 1;
    }
    return { rate: data.rate, updated };
  });

function chunked<T>(items: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size));
  return out;
}

async function withOffers(
  client: SupabaseClient<Database>,
  games: GameRow[],
  onlyActive: boolean,
): Promise<CatalogGame[]> {
  const counts = new Map<string, number>();
  if (games.length > 0) {
    let query = client.from("products").select("game_id");
    if (onlyActive) query = query.eq("active", true);
    const { data } = await query.in(
      "game_id",
      games.map((game) => game.id),
    );
    for (const row of data ?? []) counts.set(row.game_id, (counts.get(row.game_id) ?? 0) + 1);
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
      .eq("active", true)
      .order("name");
    if (error) throw new Error("No se pudo cargar el catálogo de juegos.");
    return withOffers(supabase, data ?? [], true);
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
      .eq("active", true)
      .maybeSingle();
    if (error) throw new Error("No se pudo cargar este juego.");
    if (!game) return null;

    const { data: products } = await supabase
      .from("products")
      .select("*")
      .eq("game_id", game.id)
      .eq("active", true)
      .order("sale_price");
    const rows = products ?? [];
    const signed = await signCatalogImages([game.image_url, ...rows.map((row) => row.image_url)]);
    const cover = coverFor(game.image_url, signed);

    return {
      game: { ...game, cover, offers: rows.length },
      products: rows.map((row) => ({ ...row, image: coverFor(row.image_url, signed, cover) })),
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
      .select("*, games(name, slug, image_url)")
      .eq("active", true)
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
    return withOffers(context.supabase, data ?? [], false);
  });

export const listProductsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Array<CatalogProduct & { game_name: string }>> => {
    await requireAdmin(context);
    const { data, error } = await context.supabase
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
  delivery_method: "via_id" | "via_cuenta";
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
      delivery_method: data.delivery_method === "via_id" ? ("via_id" as const) : ("via_cuenta" as const),
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
    const rate = await readUsdRate(context.supabase);


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
        active: false,
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
        active: false,
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

    const existingOffers = await context.supabase
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
        delivery_method: "via_cuenta",
        active: false,
        available: Number(product.stock ?? 0) > 0,
        metadata: { fields: [] },
        image_url: (product.image_url ?? "").trim(),
        last_synced_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as Omit<ProductRow, "id"> & { game_id: string });
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
        .update({
          g2bulk_cost: Number(product.unit_price ?? 0),
          sale_price: priceFromCost(Number(product.unit_price ?? 0), rate),
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
    const rate = await readUsdRate(context.supabase);
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
        active: false,
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
