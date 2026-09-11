import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { KeyRound, UserRound } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/common/StatusBadge";
import { mockGames } from "@/data/mock/games";
import { mockProducts } from "@/data/mock/products";
import { formatCUP } from "@/lib/format";

export const Route = createFileRoute("/juegos/$slug")({
  loader: ({ params }) => {
    const game = mockGames.find((item) => item.slug === params.slug);
    if (!game) throw notFound();
    return {
      game,
      products: mockProducts.filter((product) => product.game_id === game.id),
    };
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return {
        meta: [{ title: "Juego no disponible — MONSTORE" }, { name: "robots", content: "noindex" }],
      };
    }
    const title = `${loaderData.game.name} — Recargas en MONSTORE`;
    return {
      meta: [
        { title },
        { name: "description", content: loaderData.game.description },
        { property: "og:title", content: title },
        { property: "og:description", content: loaderData.game.description },
      ],
    };
  },
  errorComponent: () => (
    <AppShell>
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-xl font-semibold">No pudimos cargar este juego</h1>
        <p className="mt-2 text-sm text-muted-foreground">Inténtalo de nuevo en unos minutos.</p>
      </div>
    </AppShell>
  ),
  notFoundComponent: () => (
    <AppShell>
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-xl font-semibold">Juego no encontrado</h1>
        <Button asChild className="mt-4">
          <Link to="/juegos">Ver todos los juegos</Link>
        </Button>
      </div>
    </AppShell>
  ),
  component: GameDetailPage,
});

function GameDetailPage() {
  const { game, products } = Route.useLoaderData();

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-7xl space-y-8 px-4 py-8">
        <div className="grid gap-6 md:grid-cols-[220px_1fr] md:items-start">
          <img
            src={game.image_url}
            alt={`Portada de ${game.name}`}
            width={768}
            height={1024}
            className="aspect-3/4 w-full max-w-[220px] rounded-xl border border-border object-cover"
          />
          <div className="space-y-3">
            <Badge variant="outline" className="border-accent/40 bg-accent/10 text-accent">
              {game.category}
            </Badge>
            <h1 className="text-3xl font-bold">{game.name}</h1>
            <p className="max-w-2xl text-sm text-muted-foreground">{game.description}</p>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <StatusBadge status={game.active ? "activo" : "pendiente"} />
              <span>{products.length} ofertas disponibles</span>
            </div>
          </div>
        </div>

        <section className="space-y-3">
          <h2 className="text-xl font-bold">Ofertas disponibles</h2>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {products.map((product) => (
              <article key={product.id} className="surface-card flex flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold">{product.name}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{product.description}</p>
                  </div>
                  <StatusBadge status={product.available ? "disponible" : "no disponible"} />
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {product.delivery_method === "via_id" ? (
                    <>
                      <UserRound className="size-3.5" aria-hidden="true" /> Entrega por ID del
                      jugador
                    </>
                  ) : (
                    <>
                      <KeyRound className="size-3.5" aria-hidden="true" /> Entrega accediendo a la
                      cuenta
                    </>
                  )}
                </div>
                <div className="mt-auto flex items-center justify-between gap-3 pt-2">
                  <p className="font-display text-lg font-bold text-primary">
                    {formatCUP(product.sale_price)}
                  </p>
                  <Button asChild size="sm" disabled={!product.available}>
                    <Link to="/app/recargas/$slug" params={{ slug: game.slug }}>
                      Comprar
                    </Link>
                  </Button>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
