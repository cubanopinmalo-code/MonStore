/**
 * FASE — INTEGRACIÓN REAL DE COMPRAS CON EL PROVEEDOR.
 *
 * Único camino por el que MonStore compra de verdad. Lo usan la compra del
 * cliente, la compra controlada del administrador, el aviso del proveedor y la
 * reconciliación programada, así que todas las rutas comparten las mismas
 * reglas:
 *
 * - La clave del proveedor solo vive en los secretos del servidor.
 * - Una compra real solo ocurre si el administrador activó las compras reales
 *   (o si es la compra controlada del propio administrador).
 * - Se comprueba costo, disponibilidad y saldo del proveedor ANTES de cobrar.
 * - Cada operación es idempotente: repetirla no compra dos veces.
 * - El dinero del cliente se devuelve si el proveedor falla.
 * - Todo queda registrado (transacciones del proveedor + auditoría), nunca la clave.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  ProviderError,
  gameCatalogue,
  placeTopUpOrder,
  providerBalance,
  providerHasKey,
  providerOrderStatus,
  providerProduct,
  purchaseProduct,
  topUpOrderStatus,
} from "./g2bulk.server";

type Admin = SupabaseClient<Database>;

export type FulfillResult = {
  status: "completado" | "procesando" | "error" | "pendiente";
  reference: string | null;
  message: string;
  /** true cuando no se hizo ninguna llamada nueva al proveedor. */
  reused: boolean;
};

/** Estados oficiales del proveedor: PENDING, PROCESSING, COMPLETED, FAILED. */
const DONE = ["COMPLETED", "SUCCESS", "SUCCESSFUL", "DELIVERED", "COMPLETE"];
const FAILED = ["FAILED", "FAILURE", "ERROR", "CANCELLED", "CANCELED", "REFUNDED", "REJECTED"];

function classify(raw: string): "done" | "failed" | "pending" {
  const status = raw.toUpperCase();
  if (DONE.includes(status)) return "done";
  if (FAILED.includes(status)) return "failed";
  return "pending";
}

async function admin(): Promise<Admin> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Admin;
}

/** ¿El administrador habilitó las compras reales? */
export async function realPurchasesEnabled(client?: Admin): Promise<boolean> {
  const db = client ?? (await admin());
  const { data } = await db
    .from("platform_settings")
    .select("g2bulk_purchases_enabled")
    .maybeSingle();
  return Boolean((data as { g2bulk_purchases_enabled?: boolean } | null)?.g2bulk_purchases_enabled);
}

/** Dirección estable donde el proveedor avisa el resultado de una recarga. */
function callbackUrl(): string | null {
  const base = process.env["G2BULK_CALLBACK_BASE"] ?? process.env["PUBLIC_SITE_URL"] ?? "";
  if (!base.startsWith("https://")) return null;
  return `${base.replace(/\/+$/, "")}/api/public/g2bulk-webhook`;
}

/** Registro técnico de cada llamada al proveedor. Nunca guarda la clave. */
async function logTransaction(
  db: Admin,
  input: {
    orderId: string;
    request: Record<string, unknown>;
    response: Record<string, unknown>;
    status: string;
    reference: string | null;
    error?: string;
  },
): Promise<void> {
  await db.from("api_transactions").insert({
    order_id: input.orderId,
    provider: "g2bulk",
    request_data: input.request as never,
    response_data: input.response as never,
    provider_transaction_id: input.reference,
    status: input.status,
    error_message: input.error ?? null,
  });
}

async function auditPurchase(
  db: Admin,
  input: {
    orderId: string;
    userId: string;
    action: string;
    note: string;
    costUsd: number;
    costCup: number;
    priceCup: number;
    reference: string | null;
    status: string;
  },
): Promise<void> {
  await db.from("audit_log").insert({
    action: input.action,
    entity_type: "order",
    entity_id: input.orderId,
    target_user_id: input.userId,
    amount: input.priceCup,
    note: input.note,
    metadata: {
      provider: "g2bulk",
      provider_order_id: input.reference,
      cost_usd: input.costUsd,
      cost_cup: input.costCup,
      price_cup: input.priceCup,
      profit_cup: Math.round((input.priceCup - input.costCup) * 100) / 100,
      status: input.status,
    },
  });
}

