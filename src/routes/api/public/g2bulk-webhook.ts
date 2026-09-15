/**
 * Aviso del proveedor cuando una recarga termina.
 *
 * - Solo se acepta con la firma compartida guardada en el backend.
 * - No se confía en el estado recibido: se vuelve a consultar al proveedor.
 * - Repetir el aviso no cambia dos veces el pedido ni devuelve dinero dos veces.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/g2bulk-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["G2BULK_WEBHOOK_SECRET"];
        if (!secret) return new Response("Not configured", { status: 503 });

        const body = await request.text();
        const provided =
          request.headers.get("x-webhook-secret") ??
          /^Bearer ([^\s,]+)$/.exec(request.headers.get("authorization") ?? "")?.[1] ??
          "";

        const { createHash, timingSafeEqual } = await import("node:crypto");
        const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();
        if (!provided || !timingSafeEqual(digest(provided), digest(secret))) {
          return new Response("Unauthorized", { status: 401 });
        }

        let payload: Record<string, unknown> = {};
        try {
          payload = JSON.parse(body) as Record<string, unknown>;
        } catch {
          return new Response("Invalid body", { status: 400 });
        }

        const reference = String(
          payload["order_id"] ?? payload["transaction_id"] ?? payload["id"] ?? "",
        );
        if (!reference) return new Response("Missing order", { status: 400 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: order } = await supabaseAdmin
          .from("orders")
          .select("id")
          .eq("g2bulk_transaction_id", reference)
          .maybeSingle();
        if (!order) return new Response("ok", { status: 200 });

        const { reconcileOrder } = await import("@/lib/g2bulk-orders.server");
        try {
          const result = await reconcileOrder(order.id);
          return Response.json({ received: true, status: result.status });
        } catch {
          return new Response("Retry later", { status: 500 });
        }
      },
    },
  },
});
