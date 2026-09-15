import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { translateOfferName } from "./offerName";

type OrderRow = Database["public"]["Tables"]["orders"]["Row"];
type Client = SupabaseClient<Database>;

export type PlaceOrderInput = {
  product_id: string;
  player_id: string;
  player_data: Record<string, string>;
  idempotency_key: string;
};

export type PlaceOrderResult = {
  order_id: string;
  code: string;
  status: string;
  total: number;
  balance: number | null;
  message: string;
};

export type OrderListItem = OrderRow & {
  product_name: string;
  game_name: string;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fieldsOf(metadata: unknown): string[] {
  const meta = metadata as { fields?: unknown } | null;
  return Array.isArray(meta?.fields) ? (meta?.fields as unknown[]).map(String) : [];
}

async function requireAdmin({ supabase, userId }: { supabase: Client; userId: string }) {
  const { data, error } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (error) throw new Error("No se pudo verificar tu permiso de administración.");
  if (!data) throw new Error("Solo el administrador puede usar esta función.");
}

function nestedName(value: unknown): string {
  const row = value as { name?: string } | null;
  return row?.name ?? "";
}

function toList(items: Array<OrderRow & { products?: unknown; games?: unknown }>): OrderListItem[] {
  return items.map((row) => ({
    ...row,
    product_name: translateOfferName(nestedName(row.products)),
    game_name: nestedName(row.games),
  }));
}

/* ------------------------------------------------------------------ *
 * Compra con saldo
 * ------------------------------------------------------------------ */

export const placeOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: PlaceOrderInput) => {
    const playerId = String(data?.player_id ?? "").trim().slice(0, 120);
    const key = String(data?.idempotency_key ?? "").trim();
    if (!data?.product_id) throw new Error("No se indicó la oferta.");
    if (!UUID_PATTERN.test(key)) throw new Error("No se pudo preparar el pedido. Inténtalo otra vez.");
    if (!playerId) throw new Error("Escribe el identificador de tu cuenta en el juego.");
    const values: Record<string, string> = {};
    for (const [field, value] of Object.entries(data?.player_data ?? {})) {
      values[String(field).slice(0, 40)] = String(value ?? "").trim().slice(0, 200);
    }
    return {
      product_id: String(data.product_id),
      player_id: playerId,
      player_data: values,
      idempotency_key: key,
    };
  })
  .handler(async ({ data, context }): Promise<PlaceOrderResult> => {
    const { supabase, userId } = context;

    const { data: product, error } = await supabase
      .from("products")
      .select(
        "id, name, sale_price, active, available, metadata, delivery_method, game_id, g2bulk_product_id",
      )
      .eq("id", data.product_id)
      .maybeSingle();
    if (error) throw new Error("No se pudo comprobar esta oferta.");
    if (!product) throw new Error("Esta oferta ya no está disponible.");

    // Cada juego pide sus propios datos: se exige exactamente lo que el
    // proveedor declaró para esa oferta, con los nombres equivalentes aceptados.
    const values = data.player_data;
    const valueOf = (field: string): string => {
      const alias =
        field === "userid" || field === "user_id"
          ? ["userid", "user_id", "player_id", "uid"]
          : field === "serverid" || field === "server_id"
            ? ["serverid", "server_id", "zoneid", "zone_id"]
            : [field];
      for (const key of alias) {
        const value = values[key]?.trim();
        if (value) return value;
      }
      if (alias.includes("userid")) return data.player_id;
      return "";
    };
    const fields = fieldsOf(product.metadata);
    for (const field of fields) {
      const value = valueOf(field);
      if (!value) throw new Error(`Falta el dato «${field}» que pide esta oferta.`);
      values[field] = value;
    }
    if (values["serverid"] && !values["server_id"]) values["server_id"] = values["serverid"];

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { fulfillOrder, quoteOrder, realPurchasesEnabled } = await import(
      "./g2bulk-orders.server"
    );

    // Interruptor del panel: con las compras reales apagadas no se cobra nada
    // ni se crea ningún pedido, aunque el catálogo siga visible.
    if (!(await realPurchasesEnabled())) {
      throw new Error(
        "Las recargas están pausadas ahora mismo. Vuelve a intentarlo en unos minutos.",
      );
    }

    // Comprobación previa al cobro: precio vigente, disponibilidad y saldo del
    // proveedor. Si algo no cuadra, no se cobra ni se crea el pedido.
    const quote = await quoteOrder(data.product_id);
    if (quote.problem) throw new Error(quote.problem);

    // Validación del jugador antes de cobrar, cuando el juego la admite.
    if (quote.gameCode) {
      const { checkPlayerId } = await import("./g2bulk.server");
      try {
        const body: { game: string; user_id: string; server_id?: string; charname?: string } = {
          game: quote.gameCode,
          user_id: data.player_id,
        };
        const server = values["serverid"] ?? values["server_id"];
        if (server) body.server_id = server;
        if (values["charname"]) body.charname = values["charname"];
        const check = await checkPlayerId(body);
        const flag = check.valid.toLowerCase();
        if (!["valid", "true", "1", "ok"].includes(flag)) {
          throw new Error(
            "No encontramos una cuenta con esos datos. Compruébalos antes de continuar.",
          );
        }
        if (check.name) values["player_name"] = check.name;
      } catch (error) {
        throw new Error(
          error instanceof Error
            ? error.message
            : "No pudimos comprobar tu cuenta del juego ahora mismo.",
        );
      }
    }

    // El pedido se registra con la sesión del propio cliente: la función valida auth.uid().
    const placed = await supabase.rpc("place_wallet_order", {
      p_user: userId,
      p_product: data.product_id,
      p_player_id: data.player_id,
      p_player_data: values,
      p_idempotency_key: data.idempotency_key,
    });
    if (placed.error) throw new Error(placed.error.message);

    const result = (placed.data ?? {}) as {
      order_id?: string;
      code?: string;
      total?: number;
      balance?: number;
      duplicated?: boolean;
    };
    if (!result.order_id) throw new Error("No se pudo registrar tu pedido.");

    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id, code, status, total_amount")
      .eq("id", result.order_id)
      .maybeSingle();
    if (!order) throw new Error("No se pudo registrar tu pedido.");

    // Todo lo demás (costo vigente, disponibilidad, compra real, idempotencia,
    // reembolso y registro) lo decide el servidor en un solo camino.
    const outcome = await fulfillOrder(order.id);


    return {
      order_id: order.id,
      code: order.code,
      status: outcome.status,
      total: Number(order.total_amount),
      balance: outcome.status === "error" ? null : result.balance ?? null,
      message: outcome.message,
    };
  });

