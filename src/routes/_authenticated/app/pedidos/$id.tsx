import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { UserShell } from "@/components/layout/UserShell";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { mockApiTransactions, mockOrders } from "@/data/mock/orders";
import { mockGames } from "@/data/mock/games";
import { mockProducts } from "@/data/mock/products";
import { formatCUP, formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/app/pedidos/$id")({
  loader: ({ params }) => {
    const order = mockOrders.find((item) => item.id === params.id || item.code === params.id);
    if (!order) throw notFound();
    return {
      order,
      product: mockProducts.find((item) => item.id === order.product_id) ?? null,
      game: mockGames.find((item) => item.id === order.game_id) ?? null,
      apiTx: mockApiTransactions.filter((tx) => tx.order_id === order.id),
    };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData ? `Pedido ${loaderData.order.code} — MONSTORE` : "Pedido — MONSTORE" },
      { name: "description", content: "Detalle completo de tu pedido." },
      { name: "robots", content: "noindex" },
    ],
  }),
  errorComponent: () => (
    <UserShell>
      <p className="text-sm text-muted-foreground">No pudimos cargar este pedido.</p>
    </UserShell>
  ),
  notFoundComponent: () => (
    <UserShell>
      <p className="text-sm text-muted-foreground">Pedido no encontrado.</p>
    </UserShell>
  ),
  component: OrderDetailPage,
});

function OrderDetailPage() {
  const { order, product, game, apiTx } = Route.useLoaderData();

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
          <Row label="Juego" value={game?.name ?? "—"} />
          <Row label="Producto" value={product?.name ?? "—"} />
          <Row
            label="Método de entrega"
            value={product?.delivery_method === "via_cuenta" ? "Por cuenta" : "Por ID"}
          />
          <Row label="Precio unitario" value={formatCUP(order.unit_price)} />
          <Row label="Total" value={formatCUP(order.total_amount)} />
          <Row label="Método de pago" value={order.payment_method === "wallet" ? "Wallet" : order.payment_method} />
        </section>

        <section className="surface-card space-y-2 p-5 text-sm">
          <h2 className="text-base font-semibold">Datos utilizados</h2>
          {Object.entries(order.player_data).map(([key, value]) => (
            <Row key={key} label={key} value={value} />
          ))}
        </section>

        <section className="surface-card space-y-2 p-5 text-sm">
          <h2 className="text-base font-semibold">Proveedor</h2>
          <Row label="ID de transacción" value={order.g2bulk_transaction_id ?? "Pendiente"} />
          <Row
            label="Respuesta"
            value={apiTx.length > 0 ? (apiTx[0]!.status === "ok" ? "Correcta" : "Con error") : "Sin registros"}
          />
          {order.error_message ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
              {order.error_message}
            </p>
          ) : null}
          <p className="text-[11px] text-muted-foreground">
            La conexión real con el proveedor se añadirá en una fase posterior, siempre desde el
            servidor.
          </p>
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
