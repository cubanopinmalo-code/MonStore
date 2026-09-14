import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { KeyRound, UserRound } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/common/StatusBadge";
import { EmptyState } from "@/components/common/states";
import { GameCover } from "@/components/common/GameCover";
import { formatCUP } from "@/lib/format";
import { getCatalogGame } from "@/lib/catalog.functions";

export const Route = createFileRoute("/juegos/$slug")({
  loader: async ({ params }) => {
    const result = await getCatalogGame({ data: { slug: params.slug } });
    if (!result) throw notFound();
    return result;
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
          <GameCover
            src={game.cover}
            name={game.name}
            className="aspect-3/4 w-full max-w-[220px] rounded-xl border border-border"
          />
          <div className="space-y-3">
            {game.category ? (
              <Badge variant="outline" className="border-accent/40 bg-accent/10 text-accent">
                {game.category}
              </Badge>
            ) : null}
            <h1 className="text-3xl font-bold">{game.name}</h1>
            <p className="max-w-2xl text-sm text-muted-foreground">{game.description}</p>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>{products.length === 1 ? "1 oferta" : `${products.length} ofertas`}</span>
              <Button asChild size="sm" variant="outline">
                <Link to="/app/recargas/$slug" params={{ slug: game.slug }}>
                  Comprar recarga
                </Link>
              </Button>
            </div>
          </div>
        </div>

        <section className="space-y-3">
          <h2 className="text-xl font-bold">Ofertas disponibles</h2>
          {products.length === 0 ? (
            <EmptyState
              title="Sin ofertas activas"
              description="Este juego todavía no tiene ofertas publicadas. Vuelve pronto."
            />
          ) : (
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
                        <KeyRound className="size-3.5" aria-hidden="true" />{" "}
                        {deliveryLongLabel(product.delivery_method)}
                      </>
                    )}
                  </div>
                  <div className="mt-auto flex items-center justify-between gap-3 pt-2">
                    <p className="font-display text-lg font-bold text-primary">
                      {formatCUP(product.sale_price)}
                    </p>
                    <Button asChild size="sm" disabled={!product.available}>
                      <Link
                        to="/app/recargas/$slug"
                        params={{ slug: game.slug }}
                        search={{ oferta: product.id }}
                      >
                        Comprar
                      </Link>
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