/**
 * Reconciliación manual del administrador para un pedido que quedó procesando.
 * Consulta el estado real en el proveedor; nunca vuelve a comprar.
 */
export const reconcileProviderOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => {
    if (!data?.id) throw new Error("Falta el pedido.");
    return { id: String(data.id) };
  })
  .handler(async ({ data, context }): Promise<{ status: string; message: string }> => {
    await requireAdmin(context);
    const { reconcileOrder } = await import("./g2bulk-orders.server");
    const result = await reconcileOrder(data.id);
    return { status: result.status, message: result.message };
  });

/* ------------------------------------------------------------------ *
 * Pedidos del cliente
 * ------------------------------------------------------------------ */

export const listMyOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<OrderListItem[]> => {
    const { data, error } = await context.supabase
      .from("orders")
      .select("*, products(name), games(name)")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error("No se pudieron cargar tus pedidos.");
    return toList(data ?? []);
  });

export const getMyOrder = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => {
    if (!data?.id) throw new Error("Falta el pedido.");
    return { id: String(data.id) };
  })
  .handler(async ({ data, context }): Promise<OrderListItem | null> => {
    const { data: row, error } = await context.supabase
      .from("orders")
      .select("*, products(name), games(name)")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error("No se pudo cargar este pedido.");
    if (!row) return null;
    return (toList([row])[0] ?? null) as OrderListItem | null;
  });

/* ------------------------------------------------------------------ *
 * Panel de administración
 * ------------------------------------------------------------------ */

export const listOrdersAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Array<OrderListItem & { user_phone: string }>> => {
    await requireAdmin(context);
    const { data, error } = await context.supabase
      .from("orders")
      .select("*, products(name), games(name)")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error("No se pudieron cargar los pedidos.");

    const rows = data ?? [];
    const phones = new Map<string, string>();
    const userIds = [...new Set(rows.map((row) => row.user_id))];
    if (userIds.length > 0) {
      const { data: people } = await context.supabase
        .from("profiles")
        .select("id, phone")
        .in("id", userIds);
      for (const person of people ?? []) phones.set(person.id, person.phone);
    }

    return rows.map((row) => ({
      ...(toList([row as unknown as OrderRow & { products?: unknown; games?: unknown }])[0] as
        OrderListItem),
      user_phone: phones.get(row.user_id) ?? "",
    }));
  });

export const setOrderStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; status: "completado" | "cancelado" | "procesando" }) => {
    if (!data?.id) throw new Error("Falta el pedido.");
    if (!["completado", "cancelado", "procesando"].includes(data.status)) {
      throw new Error("Estado no válido.");
    }
    return { id: String(data.id), status: data.status };
  })
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("orders")
      .update({
        status: data.status,
        completed_at: data.status === "completado" ? new Date().toISOString() : null,
      })
      .eq("id", data.id);
    if (error) throw new Error("No se pudo actualizar el pedido.");
    return { ok: true };
  });

export const refundOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; reason?: string }) => {
    if (!data?.id) throw new Error("Falta el pedido.");
    return { id: String(data.id), reason: String(data?.reason ?? "").trim().slice(0, 200) };
  })
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: result, error } = await supabaseAdmin.rpc("refund_wallet_order", {
      p_order: data.id,
      p_reason: data.reason || "Reembolso manual del administrador.",
    });
    if (error) throw new Error(error.message);
    const refunded = Boolean((result as { refunded?: boolean } | null)?.refunded);
    return { refunded };
  });