async function pricing(db: Admin): Promise<{ rate: number; margin: number }> {
  const { data } = await db
    .from("platform_settings")
    .select("usd_to_cup,usd_margin_cup")
    .maybeSingle();
  return {
    rate: Number((data as { usd_to_cup?: number } | null)?.usd_to_cup ?? 0),
    margin: Number((data as { usd_margin_cup?: number } | null)?.usd_margin_cup ?? 0),
  };
}

/** Referencia del proveedor guardada en la oferta: topup:<code>:<denom> o p:<id>. */
function parseRef(ref: string): { gameCode: string | null; denomId: string | null } {
  if (ref.startsWith("topup:")) {
    const [, code = "", denom = ""] = ref.split(":");
    return { gameCode: code || null, denomId: denom || null };
  }
  return { gameCode: null, denomId: null };
}

/**
 * Costo y disponibilidad vigentes de la oferta en el proveedor.
 * Para recargas se busca la denominación por su identificador del catálogo,
 * no por el nombre: el nombre puede cambiar y el identificador no.
 */
async function freshCost(input: {
  gameCode: string | null;
  denomId: string | null;
  offerName: string;
  providerProductId: string;
}): Promise<{ cost: number; available: boolean; offerName: string }> {
  if (input.gameCode) {
    const offers = await gameCatalogue(input.gameCode);
    const match =
      (input.denomId ? offers.find((offer) => String(offer.id) === input.denomId) : undefined) ??
      offers.find((offer) => offer.name === input.offerName);
    if (!match) return { cost: 0, available: false, offerName: input.offerName };
    return { cost: Number(match.amount ?? 0), available: true, offerName: match.name };
  }
  const ref = input.providerProductId.startsWith("p:")
    ? input.providerProductId.slice(2)
    : input.providerProductId;
  const product = await providerProduct(ref);
  if (!product.found) return { cost: 0, available: false, offerName: input.offerName };
  return {
    cost: Number(product.unit_price ?? 0),
    available: product.stock === undefined || Number(product.stock) > 0,
    offerName: input.offerName,
  };
}

export type OrderQuote = {
  productId: string;
  productName: string;
  gameCode: string | null;
  denomId: string | null;
  providerOfferName: string;
  costUsd: number;
  costCup: number;
  priceCup: number;
  profitCup: number;
  available: boolean;
  providerBalance: number;
  balanceOk: boolean;
  priceOk: boolean;
  problem: string | null;
};

/**
 * Comprobación previa al cobro: precio vigente del proveedor, disponibilidad,
 * reglas comerciales de MonStore y saldo del proveedor. No cobra, no compra.
 */
export async function quoteOrder(productId: string): Promise<OrderQuote> {
  const db = await admin();
  const { data: product } = await db
    .from("products")
    .select("id, name, sale_price, active, available, g2bulk_product_id, game_id")
    .eq("id", productId)
    .maybeSingle();
  if (!product) throw new Error("Esta oferta ya no existe.");

  const ref = product.g2bulk_product_id ?? "";
  const parsed = parseRef(ref);
  let gameCode = parsed.gameCode;
  if (!gameCode && product.game_id) {
    const { data: game } = await db
      .from("games")
      .select("g2bulk_id")
      .eq("id", product.game_id)
      .maybeSingle();
    const gameRef = game?.g2bulk_id ?? "";
    if (gameRef.startsWith("game:")) gameCode = gameRef.slice(5);
  }

  const priceCup = Number(product.sale_price);
  const current = await freshCost({
    gameCode,
    denomId: parsed.denomId,
    offerName: product.name,
    providerProductId: ref,
  });
  const { rate, margin } = await pricing(db);
  const costCup = Math.round(current.cost * (rate + margin) * 100) / 100;

  let balance = 0;
  try {
    balance = (await providerBalance()).balance;
  } catch {
    balance = 0;
  }

  const available = Boolean(product.active && product.available && current.available);
  const priceOk = current.available && costCup <= priceCup;
  const balanceOk = balance >= current.cost && current.cost > 0;

  let problem: string | null = null;
  if (!available) problem = "Esta oferta no está disponible en el proveedor ahora mismo.";
  else if (!priceOk)
    problem = "El precio del proveedor cambió: hay que actualizar el precio antes de vender.";
  else if (!balanceOk) problem = "El saldo del proveedor no alcanza para esta recarga.";

  return {
    productId: product.id,
    productName: product.name,
    gameCode,
    denomId: parsed.denomId,
    providerOfferName: current.offerName,
    costUsd: current.cost,
    costCup,
    priceCup,
    profitCup: Math.round((priceCup - costCup) * 100) / 100,
    available,
    providerBalance: balance,
    balanceOk,
    priceOk,
    problem,
  };
}

