import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { UserShell } from "@/components/layout/UserShell";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/states";
import { GameCover } from "@/components/common/GameCover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { listCatalogGames } from "@/lib/catalog.functions";
import { giftCardImage, isGiftCard } from "@/lib/giftcards";

export const Route = createFileRoute("/_authenticated/app/tarjetas/")({
  loader: () => listCatalogGames(),
  head: () => ({
    meta: [
      { title: "Tarjetas de regalo — MONSTORE" },
      {
        name: "description",
        content: "Compra tarjetas de regalo y códigos digitales pagando en CUP.",
      },
    ],
  }),
  errorComponent: () => (
    <UserShell>
      <p className="text-sm text-muted-foreground">No pudimos cargar las tarjetas.</p>
    </UserShell>
  ),
  component: GiftCardsPage,
});

function GiftCardsPage() {
  const games = Route.useLoaderData();
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return games
      .filter((game) => isGiftCard(game))
      .filter((game) => (term ? game.name.toLowerCase().includes(term) : true));
  }, [games, query]);

  return (
    <UserShell>
      <div className="space-y-6">
        <PageHeader
          title="Tarjetas de regalo"
          description="Códigos y saldo para tiendas y servicios digitales."
        />

        <div className="space-y-1.5">
          <Label htmlFor="buscar-tarjeta">Buscar tarjeta</Label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="buscar-tarjeta"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Steam, PSN, Netflix…"
              className="pl-9"
            />
          </div>
        </div>

        {visible.length === 0 ? (
          <EmptyState title="Sin resultados" description="No encontramos esa tarjeta." />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {visible.map((game) => (
              <Link
                key={game.id}
                to="/app/recargas/$slug"
                params={{ slug: game.slug }}
                className="surface-card overflow-hidden transition-transform hover:-translate-y-1"
              >
                <GameCover
                  src={game.cover || giftCardImage(game.name)}
                  name={game.name}
                  className="aspect-square w-full"
                />
                <div className="space-y-0.5 p-3">
                  <p className="text-sm font-semibold">{game.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {game.offers === 1 ? "1 oferta" : `${game.offers} ofertas`}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </UserShell>
  );
}
