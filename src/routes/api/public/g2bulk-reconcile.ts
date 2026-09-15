/**
 * Reconciliación programada: cierra los pedidos que quedaron procesando
 * consultando su estado real en el proveedor. Nunca vuelve a comprar.
 */
import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/public/g2bulk-reconcile")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;

        const { reconcilePending } = await import("@/lib/g2bulk-orders.server");
        try {
          const result = await reconcilePending(25);
          return Response.json(result);
        } catch {
          return new Response("Retry later", { status: 500 });
        }
      },
    },
  },
});