type OrderRow = Database["public"]["Tables"]["orders"]["Row"];

/**
 * Envía la compra real al proveedor para un pedido ya registrado y cobrado.
 * Repetirla sobre el mismo pedido no genera una segunda compra.
 */
export async function fulfillOrder(
  orderId: string,
  options: { force?: boolean } = {},
): Promise<FulfillResult> {
  const db = await admin();

  const { data: order } = await db
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle<OrderRow>();
  if (!order) throw new Error("No encontramos el pedido.");

  // Idempotencia: si ya hay referencia del proveedor o el pedido está cerrado,
  // se devuelve el resultado existente sin volver a comprar.
  if (order.g2bulk_transaction_id) {
    return {
      status: order.status as FulfillResult["status"],
      reference: order.g2bulk_transaction_id,
      message: "Este pedido ya estaba enviado al proveedor.",
      reused: true,
    };
  }
  if (order.status === "completado" || order.status === "error" || order.status === "reembolsado") {
    return {
      status: order.status as FulfillResult["status"],
      reference: null,
      message: "Este pedido ya estaba resuelto.",
      reused: true,
    };
  }

  if (!providerHasKey() || !(options.force || (await realPurchasesEnabled(db)))) {
    return {
      status: order.status as FulfillResult["status"],
      reference: null,
      message:
        "Tu pedido quedó registrado y el administrador lo completará manualmente. Todavía no se envía al proveedor.",
      reused: true,
    };
  }

  const { data: product } = await db
    .from("products")
    .select("id, name, g2bulk_product_id, game_id")
    .eq("id", order.product_id ?? "")
    .maybeSingle();
  if (!product) throw new Error("La oferta del pedido ya no existe.");

  const parsed = parseRef(product.g2bulk_product_id ?? "");
  let gameCode = parsed.gameCode;
  if (!gameCode && product.game_id) {
    const { data: game } = await db
      .from("games")
      .select("g2bulk_id")
      .eq("id", product.game_id)
      .maybeSingle();
    const ref = game?.g2bulk_id ?? "";
    if (ref.startsWith("game:")) gameCode = ref.slice(5);
  }

  const priceCup = Number(order.total_amount);
  const players = (order.player_data ?? {}) as Record<string, string>;
  const key = order.idempotency_key || order.id;

  const fail = async (reason: string, response: Record<string, unknown> = {}) => {
    await logTransaction(db, {
      orderId: order.id,
      request: { kind: gameCode ? "topup" : "product", game: gameCode, offer: product.name },
      response,
      status: "error",
      reference: null,
      error: reason,
    });
    await db.rpc("refund_wallet_order", { p_order: order.id, p_reason: reason });
    await db.from("orders").update({ status: "error", error_message: reason }).eq("id", order.id);
    return {
      status: "error" as const,
      reference: null,
      message: `${reason} Devolvimos el importe a tu wallet.`,
      reused: false,
    };
  };

  // Costo, disponibilidad y saldo vigentes justo antes de comprar.
  let cost = 0;
  let providerOffer = product.name;
  try {
    const current = await freshCost({
      gameCode,
      denomId: parsed.denomId,
      offerName: product.name,
      providerProductId: product.g2bulk_product_id ?? "",
    });
    if (!current.available) {
      return await fail("Esta oferta no está disponible en el proveedor ahora mismo.");
    }
    cost = current.cost;
    providerOffer = current.offerName;
    // El costo es dato técnico del proveedor: se actualiza sin tocar el precio.
    await db
      .from("products")
      .update({ g2bulk_cost: cost, last_synced_at: new Date().toISOString() })
      .eq("id", product.id);
  } catch (error) {
    return await fail(
      error instanceof ProviderError
        ? error.message
        : "No pudimos comprobar el precio del proveedor.",
    );
  }

  const { rate, margin } = await pricing(db);
  const costCup = Math.round(cost * (rate + margin) * 100) / 100;
  if (costCup > priceCup) {
    return await fail(
      "El precio del proveedor subió y esta recarga ya no se puede completar a ese importe.",
    );
  }

  try {
    const { balance } = await providerBalance();
    if (balance < cost) {
      return await fail("El saldo del proveedor no alcanza para completar esta recarga.");
    }
  } catch (error) {
    return await fail(
      error instanceof ProviderError
        ? error.message
        : "No pudimos comprobar el saldo del proveedor.",
    );
  }

  try {
    let provider: { order_id?: number; transaction_id?: number; status?: string };
    if (gameCode) {
      const body: {
        catalogue_name: string;
        player_id: string;
        server_id?: string;
        charname?: string;
        callback_url?: string;
      } = { catalogue_name: providerOffer, player_id: order.player_id };
      const server = players["server_id"] ?? players["serverid"];
      const charname = players["charname"];
      if (server) body.server_id = server;
      if (charname) body.charname = charname;
      const callback = callbackUrl();
      if (callback) body.callback_url = callback;
      provider = await placeTopUpOrder(gameCode, body, key);
    } else {
      const ref = product.g2bulk_product_id ?? "";
      if (!ref.startsWith("p:")) {
        return await fail("Esta oferta no se puede entregar automáticamente todavía.");
      }
      provider = await purchaseProduct(ref.slice(2), 1, key);
    }

    const reference = String(provider.order_id ?? provider.transaction_id ?? "");
    const outcome = classify(String(provider.status ?? "pending"));

    await logTransaction(db, {
      orderId: order.id,
      request: { kind: gameCode ? "topup" : "product", game: gameCode, offer: providerOffer },
      response: provider as Record<string, unknown>,
      status: outcome,
      reference: reference || null,
    });

    if (outcome === "failed") {
      return await fail(
        "El proveedor rechazó la recarga.",
        provider as Record<string, unknown>,
      );
    }

    const done = outcome === "done";
    await db
      .from("orders")
      .update({
        status: done ? "completado" : "procesando",
        g2bulk_transaction_id: reference || null,
        completed_at: done ? new Date().toISOString() : null,
      })
      .eq("id", order.id);

    await auditPurchase(db, {
      orderId: order.id,
      userId: order.user_id,
      action: "compra_proveedor",
      note: done
        ? "Compra real entregada por el proveedor."
        : "Compra real enviada al proveedor; pendiente de confirmación.",
      costUsd: cost,
      costCup,
      priceCup,
      reference: reference || null,
      status: done ? "completado" : "procesando",
    });

    return {
      status: done ? "completado" : "procesando",
      reference: reference || null,
      message: done
        ? "Recarga entregada."
        : "El proveedor está procesando la recarga. Te avisaremos cuando termine.",
      reused: false,
    };
  } catch (error) {
    // Un fallo de red DESPUÉS de enviar la orden no puede provocar otra compra:
    // el pedido queda en revisión y la reconciliación decide el resultado.
    if (error instanceof ProviderError && error.status === 0) {
      await logTransaction(db, {
        orderId: order.id,
        request: { kind: gameCode ? "topup" : "product", game: gameCode, offer: providerOffer },
        response: {},
        status: "unknown",
        reference: null,
        error: "Sin respuesta del proveedor.",
      });
      await db
        .from("orders")
        .update({
          status: "procesando",
          error_message: "Sin respuesta del proveedor; pendiente de comprobación.",
        })
        .eq("id", order.id);
      return {
        status: "procesando",
        reference: null,
        message:
          "No recibimos respuesta del proveedor. Estamos comprobando tu recarga; no se hará una segunda compra.",
        reused: false,
      };
    }
    return await fail(
      error instanceof ProviderError
        ? error.message
        : "El proveedor no pudo completar la recarga.",
    );
  }
}

