import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

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
    product_name: nestedName(row.products),
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

    for (const field of fieldsOf(product.metadata)) {
      if (!data.player_data[field]?.trim()) {
        throw new Error(`Falta el dato «${field}» que pide esta oferta.`);
      }
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const placed = await supabaseAdmin.rpc("place_wallet_order", {
      p_user: userId,
      p_product: data.product_id,
      p_player_id: data.player_id,
      p_player_data: data.player_data,
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
      .select("id, code, status, total_amount, g2bulk_transaction_id, product_id")
      .eq("id", result.order_id)
      .maybeSingle();
    if (!order) throw new Error("No se pudo registrar tu pedido.");

    if (order.g2bulk_transaction_id || order.status === "completado") {
      return {
        order_id: order.id,
        code: order.code,
        status: order.status,
        total: Number(order.total_amount),
        balance: result.balance ?? null,
        message: "Este pedido ya estaba registrado.",
      };
    }

    let gameCode: string | null = null;
    if (product.game_id) {
      const { data: game } = await supabaseAdmin
        .from("games")
        .select("g2bulk_id")
        .eq("id", product.game_id)
        .maybeSingle();
      const ref = game?.g2bulk_id ?? "";
      if (ref.startsWith("game:")) gameCode = ref.slice(5);
    }

    const { providerHasKey, purchaseProduct, placeTopUpOrder, ProviderError } = await import(
      "./g2bulk.server"
    );

    if (!providerHasKey()) {
      return {
        order_id: order.id,
        code: order.code,
        status: order.status,
        total: Number(order.total_amount),
        balance: result.balance ?? null,
        message:
          "Tu pedido quedó registrado y el saldo ya fue descontado. El administrador lo completará manualmente.",
      };
    }

    try {
      let provider: { order_id?: number; transaction_id?: number; status?: string };
      if (gameCode) {
        provider = await placeTopUpOrder(
          gameCode,
          {
            catalogue_name: product.name,
            player_id: data.player_id,
            server_id: data.player_data["server_id"] ?? undefined,
            charname: data.player_data["charname"] ?? undefined,
          },
          data.idempotency_key,
        );
      } else {
        const ref = product.g2bulk_product_id ?? "";
        if (!ref.startsWith("p:")) {
          throw new ProviderError("Esta oferta no se puede entregar automáticamente todavía.");
        }
        provider = await purchaseProduct(ref.slice(2), 1, data.idempotency_key);
      }

      const reference = String(provider.order_id ?? provider.transaction_id ?? "");
      const done = String(provider.status ?? "").toUpperCase() === "COMPLETED";

      await supabaseAdmin
        .from("orders")
        .update({
          status: done ? "completado" : "procesando",
          g2bulk_transaction_id: reference || null,
          completed_at: done ? new Date().toISOString() : null,
        })
        .eq("id", order.id);

      return {
        order_id: order.id,
        code: order.code,
        status: done ? "completado" : "procesando",
        total: Number(order.total_amount),
        balance: result.balance ?? null,
        message: done
          ? "Recarga entregada."
          : "El proveedor está procesando la recarga. Te avisaremos cuando termine.",
      };
    } catch (failure) {
      const reason =
        failure instanceof ProviderError
          ? failure.message
          : "El proveedor no pudo completar la recarga.";

      await supabaseAdmin.rpc("refund_wallet_order", {
        p_order: order.id,
        p_reason: reason,
      });
      await supabaseAdmin
        .from("orders")
        .update({ status: "error", error_message: reason })
        .eq("id", order.id);

      return {
        order_id: order.id,
        code: order.code,
        status: "error",
        total: Number(order.total_amount),
        balance: null,
        message: `${reason} Devolvimos el importe a tu wallet.`,
      };
    }
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
    return toList([row])[0];
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
      .select("*, products(name), games(name), profiles!orders_user_id_fkey(phone)")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error("No se pudieron cargar los pedidos.");
    return (data ?? []).map((row) => ({
      ...toList([row])[0],
      user_phone: (row.profiles as { phone?: string } | null)?.phone ?? "",
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
