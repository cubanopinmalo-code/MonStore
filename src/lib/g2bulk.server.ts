/**
 * Acceso al proveedor de productos digitales.
 *
 * Este archivo solo se ejecuta en el servidor: la clave del proveedor se lee
 * de los secretos del backend y nunca llega al navegador.
 */

export const PROVIDER_BASE = "https://api.g2bulk.com/v1";

export class ProviderError extends Error {
  readonly status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.name = "ProviderError";
    this.status = status;
  }
}

export function providerHasKey(): boolean {
  return Boolean(process.env["G2BULK_API_KEY"]);
}

type CallOptions = {
  method?: "GET" | "POST";
  body?: unknown;
  requiresKey?: boolean;
  idempotencyKey?: string;
};

async function call<T>(path: string, options: CallOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  if (options.requiresKey) {
    const key = process.env["G2BULK_API_KEY"];
    if (!key) {
      throw new ProviderError(
        "Todavía no hay clave del proveedor guardada en el backend.",
        400,
      );
    }
    headers["X-API-Key"] = key;
  }
  if (options.idempotencyKey) headers["X-Idempotency-Key"] = options.idempotencyKey;

  let response: Response;
  try {
    const init: RequestInit = { method: options.method ?? "GET", headers };
    if (options.body !== undefined) init.body = JSON.stringify(options.body);
    response = await fetch(`${PROVIDER_BASE}${path}`, init);
  } catch {
    throw new ProviderError(
      "No se pudo contactar con el proveedor. Inténtalo de nuevo en unos minutos.",
      0,
    );
  }

  const text = await response.text();
  let payload: Record<string, unknown> | null = null;
  if (text) {
    try {
      payload = JSON.parse(text) as Record<string, unknown>;
    } catch {
      payload = null;
    }
  }

  if (!response.ok || payload?.["success"] === false) {
    const detail =
      (typeof payload?.["message"] === "string" && payload["message"]) ||
      (typeof payload?.["error"] === "string" && payload["error"]) ||
      null;
    throw new ProviderError(
      detail ?? `El proveedor respondió con un error (${response.status}).`,
      response.status,
    );
  }

  return (payload ?? {}) as T;
}

export type ProviderCategory = {
  id: number;
  title: string;
  description?: string | null;
  image_url?: string | null;
  product_count?: number;
};

export type ProviderProduct = {
  id: number;
  title: string;
  description?: string | null;
  category_id: number;
  category_title?: string | null;
  unit_price: number;
  face_value?: number | null;
  image_url?: string | null;
  stock?: number;
};

export type ProviderGame = {
  id: number;
  code: string;
  name: string;
  image_url?: string | null;
};

export type ProviderOffer = {
  id: number;
  name: string;
  amount: number;
};

export async function listCategories(): Promise<ProviderCategory[]> {
  const data = await call<{ categories?: ProviderCategory[] }>("/category");
  return data.categories ?? [];
}

export async function listProviderProducts(): Promise<ProviderProduct[]> {
  const data = await call<{ products?: ProviderProduct[] }>("/products");
  return data.products ?? [];
}

export async function listTopUpGames(): Promise<ProviderGame[]> {
  const data = await call<{ games?: ProviderGame[] }>("/games");
  return data.games ?? [];
}

export async function gameCatalogue(code: string): Promise<ProviderOffer[]> {
  const data = await call<{ catalogues?: ProviderOffer[] }>(
    `/games/${encodeURIComponent(code)}/catalogue`,
  );
  return data.catalogues ?? [];
}

export async function gameFields(code: string): Promise<string[]> {
  try {
    const data = await call<{ info?: { fields?: string[] } }>("/games/fields", {
      method: "POST",
      body: { game: code },
    });
    return data.info?.fields ?? [];
  } catch {
    return [];
  }
}

export async function gameServers(code: string): Promise<string[]> {
  try {
    const data = await call<{ servers?: Record<string, string> }>("/games/servers", {
      method: "POST",
      body: { game: code },
    });
    return Object.keys(data.servers ?? {});
  } catch {
    return [];
  }
}

export async function checkPlayerId(body: {
  game: string;
  user_id: string;
  server_id?: string;
  charname?: string;
}): Promise<{ valid: string; name: string | null }> {
  return call<{ valid?: string; name?: string; nickname?: string; username?: string }>(
    "/games/checkPlayerId",
    { method: "POST", body },
  ).then((data) => ({
    valid: String(data.valid ?? "unknown"),
    name: data.name || data.nickname || data.username || null,
  }));
}

export async function providerBalance(): Promise<{ balance: number; username: string | null }> {
  const data = await call<{ balance?: number; username?: string }>("/getMe", {
    requiresKey: true,
  });
  return { balance: Number(data.balance ?? 0), username: data.username ?? null };
}

export type ProviderPurchase = {
  order_id?: number;
  transaction_id?: number;
  status?: string;
  delivery_items?: string[] | null;
  poll_url?: string | null;
};

export async function purchaseProduct(
  productId: string,
  quantity: number,
  idempotencyKey: string,
): Promise<ProviderPurchase> {
  return call<ProviderPurchase>(`/products/${encodeURIComponent(productId)}/purchase`, {
    method: "POST",
    body: { quantity },
    requiresKey: true,
    idempotencyKey,
  });
}

export async function orderDelivery(orderId: string): Promise<ProviderPurchase> {
  return call<ProviderPurchase>(`/orders/${encodeURIComponent(orderId)}/delivery`, {
    requiresKey: true,
  });
}

export type ProviderTopUpOrder = {
  order_id?: number;
  status?: string;
  message?: string;
};

export async function placeTopUpOrder(
  code: string,
  body: {
    catalogue_name: string;
    player_id: string;
    server_id?: string;
    charname?: string;
    remark?: string;
  },
  idempotencyKey: string,
): Promise<ProviderTopUpOrder> {
  return call<ProviderTopUpOrder>(`/games/${encodeURIComponent(code)}/order`, {
    method: "POST",
    body,
    requiresKey: true,
    idempotencyKey,
  });
}