/** Consulta el estado real de un pedido usando el camino oficial del proveedor. */
async function statusOf(
  db: Admin,
  order: { id: string; product_id: string | null; g2bulk_transaction_id: string },
): Promise<{ status: string; found: boolean }> {
  const { data: product } = await db
    .from("products")
    .select("g2bulk_product_id, game_id")
    .eq("id", order.product_id ?? "")
    .maybeSingle();
  const parsed = parseRef(product?.g2bulk_product_id ?? "");
  let gameCode = parsed.gameCode;
  if (!gameCode && product?.game_id) {
    const { data: game } = await db
      .from("games")
      .select("g2bulk_id")
      .eq("id", product.game_id)
      .maybeSingle();
    const ref = game?.g2bulk_id ?? "";
    if (ref.startsWith("game:")) gameCode = ref.slice(5);
  }
  if (gameCode) {
    const result = await topUpOrderStatus(gameCode, order.g2bulk_transaction_id);
    return { status: result.status, found: result.found };
  }
  const result = await providerOrderStatus(order.g2bulk_transaction_id);
  return { status: result.status, found: result.found };
}

/**
 * Reconciliación: consulta el estado real de un pedido que quedó procesando y
 * lo cierra una sola vez. Segura si se repite y si el webhook llegó antes.
 */
