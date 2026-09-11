import { createFileRoute, Link } from "@tanstack/react-router";
import { UserShell } from "@/components/layout/UserShell";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { mockGameAccounts } from "@/data/mock/marketplace";
import { mockGames } from "@/data/mock/games";
import { formatCUP } from "@/lib/format";

export const Route = createFileRoute("/app/comercio/")({
  head: () => ({
    meta: [
      { title: "Comercio — MONSTORE" },
      { name: "description", content: "Cuentas de videojuegos publicadas por la comunidad." },
    ],
  }),
  component: UserMarketplacePage,
});

function UserMarketplacePage() {
  const listings = mockGameAccounts.filter((item) => item.status === "aprobada");

  return (
    <UserShell>
      <div className="space-y-6">
        <PageHeader
          title="Comercio"
          description="Cuentas revisadas por el equipo."
          action={
            <div className="flex gap-2">
              <Button asChild variant="outline" size="sm">
                <Link to="/app/comercio/mis-publicaciones">Mis publicaciones</Link>
              </Button>
              <Button asChild size="sm">
                <Link to="/app/comercio/publicar">Publicar</Link>
              </Button>
            </div>
          }
        />

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
                <div className="space-y-1.5 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">{game?.name}</span>
                    <StatusBadge status={listing.status} />
                  </div>
                  <h2 className="text-sm font-semibold">{listing.title}</h2>
                  <p className="line-clamp-2 text-xs text-muted-foreground">
                    {listing.description}
                  </p>
                  <p className="pt-1 font-display text-base font-bold text-primary">
                    {formatCUP(listing.price)}
                  </p>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </UserShell>
  );
}
