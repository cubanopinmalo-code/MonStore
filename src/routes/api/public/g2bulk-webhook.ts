/**
 * Aviso del proveedor cuando una recarga termina.
 *
 * - Si hay una firma compartida configurada, se exige; si no, se acepta el
 *   aviso pero nunca se confía en su contenido.
 * - No se confía en el estado recibido: se vuelve a consultar al proveedor.
 * - Repetir el aviso no cambia dos veces el pedido ni devuelve dinero dos veces.
 * - Se responde 2xx en cuanto el aviso queda aceptado.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/g2bulk-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.text();
        const secret = process.env["G2BULK_WEBHOOK_SECRET"];

        if (secret) {
          const provided =
            request.headers.get("x-webhook-secret") ??
            /^Bearer ([^\s,]+)$/.exec(request.headers.get("authorization") ?? "")?.[1] ??
            "";
          const { createHash, timingSafeEqual } = await import("node:crypto");
          const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();
          if (!provided || !timingSafeEqual(digest(provided), digest(secret))) {
            return new Response("Unauthorized", { status: 401 });
          }
        }

        let payload: Record<string, unknown> = {};
        try {
          payload = JSON.parse(body) as Record<string, unknown>;
        } catch {
          return new Response("Invalid body", { status: 400 });
        }
        if (typeof payload !== "object" || payload === null) {
          return new Response("Invalid body", { status: 400 });
        }

        const reference = String(
          payload["order_id"] ?? payload["transaction_id"] ?? payload["id"] ?? "",
        );
        if (!reference) return new Response("Missing order", { status: 400 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: order } = await supabaseAdmin
          .from("orders")
          .select("id, status")
          .eq("g2bulk_transaction_id", reference)
          .maybeSingle();
        // Aviso de un pedido que no es nuestro o ya cerrado: se acepta y se ignora.
        if (!order) return new Response("ok", { status: 200 });
        if (order.status !== "procesando") {
          return Response.json({ received: true, status: order.status });
        }

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
