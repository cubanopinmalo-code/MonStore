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
  /** Reintentos ante 429 / 5xx / caída de red. Nunca ilimitados. */
  attempts?: number;
};

const TIMEOUT_MS = 20_000;
const DEFAULT_ATTEMPTS = 3;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Llamada única al proveedor.
 *
 * - La clave se lee de los secretos del servidor y nunca se registra ni se
 *   devuelve al navegador.
 * - Reintentos con espera creciente solo para 429, 5xx y fallos de red.
 * - Un error de autenticación (401/403) o de datos (4xx) corta de inmediato:
 *   nunca se entra en un bucle de llamadas.
 */
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

  const total = Math.max(1, Math.min(options.attempts ?? DEFAULT_ATTEMPTS, 4));
  let lastError: ProviderError = new ProviderError(
    "No se pudo contactar con el proveedor. Inténtalo de nuevo en unos minutos.",
    0,
  );

  for (let attempt = 1; attempt <= total; attempt += 1) {
    let response: Response;
    try {
      const init: RequestInit = {
        method: options.method ?? "GET",
        headers,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      };
      if (options.body !== undefined) init.body = JSON.stringify(options.body);
      response = await fetch(`${PROVIDER_BASE}${path}`, init);
    } catch {
      lastError = new ProviderError(
        "No se pudo contactar con el proveedor. Inténtalo de nuevo en unos minutos.",
        0,
      );
      if (attempt < total) {
        await wait(500 * attempt);
        continue;
      }
      throw lastError;
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

    if (response.ok && payload?.["success"] !== false) return (payload ?? {}) as T;

    const detail =
      (typeof payload?.["message"] === "string" && payload["message"]) ||
      (typeof payload?.["error"] === "string" && payload["error"]) ||
      null;

    if (response.status === 401 || response.status === 403) {
      throw new ProviderError(
        "El proveedor rechazó la clave guardada en el backend.",
        response.status,
      );
    }

    lastError = new ProviderError(
      detail ?? `El proveedor respondió con un error (${response.status}).`,
      response.status,
    );

    const transient = response.status === 429 || response.status >= 500;
    if (transient && attempt < total) {
      await wait(700 * attempt * attempt);
      continue;
    }
    throw lastError;
  }

  throw lastError;
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

/** Costo y disponibilidad vigentes de un producto concreto del proveedor. */
export async function providerProduct(
  productId: string,
): Promise<{ found: boolean; unit_price: number; stock?: number }> {
  try {
    const data = await call<{ product?: ProviderProduct; unit_price?: number; stock?: number }>(
      `/products/${encodeURIComponent(productId)}`,
    );
    const product = data.product ?? (data as unknown as ProviderProduct);
    const price = Number(product?.unit_price ?? data.unit_price ?? 0);
    const stock = product?.stock ?? data.stock;
    const result: { found: boolean; unit_price: number; stock?: number } = {
      found: price > 0,
      unit_price: price,
    };
    if (stock !== undefined) result.stock = Number(stock);
    return result;
  } catch (error) {
    if (error instanceof ProviderError && error.status === 404) {
      return { found: false, unit_price: 0 };
    }
    throw error;
  }
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

/**
 * Campos que pide cada juego (POST /games/fields).
 * Un 404 significa "este juego no publica campos": se usa el ID por defecto.
 */
export async function gameFieldsInfo(
  code: string,
): Promise<{ fields: string[]; notes: string }> {
  try {
    const data = await call<{ info?: { fields?: string[]; notes?: string } }>("/games/fields", {
      method: "POST",
      body: { game: code },
    });
    return {
      fields: (data.info?.fields ?? []).map(String),
      notes: String(data.info?.notes ?? ""),
    };
  } catch {
    return { fields: [], notes: "" };
  }
}

export async function gameFields(code: string): Promise<string[]> {
  return (await gameFieldsInfo(code)).fields;
}

/**
 * Servidores del juego (POST /games/servers).
 * El proveedor responde 403 «Game does not requires any servers» cuando el
 * juego no usa servidor: es una respuesta válida, no un fallo de integración.
 */
export async function gameServers(
  code: string,
): Promise<{ required: boolean; servers: Array<{ id: string; name: string }> }> {
  try {
    const data = await call<{ servers?: Record<string, string> | Array<Record<string, unknown>> }>(
      "/games/servers",
      { method: "POST", body: { game: code } },
    );
    const raw = data.servers ?? {};
    const servers = Array.isArray(raw)
      ? raw.map((item) => ({
          id: String(item["id"] ?? item["server_id"] ?? ""),
          name: String(item["name"] ?? item["server_name"] ?? item["id"] ?? ""),
        }))
      : Object.entries(raw).map(([id, name]) => ({ id, name: String(name) }));
    return { required: servers.length > 0, servers: servers.filter((item) => item.id) };
  } catch (error) {
    if (error instanceof ProviderError && (error.status === 403 || error.status === 404)) {
      return { required: false, servers: [] };
    }
    throw error;
  }
}

/** Estimación de entrega (POST /games/eta). Nunca es una garantía. */
export async function gameEta(code: string, denomId: string): Promise<string | null> {
  try {
    const data = await call<{ eta?: string; info?: { eta?: string } }>("/games/eta", {
      method: "POST",
      body: { game_code: code, denom_id: denomId },
    });
    const eta = data.eta ?? data.info?.eta ?? null;
    return eta === null ? null : String(eta);
  } catch {
    return null;
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


export async function providerBalance(): Promise<{
  balance: number;
  currency: string;
  username: string | null;
}> {
  const data = await call<{ balance?: number; username?: string; currency?: string }>("/getMe", {
    requiresKey: true,
  });
  return {
    balance: Number(data.balance ?? 0),
    currency: String(data.currency ?? "USD"),
    username: data.username ?? null,
  };
}

export type ProviderPurchase = {
  order_id?: number;
  transaction_id?: number;
  status?: string;
  delivery_items?: string[] | null;
  poll_url?: string | null;
};

/**
 * Compra real. Sin reintentos automáticos: una escritura repetida podría
 * duplicar el pedido en el proveedor. La reconciliación se hace consultando
 * el estado, no repitiendo la compra.
 */
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
    attempts: 1,
  });
}

export async function orderDelivery(orderId: string): Promise<ProviderPurchase> {
  return call<ProviderPurchase>(`/orders/${encodeURIComponent(orderId)}/delivery`, {
    requiresKey: true,
  });
}

export type ProviderOrderStatus = {
  status: string;
  transactionId: string | null;
  items: string[];
  found: boolean;
};

/** Consulta del estado de un pedido ya creado en el proveedor. */
export async function providerOrderStatus(orderId: string): Promise<ProviderOrderStatus> {
  try {
    const data = await call<{
      status?: string;
      order?: { status?: string; transaction_id?: number | string };
      transaction_id?: number | string;
      delivery_items?: string[] | null;
    }>(`/orders/${encodeURIComponent(orderId)}`, { requiresKey: true });
    const reference = data.transaction_id ?? data.order?.transaction_id ?? null;
    return {
      status: String(data.status ?? data.order?.status ?? "unknown").toUpperCase(),
      transactionId: reference === null ? null : String(reference),
      items: Array.isArray(data.delivery_items) ? data.delivery_items.map(String) : [],
      found: true,
    };
  } catch (error) {
    if (error instanceof ProviderError && error.status === 404) {
      return { status: "NOT_FOUND", transactionId: null, items: [], found: false };
    }
    throw error;
  }
}

/** Estado oficial de un pedido de recarga (POST /games/order/status). */
export async function topUpOrderStatus(
  code: string,
  orderId: string,
): Promise<ProviderOrderStatus> {
  try {
    const data = await call<{
      status?: string;
      order?: { status?: string; order_id?: number | string };
      order_status?: string;
      message?: string;
    }>("/games/order/status", {
      method: "POST",
      body: { game: code, order_id: Number(orderId) || orderId },
      requiresKey: true,
    });
    const raw = data.status ?? data.order_status ?? data.order?.status ?? "unknown";
    return {
      status: String(raw).toUpperCase(),
      transactionId: orderId,
      items: [],
      found: true,
    };
  } catch (error) {
    if (error instanceof ProviderError && (error.status === 404 || error.status === 400)) {
      return { status: "NOT_FOUND", transactionId: null, items: [], found: false };
    }
    throw error;
  }
}

export type ProviderTopUpOrder = {
  order_id?: number;
  status?: string;
  message?: string;
  /** Respuesta original del proveedor, útil para el registro técnico. */
  raw?: Record<string, unknown>;
};

/**
 * El proveedor puede devolver los datos de la orden en la raíz o dentro de
 * "order"/"data". Se leen ambos para no perder nunca la referencia real.
 */
export async function placeTopUpOrder(
  code: string,
  body: {
    catalogue_name: string;
    player_id: string;
    server_id?: string;
    charname?: string;
    remark?: string;
    callback_url?: string;
  },
  idempotencyKey: string,
): Promise<ProviderTopUpOrder> {
  const response = await call<Record<string, unknown>>(
    `/games/${encodeURIComponent(code)}/order`,
    {
      method: "POST",
      body,
      requiresKey: true,
      idempotencyKey,
      attempts: 1,
    },
  );
  const nested =
    (response["order"] as Record<string, unknown> | undefined) ??
    (response["data"] as Record<string, unknown> | undefined) ??
    {};
  const rawId = response["order_id"] ?? nested["order_id"] ?? nested["id"];
  const rawStatus = response["status"] ?? nested["status"];
  const result: ProviderTopUpOrder = { raw: response };
  if (rawId !== undefined && rawId !== null) result.order_id = Number(rawId);
  if (typeof rawStatus === "string") result.status = rawStatus;
  if (typeof response["message"] === "string") result.message = response["message"];
  return result;
}