export async function reconcileOrder(orderId: string): Promise<FulfillResult> {
  const db = await admin();
  const { data: order } = await db
    .from("orders")
    .select("id, status, user_id, product_id, total_amount, g2bulk_transaction_id")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) throw new Error("No encontramos el pedido.");

  if (order.status !== "procesando" || !order.g2bulk_transaction_id) {
    return {
      status: order.status as FulfillResult["status"],
      reference: order.g2bulk_transaction_id ?? null,
      message: "Este pedido no necesita reconciliación.",
      reused: true,
    };
  }

  const result = await statusOf(db, {
    id: order.id,
    product_id: order.product_id,
    g2bulk_transaction_id: order.g2bulk_transaction_id,
  });
  const outcome = classify(result.status);

  if (outcome === "done") {
    await db
      .from("orders")
      .update({ status: "completado", completed_at: new Date().toISOString() })
      .eq("id", order.id)
      .eq("status", "procesando");
    await db.from("notifications").insert({
      user_id: order.user_id,
      title: "Recarga entregada",
      message: "El proveedor confirmó la entrega de tu recarga.",
      type: "pedido",
      read: false,
      dedupe_key: `order-done-${order.id}`,
    });
    return {
      status: "completado",
      reference: order.g2bulk_transaction_id,
      message: "Recarga entregada.",
      reused: false,
    };
  }

  if (outcome === "failed") {
    const reason = "El proveedor no pudo completar la recarga.";
    // El reembolso es idempotente en la base de datos: nunca devuelve dos veces.
    await db.rpc("refund_wallet_order", { p_order: order.id, p_reason: reason });
    await db
      .from("orders")
      .update({ status: "error", error_message: reason })
      .eq("id", order.id)
      .eq("status", "procesando");
    await db.from("notifications").insert({
      user_id: order.user_id,
      title: "Recarga no entregada",
      message: "El proveedor no pudo completar tu recarga. Te devolvimos el importe.",
      type: "pedido",
      read: false,
      dedupe_key: `order-failed-${order.id}`,
    });
    return { status: "error", reference: order.g2bulk_transaction_id, message: reason, reused: false };
  }

  return {
    status: "procesando",
    reference: order.g2bulk_transaction_id,
    message: "El proveedor sigue procesando la recarga.",
    reused: false,
  };
}

/** Cierra todos los pedidos que quedaron procesando. Ideal para el cron. */
export async function reconcilePending(limit = 25): Promise<{
  checked: number;
  completed: number;
  failed: number;
  pending: number;
}> {
  const db = await admin();
  const { data } = await db
    .from("orders")
    .select("id")
    .eq("status", "procesando")
    .not("g2bulk_transaction_id", "is", null)
    .order("created_at", { ascending: true })
    .limit(Math.max(1, Math.min(limit, 100)));

  let completed = 0;
  let failed = 0;
  let pending = 0;
  for (const row of data ?? []) {
    try {
      const result = await reconcileOrder(row.id);
      if (result.status === "completado") completed += 1;
      else if (result.status === "error") failed += 1;
      else pending += 1;
    } catch {
      pending += 1;
    }
  }
  return { checked: (data ?? []).length, completed, failed, pending };
}
