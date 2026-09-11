import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Gamepad2, Gift, Plus, Store, Wallet } from "lucide-react";
import { UserShell } from "@/components/layout/UserShell";
import { StatusBadge } from "@/components/common/StatusBadge";
import { GameCover } from "@/components/common/GameCover";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/hooks/useAccount";
import { listCatalogGames } from "@/lib/catalog.functions";
import { giftCardImage, isGiftCard } from "@/lib/giftcards";

import { mockOrders } from "@/data/mock/orders";
import { mockGames } from "@/data/mock/games";
import { mockProducts } from "@/data/mock/products";
import { mockEvents } from "@/data/mock/events";
import { EventCard } from "@/components/events/EventCard";
import { formatCUP, formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/app/")({
  loader: () => listCatalogGames(),
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
  { to: "/app/tarjetas", label: "Tarjetas", icon: Gift },
  { to: "/app/wallet/depositar", label: "Agregar saldo", icon: Plus },
  { to: "/app/comercio", label: "Comercio", icon: Store },
] as const;

function UserHome() {
  const { data: wallet } = useWallet();
  const catalog = Route.useLoaderData();
  const giftCards = catalog.filter((game) => isGiftCard(game)).slice(0, 6);
  const orders = mockOrders.filter((order) => order.user_id === "us_001").slice(0, 3);
  const currentEvents = mockEvents
    .filter((event) => event.status !== "finalizado" && event.status !== "cancelado")
    .slice(0, 3);

  return (
    <UserShell>
      <div className="space-y-6">
        <h1 className="sr-only">Tu panel en MONSTORE</h1>

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
            <p className="font-display text-3xl font-bold">
              {formatCUP(Number(wallet?.balance ?? 0))}
            </p>

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

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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

        {giftCards.length > 0 ? (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">🎁 Tarjetas de regalo</h2>
              <Link to="/app/tarjetas" className="flex items-center gap-1 text-sm text-primary">
                Ver todas <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {giftCards.map((card) => (
                <Link
                  key={card.id}
                  to="/app/recargas/$slug"
                  params={{ slug: card.slug }}
                  className="surface-card overflow-hidden transition-transform hover:-translate-y-1"
                >
                  <GameCover
                    src={card.cover || giftCardImage(card.name)}
                    name={card.name}
                    className="aspect-square w-full"
                  />
                  <p className="truncate p-2 text-xs font-medium">{card.name}</p>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">Historial de compras</h2>
            <Link to="/app/pedidos" className="flex items-center gap-1 text-sm text-primary">
              Ver todo <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
          {orders.length === 0 ? (
            <EmptyState
              title="Todavía no tienes compras"
              description="Cuando hagas una recarga aparecerá aquí."
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
                  className="surface-card flex items-center justify-between gap-3 p-4"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {order.products?.name ?? "Recarga"}
                      {order.games?.name ? ` · ${order.games.name}` : ""}
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
              ))}
            </div>
          )}
        </section>
      </div>
    </UserShell>
  );
}
