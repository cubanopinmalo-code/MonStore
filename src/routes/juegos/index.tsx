import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/common/PageHeader";
import { CardListSkeleton, EmptyState } from "@/components/common/states";
import { GameCover } from "@/components/common/GameCover";
import { giftCardImage, isGiftCard } from "@/lib/giftcards";
import { Button } from "@/components/ui/button";
import { listCatalogGames } from "@/lib/catalog.functions";

export const Route = createFileRoute("/juegos/")({
  loader: () => listCatalogGames(),
  head: () => ({
    meta: [
      { title: "Juegos disponibles — MONSTORE" },
      {
        name: "description",
        content:
          "Catálogo de juegos con recargas disponibles en MONSTORE: Free Fire, Mobile Legends, Delta Force, FC Mobile y más.",
      },
      { property: "og:title", content: "Juegos disponibles — MONSTORE" },
      {
        property: "og:description",
        content: "Explora los juegos con recargas disponibles en MONSTORE.",
      },
    ],
  }),
  errorComponent: () => (
    <AppShell>
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-xl font-semibold">No pudimos cargar los juegos</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Revisa tu conexión o inténtalo de nuevo en unos minutos.
        </p>
      </div>
    </AppShell>
  ),
  component: GamesPage,
});

function GamesPage() {
  const games = Route.useLoaderData();

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8">
        <PageHeader title="Juegos" description="Elige un juego para ver sus ofertas de recarga." />

        {games.length === 0 ? (
          <EmptyState
            title="Todavía no hay juegos activos"
            description="El administrador activará los juegos disponibles en breve."
          />
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            {games.map((game) => (
              <Link
                key={game.id}
                to="/juegos/$slug"
                params={{ slug: game.slug }}
                className="group surface-card overflow-hidden transition-transform duration-200 hover:-translate-y-1"
              >
                <GameCover
                  src={game.cover || (isGiftCard(game) ? giftCardImage(game.name) : "")}
                  name={game.name}
                  className="aspect-3/4 w-full"
                />
                <div className="space-y-1.5 p-3">
                  <p className="text-sm font-semibold">{game.name}</p>
                  <p className="line-clamp-2 text-xs text-muted-foreground">{game.description}</p>
                  <p className="text-xs text-primary">
                    {game.offers === 1 ? "1 oferta" : `${game.offers} ofertas`}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-2">
          <Button asChild variant="outline">
            <Link to="/recargas">Ver todas las ofertas</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/comercio">Cuentas en venta</Link>
          </Button>
        </div>
      </div>
    </AppShell>
  );
}

export function GamesSkeleton() {
  return <CardListSkeleton items={8} />;
}
