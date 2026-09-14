import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusBadge } from "@/components/common/StatusBadge";
import { EmptyState } from "@/components/common/states";
import { GameCover } from "@/components/common/GameCover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCUP } from "@/lib/format";
import { deliveryLabel } from "@/lib/delivery";
import { listCatalogOffers } from "@/lib/catalog.functions";

export const Route = createFileRoute("/recargas")({
  loader: () => listCatalogOffers({ data: { search: "" } }),
  head: () => ({
    meta: [
      { title: "Recargas de videojuegos en CUP — MONSTORE" },
      {
        name: "description",
        content:
          "Busca y filtra todas las recargas disponibles en MONSTORE por juego, método de entrega y disponibilidad.",
      },
      { property: "og:title", content: "Recargas de videojuegos — MONSTORE" },
      {
        property: "og:description",
        content: "Catálogo completo de recargas con precios en CUP.",
      },
    ],
  }),
  errorComponent: () => (
    <AppShell>
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-xl font-semibold">No pudimos cargar las recargas</h1>
        <p className="mt-2 text-sm text-muted-foreground">Inténtalo de nuevo en unos minutos.</p>
      </div>
    </AppShell>
  ),
  component: RechargesPage,
});

function RechargesPage() {
  const offers = Route.useLoaderData();
  const [query, setQuery] = useState("");
  const [game, setGame] = useState("todos");
  const [delivery, setDelivery] = useState("todos");
  const [availability, setAvailability] = useState("todos");

  const games = useMemo(() => {
    const seen = new Map<string, string>();
    for (const offer of offers) {
      if (offer.game_slug && !seen.has(offer.game_slug)) seen.set(offer.game_slug, offer.game_name);
    }
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [offers]);

  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    return offers.filter((offer) => {
      const matchesQuery =
        term === "" || `${offer.name} ${offer.game_name}`.toLowerCase().includes(term);
      const matchesGame = game === "todos" || offer.game_slug === game;
      const matchesDelivery = delivery === "todos" || offer.delivery_method === delivery;
      const matchesAvailability =
        availability === "todos" ||
        (availability === "disponible" ? offer.available : !offer.available);
      return matchesQuery && matchesGame && matchesDelivery && matchesAvailability;
    });
  }, [offers, query, game, delivery, availability]);

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8">
        <PageHeader
          title="Recargas"
          description="Todas las ofertas disponibles, con precios en CUP."
        />

        <div className="surface-card grid gap-3 p-4 md:grid-cols-4">
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="buscar">Buscar</Label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                id="buscar"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Diamantes, monedas, juego…"
                className="pl-9"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="juego">Juego</Label>
            <Select value={game} onValueChange={setGame}>
              <SelectTrigger id="juego">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos los juegos</SelectItem>
                {games.map(([slug, name]) => (
                  <SelectItem key={slug} value={slug}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3 md:col-span-1">
            <div className="space-y-1.5">
              <Label htmlFor="entrega">Entrega</Label>
              <Select value={delivery} onValueChange={setDelivery}>
                <SelectTrigger id="entrega">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas</SelectItem>
                  <SelectItem value="via_id">Por ID</SelectItem>
                  <SelectItem value="codigo">Por código</SelectItem>
                  <SelectItem value="via_cuenta">Por cuenta</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="estado">Estado</Label>
              <Select value={availability} onValueChange={setAvailability}>
                <SelectTrigger id="estado">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="disponible">Disponible</SelectItem>
                  <SelectItem value="agotado">No disponible</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <p className="text-sm text-muted-foreground">
          {results.length === 1 ? "1 oferta encontrada" : `${results.length} ofertas encontradas`}
        </p>

        {results.length === 0 ? (
          <EmptyState
            title="No encontramos ofertas"
            description="Prueba con otro juego o cambia los filtros."
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {results.map((offer) => (
              <article key={offer.id} className="surface-card flex gap-3 p-3">
                <GameCover
                  src={offer.game_cover}
                  name={offer.game_name}
                  className="size-20 shrink-0 rounded-lg"
                />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <p className="text-xs text-muted-foreground">{offer.game_name}</p>
                  <h2 className="truncate text-sm font-semibold">{offer.name}</h2>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <StatusBadge status={offer.available ? "disponible" : "no disponible"} />
                    <span className="text-[11px] text-muted-foreground">
                      {deliveryLabel(offer.delivery_method)}
                    </span>
                  </div>
                  <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                    <span className="font-display text-base font-bold text-primary">
                      {formatCUP(offer.sale_price)}
                    </span>
                    <Button
                      asChild
                      size="sm"
                      variant="outline"
                      disabled={!offer.available || !offer.game_slug}
                    >
                      <Link
                        to="/app/recargas/$slug"
                        params={{ slug: offer.game_slug }}
                        search={{ oferta: offer.id }}
                      >
                        Comprar
                      </Link>
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
