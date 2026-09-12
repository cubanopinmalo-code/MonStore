import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { UserShell } from "@/components/layout/UserShell";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusBadge } from "@/components/common/StatusBadge";
import { CardListSkeleton, EmptyState, ErrorState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { useOrders } from "@/hooks/useAccount";
import { formatCUP, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/pedidos/")({
  head: () => ({
    meta: [
      { title: "Mis pedidos — MONSTORE" },
      { name: "description", content: "Historial de tus recargas y su estado." },
    ],
  }),
  component: OrdersPage,
});

const FILTERS = [
  "todos",
  "pendiente",
  "procesando",
  "completado",
  "error",
  "reembolsado",
  "cancelado",
] as const;

function OrdersPage() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("todos");
  const { data, isLoading, isError, refetch } = useOrders(100);

  const orders = (data ?? []).filter(
    (order) => filter === "todos" || order.status === filter,
  );

  return (
    <UserShell>
      <div className="space-y-6">
        <PageHeader title="Mis pedidos" description="Consulta el estado de cada recarga." />

        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {FILTERS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setFilter(item)}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5 text-xs capitalize transition-colors",
                filter === item
                  ? "border-primary/50 bg-primary/12 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {item}
            </button>
          ))}
        </div>

        {isLoading ? (
          <CardListSkeleton items={3} />
        ) : isError ? (
          <ErrorState onRetry={() => void refetch()} />
        ) : orders.length === 0 ? (
          <EmptyState
            title="No tienes pedidos todavía"
            description="Cuando compres una recarga aparecerá aquí."
            action={
              <Button asChild size="sm">
                <Link to="/app/recargas">Hacer una recarga</Link>
              </Button>
            }
          />
        ) : (
          <div className="grid gap-2">
            {orders.map((order) => (
              <Link
                key={order.id}
                to="/app/pedidos/$id"
                params={{ id: order.id }}
                className="surface-card flex items-center justify-between gap-3 p-4 transition-colors hover:border-primary/40"
              >
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-semibold">{order.products?.name ?? "Recarga"}</p>
                  <p className="text-xs text-muted-foreground">
                    {order.games?.name ?? "—"} · {order.code}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(order.created_at)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <span className="text-sm font-semibold">{formatCUP(order.total_amount)}</span>
                  <StatusBadge status={order.status} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </UserShell>
  );
}
