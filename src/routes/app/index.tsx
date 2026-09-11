import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Gamepad2, Plus, Store, Wallet } from "lucide-react";
import { UserShell } from "@/components/layout/UserShell";
import { StatusBadge } from "@/components/common/StatusBadge";
import { ProtectedNotice } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { mockWallet } from "@/data/mock/wallet";
import { mockOrders } from "@/data/mock/orders";
import { mockGames } from "@/data/mock/games";
import { mockProducts } from "@/data/mock/products";
import { formatCUP, formatDate } from "@/lib/format";

export const Route = createFileRoute("/app/")({
  head: () => ({
    meta: [
      { title: "Mi cuenta — MONSTORE" },
      { name: "description", content: "Resumen de tu wallet, pedidos y accesos rápidos." },
    ],
  }),
  component: UserHome,
});

const SHORTCUTS = [
  { to: "/app/recargas", label: "Recargar", icon: Gamepad2 },
  { to: "/app/wallet/depositar", label: "Agregar saldo", icon: Plus },
  { to: "/app/comercio", label: "Comercio", icon: Store },
] as const;

function UserHome() {
  const orders = mockOrders.filter((order) => order.user_id === "us_001").slice(0, 3);

  return (
    <UserShell>
      <div className="space-y-6">
        <h1 className="sr-only">Tu panel en MONSTORE</h1>
        <ProtectedNotice area="el área de usuario" />


        <section className="surface-card relative overflow-hidden p-5 glow-ring">
          <div
            className="pointer-events-none absolute inset-0 opacity-60"
            style={{ background: "var(--gradient-surface)" }}
            aria-hidden="true"
          />
          <div className="relative space-y-1">
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Wallet className="size-4" aria-hidden="true" /> Saldo disponible
            </p>
            <p className="font-display text-3xl font-bold">{formatCUP(mockWallet.balance)}</p>
            <div className="flex flex-wrap gap-2 pt-3">
              <Button asChild size="sm">
                <Link to="/app/wallet/depositar">Agregar fondos</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link to="/app/wallet">Ver movimientos</Link>
              </Button>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-3 gap-3">
          {SHORTCUTS.map((shortcut) => (
            <Link
              key={shortcut.to}
              to={shortcut.to}
              className="surface-card flex flex-col items-center gap-2 p-4 text-center text-sm transition-colors hover:border-primary/40"
            >
              <shortcut.icon className="size-5 text-primary" aria-hidden="true" />
              {shortcut.label}
            </Link>
          ))}
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">🎮 Eventos actuales</h2>
            <Link to="/app/eventos" className="flex items-center gap-1 text-sm text-primary">
              Ver todos <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {currentEvents.map((event) => (
              <EventCard key={event.id} eventId={event.id} />
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">Últimos pedidos</h2>
            <Link to="/app/pedidos" className="flex items-center gap-1 text-sm text-primary">
              Ver todos <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
          <div className="grid gap-2">
            {orders.map((order) => {
              const product = mockProducts.find((item) => item.id === order.product_id);
              const game = mockGames.find((item) => item.id === order.game_id);
              return (
                <Link
                  key={order.id}
                  to="/app/pedidos/$id"
                  params={{ id: order.id }}
                  className="surface-card flex items-center justify-between gap-3 p-4"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {product?.name} · {game?.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {order.code} · {formatDate(order.created_at)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-sm font-semibold">{formatCUP(order.total_amount)}</span>
                    <StatusBadge status={order.status} />
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      </div>
    </UserShell>
  );
}
