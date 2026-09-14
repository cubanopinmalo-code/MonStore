import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import { UserShell } from "@/components/layout/UserShell";
import { StatusBadge } from "@/components/common/StatusBadge";
import { CardListSkeleton, EmptyState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { formatCUP, formatDateTime } from "@/lib/format";
import { deliveryLabel } from "@/lib/delivery";

export const Route = createFileRoute("/_authenticated/app/pedidos/$id")({
  head: () => ({
    meta: [
      { title: "Pedido — MONSTORE" },
      { name: "description", content: "Detalle completo de tu pedido." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OrderDetailPage,
});

function useOrder(id: string) {
  return useQuery({
    queryKey: ["order", id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, code, status, player_id, player_data, unit_price, total_amount, payment_method, g2bulk_transaction_id, error_message, created_at, products(name, delivery_method), games(name)",
        )
        .or(`id.eq.${id},code.eq.${id}`)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

function OrderDetailPage() {
  const { id } = Route.useParams();
  const { data: order, isLoading } = useOrder(id);

  if (isLoading) {
    return (
      <UserShell>
        <CardListSkeleton items={2} />
      </UserShell>
    );
  }

  if (!order) {
    return (
      <UserShell>
        <EmptyState
          title="Pedido no encontrado"
          description="Puede que el enlace no sea correcto."
          action={
            <Button asChild variant="outline" size="sm">
              <Link to="/app/pedidos">Ver mis pedidos</Link>
            </Button>
          }
        />
      </UserShell>
    );
  }

  const playerData = (order.player_data ?? {}) as Record<string, unknown>;

  return (
    <UserShell>
      <div className="mx-auto max-w-2xl space-y-5">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="icon">
            <Link to="/app/pedidos" aria-label="Volver a pedidos">
              <ChevronLeft className="size-5" aria-hidden="true" />
            </Link>
          </Button>
          <div>
            <h1 className="text-xl font-bold">Pedido {order.code}</h1>
            <p className="text-xs text-muted-foreground">{formatDateTime(order.created_at)}</p>
          </div>
          <div className="ml-auto">
            <StatusBadge status={order.status} />
          </div>
        </div>

        <section className="surface-card space-y-2 p-5 text-sm">
          <h2 className="text-base font-semibold">Detalle</h2>
          <Row label="Juego" value={order.games?.name ?? "—"} />
          <Row label="Producto" value={order.products?.name ?? "—"} />
          <Row
            label="Método de entrega"
            value={deliveryLabel(order.products?.delivery_method)}
          />
          <Row label="Precio unitario" value={formatCUP(order.unit_price)} />
          <Row label="Total" value={formatCUP(order.total_amount)} />
          <Row
            label="Método de pago"
            value={order.payment_method === "wallet" ? "Wallet" : String(order.payment_method)}
          />
        </section>

        <section className="surface-card space-y-2 p-5 text-sm">
          <h2 className="text-base font-semibold">Datos utilizados</h2>
          <Row label="ID de jugador" value={order.player_id} />
          {Object.entries(playerData).map(([key, value]) => (
            <Row key={key} label={key} value={String(value)} />
          ))}
        </section>

        <section className="surface-card space-y-2 p-5 text-sm">
          <h2 className="text-base font-semibold">Entrega</h2>
          <Row label="Referencia del proveedor" value={order.g2bulk_transaction_id ?? "Pendiente"} />
          {order.error_message ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
              {order.error_message}
            </p>
          ) : null}
        </section>
      </div>
    </UserShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/60 py-1.5 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
