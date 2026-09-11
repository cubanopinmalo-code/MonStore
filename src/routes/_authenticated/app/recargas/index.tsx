import { useMemo, useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { Flame, Search, Star } from "lucide-react";
import { UserShell } from "@/components/layout/UserShell";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/states";
import { GameCover } from "@/components/common/GameCover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { listCatalogGames, type CatalogGame } from "@/lib/catalog.functions";
import { listFavoriteGameIds, listPopularGameIds, toggleFavoriteGame } from "@/lib/favorites.functions";
import { isGiftCard } from "@/lib/giftcards";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/recargas/")({
  loader: async () => {
    const [games, favorites, popular] = await Promise.all([
      listCatalogGames(),
      listFavoriteGameIds().catch(() => [] as string[]),
      listPopularGameIds().catch(() => [] as string[]),
    ]);
    return { games, favorites, popular };
  },
  head: () => ({
    meta: [
      { title: "Recargas — MONSTORE" },
      { name: "description", content: "Elige el juego que quieres recargar." },
    ],
  }),
  errorComponent: () => (
    <UserShell>
      <p className="text-sm text-muted-foreground">No pudimos cargar los juegos.</p>
    </UserShell>
  ),
  component: UserRechargesPage,
});

function UserRechargesPage() {
  const { games, favorites, popular } = Route.useLoaderData();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<string[]>(favorites);

  const catalog = useMemo(() => games.filter((game) => !isGiftCard(game)), [games]);

  const popularGames = useMemo(() => {
    const byId = new Map(catalog.map((game) => [game.id, game]));
    const top = popular.map((id) => byId.get(id)).filter(Boolean) as CatalogGame[];
    if (top.length >= 3) return top.slice(0, 3);
    const rest = [...catalog]
      .filter((game) => !top.some((item) => item.id === game.id))
      .sort((a, b) => b.offers - a.offers);
    return [...top, ...rest].slice(0, 3);
  }, [catalog, popular]);

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    const favorite = new Set(favoriteIds);
    return catalog
      .filter((game) => (term ? game.name.toLowerCase().includes(term) : true))
      .sort((a, b) => {
        const diff = Number(favorite.has(b.id)) - Number(favorite.has(a.id));
        return diff !== 0 ? diff : a.name.localeCompare(b.name);
      });
  }, [catalog, favoriteIds, query]);

  async function onToggleFavorite(gameId: string) {
    setSaving(gameId);
    const wasFavorite = favoriteIds.includes(gameId);
    setFavoriteIds((current) =>
      wasFavorite ? current.filter((id) => id !== gameId) : [...current, gameId],
    );
    try {
      await toggleFavoriteGame({ data: { gameId } });
      void router.invalidate();
    } catch {
      setFavoriteIds((current) =>
        wasFavorite ? [...current, gameId] : current.filter((id) => id !== gameId),
      );
      toast.error("No pudimos guardar tu favorito.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <UserShell>
      <div className="space-y-6">
        <PageHeader title="Recargas" description="Elige un juego para comprar." />

        {popularGames.length > 0 ? (
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Flame className="size-4 text-primary" aria-hidden="true" />
              Juegos populares
            </h2>
            <div className="grid grid-cols-3 gap-3">
              {popularGames.map((game) => (
                <Link
                  key={game.id}
                  to="/app/recargas/$slug"
                  params={{ slug: game.slug }}
                  className="surface-card overflow-hidden transition-transform hover:-translate-y-1"
                >
                  <GameCover src={game.cover} name={game.name} className="aspect-square w-full" />
                  <p className="line-clamp-2 p-2 text-xs font-semibold">{game.name}</p>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        <div className="space-y-1.5">
          <Label htmlFor="buscar-juego">Buscar juego</Label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="buscar-juego"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Free Fire, Mobile Legends…"
              className="pl-9"
            />
          </div>
        </div>

        {visible.length === 0 ? (
          <EmptyState title="Sin resultados" description="No encontramos ese juego." />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {visible.map((game) => {
              const isFavorite = favoriteIds.includes(game.id);
              return (
                <div key={game.id} className="relative">
                  <Link
                    to="/app/recargas/$slug"
                    params={{ slug: game.slug }}
                    className="surface-card block overflow-hidden transition-transform hover:-translate-y-1"
                  >
                    <GameCover src={game.cover} name={game.name} className="aspect-3/4 w-full" />
                    <div className="space-y-0.5 p-3">
                      <p className="text-sm font-semibold">{game.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {game.offers === 1 ? "1 oferta" : `${game.offers} ofertas`}
                      </p>
                    </div>
                  </Link>
                  <button
                    type="button"
                    onClick={() => void onToggleFavorite(game.id)}
                    disabled={saving === game.id}
                    aria-pressed={isFavorite}
                    aria-label={
                      isFavorite
                        ? `Quitar ${game.name} de favoritos`
                        : `Agregar ${game.name} a favoritos`
                    }
                    className="absolute right-2 top-2 grid size-8 place-items-center rounded-full bg-background/80 backdrop-blur transition-colors hover:bg-background disabled:opacity-60"
                  >
                    <Star
                      className={cn(
                        "size-4",
                        isFavorite ? "fill-primary text-primary" : "text-muted-foreground",
                      )}
                      aria-hidden="true"
                    />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </UserShell>
  );
}
