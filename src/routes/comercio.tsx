import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { mockGameAccounts } from "@/data/mock/marketplace";
import { mockGames } from "@/data/mock/games";
import { formatCUP, formatDate } from "@/lib/format";

export const Route = createFileRoute("/comercio")({
  head: () => ({
    meta: [
      { title: "Comercio de cuentas gamer — MONSTORE" },
      {
        name: "description",
        content:
          "Compra y vende cuentas de videojuegos verificadas por el equipo de MONSTORE, con precios en CUP.",
      },
      { property: "og:title", content: "Comercio de cuentas gamer — MONSTORE" },
      {
        property: "og:description",
        content: "Anuncios de cuentas revisadas por MONSTORE antes de publicarse.",
      },
    ],
  }),
  component: MarketplacePage,
});

function MarketplacePage() {
  const listings = mockGameAccounts.filter((listing) => listing.status === "aprobada");

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8">
        <PageHeader
          title="Comercio de cuentas"
          description="Anuncios revisados por el equipo antes de publicarse."
          action={
            <Button asChild>
              <Link to="/app/comercio/publicar">Publicar mi cuenta</Link>
            </Button>
          }
        />

        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {listings.map((listing) => {
            const game = mockGames.find((item) => item.id === listing.game_id);
            return (
              <article key={listing.id} className="surface-card overflow-hidden">
                <img
                  src={listing.images[0]}
                  alt={listing.title}
                  loading="lazy"
                  width={768}
                  height={1024}
                  className="aspect-4/3 w-full object-cover"
                />
                <div className="space-y-2 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">{game?.name}</p>
                    <StatusBadge status={listing.status} />
                  </div>
                  <h2 className="text-base font-semibold">{listing.title}</h2>
                  <p className="line-clamp-2 text-sm text-muted-foreground">
                    {listing.description}
                  </p>
                  <div className="flex items-center justify-between pt-1">
                    <span className="font-display text-lg font-bold text-primary">
                      {formatCUP(listing.price)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {listing.seller_name} · {formatDate(listing.created_at)}
                    </span>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}
