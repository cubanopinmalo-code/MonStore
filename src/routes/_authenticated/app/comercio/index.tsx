import { createFileRoute, Link } from "@tanstack/react-router";
import { FileStack, Plus, Store } from "lucide-react";
import { UserShell } from "@/components/layout/UserShell";
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
  const total = listings.length;

  return (
    <UserShell>
      <div className="space-y-4">
        <section className="surface-card relative overflow-hidden">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-28 -right-16 size-56 rounded-full bg-primary/12 blur-3xl"
          />
          <div className="relative flex items-start gap-3 p-5">
            <span className="hidden size-11 shrink-0 place-items-center rounded-xl border border-primary/25 bg-primary/10 text-primary sm:grid">
              <Store className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1 space-y-1">
              <h1 className="text-2xl font-bold md:text-3xl">Comercio</h1>
              <p className="text-sm text-muted-foreground">
                Cuentas revisadas por el equipo antes de publicarse.
              </p>
            </div>
            <span className="hidden shrink-0 items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary sm:inline-flex">
              <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
              {total} en venta
            </span>
          </div>
        </section>

        <div className="sticky top-16 z-30 -mx-4 border-y border-border/70 bg-background/85 px-4 py-3 backdrop-blur">
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground sm:hidden">
              <span className="font-semibold text-foreground">{total}</span>{" "}
              {total === 1 ? "cuenta en venta" : "cuentas en venta"}
            </p>
            <p className="hidden text-sm text-muted-foreground sm:block">
              ¿Tienes una cuenta? Publícala y la revisamos antes de mostrarla.
            </p>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
              <Button asChild variant="outline" size="touch" className="bg-surface/60">
                <Link to="/app/comercio/mis-publicaciones">
                  <FileStack aria-hidden="true" />
                  Mis publicaciones
                </Link>
              </Button>
              <Button asChild variant="gradient" size="touch" className="sm:ml-2">
                <Link to="/app/comercio/publicar">
                  <Plus aria-hidden="true" />
                  Publicar cuenta
                </Link>
              </Button>
            </div>
          </div>
        </div>

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
