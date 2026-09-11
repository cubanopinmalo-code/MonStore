import { createFileRoute, Link } from "@tanstack/react-router";
import { UserShell } from "@/components/layout/UserShell";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { mockGameAccounts } from "@/data/mock/marketplace";
import { mockGames } from "@/data/mock/games";
import { formatCUP } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/app/comercio/")({
  head: () => ({
    meta: [
      { title: "Comercio — MONSTORE" },
      { name: "description", content: "Cuentas de videojuegos publicadas por la comunidad." },
      { property: "og:title", content: "Comercio — MONSTORE" },
      { property: "og:description", content: "Compra cuentas de videojuegos revisadas por MONSTORE." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
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
                <Link
                  to="/app/comercio/$id"
                  params={{ id: listing.id }}
                  aria-label={`Ver fotos de ${listing.title}`}
                  className="group relative block overflow-hidden"
                >
                  <img
                    src={listing.images[0]}
                    alt={`Foto principal de ${listing.title}`}
                    loading="lazy"
                    width={768}
                    height={1024}
                    className="aspect-4/3 w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                  <span className="absolute bottom-2 right-2 rounded-md bg-background/85 px-2 py-1 text-xs font-medium backdrop-blur">
                    {listing.images.length} fotos
                  </span>
                </Link>
                <div className="space-y-3 p-4">
                  <h2 className="text-sm font-semibold">{listing.title}</h2>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                    <div><dt className="text-muted-foreground">Vendedor</dt><dd className="font-medium">{listing.seller_name}</dd></div>
                    <div><dt className="text-muted-foreground">Juego</dt><dd className="font-medium">{game?.name}</dd></div>
                    <div><dt className="text-muted-foreground">Región</dt><dd className="font-medium">{listing.region}</dd></div>
                    <div><dt className="text-muted-foreground">Plataforma</dt><dd className="font-medium">{listing.platform}</dd></div>
                  </dl>
                  <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
                    <p className="font-display text-base font-bold text-primary">{formatCUP(listing.price)}</p>
                    <Button asChild size="sm">
                      <Link to="/app/comercio/$id" params={{ id: listing.id }}>Comprar</Link>
                    </Button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </UserShell>
  );
}
