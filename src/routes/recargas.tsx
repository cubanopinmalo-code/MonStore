import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusBadge } from "@/components/common/StatusBadge";
import { EmptyState } from "@/components/common/states";
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
import { mockGames } from "@/data/mock/games";
import { mockProducts } from "@/data/mock/products";
import { formatCUP } from "@/lib/format";

export const Route = createFileRoute("/recargas")({
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
  component: RechargesPage,
});

function RechargesPage() {
  const [query, setQuery] = useState("");
  const [game, setGame] = useState("todos");
  const [delivery, setDelivery] = useState("todos");
  const [availability, setAvailability] = useState("todos");

  const results = useMemo(() => {
    return mockProducts.filter((product) => {
      const gameName = mockGames.find((g) => g.id === product.game_id)?.name ?? "";
      const matchesQuery =
        query.trim() === "" ||
        `${product.name} ${gameName}`.toLowerCase().includes(query.toLowerCase());
      const matchesGame = game === "todos" || product.game_id === game;
      const matchesDelivery = delivery === "todos" || product.delivery_method === delivery;
      const matchesAvailability =
        availability === "todos" ||
        (availability === "disponible" ? product.available : !product.available);
      return matchesQuery && matchesGame && matchesDelivery && matchesAvailability;
    });
  }, [query, game, delivery, availability]);

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
                {mockGames.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
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

        <p className="text-sm text-muted-foreground">{results.length} ofertas encontradas</p>

        {results.length === 0 ? (
          <EmptyState
            title="No encontramos ofertas"
            description="Prueba con otro juego o cambia los filtros."
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {results.map((product) => {
              const productGame = mockGames.find((g) => g.id === product.game_id);
              return (
                <article key={product.id} className="surface-card flex gap-3 p-3">
                  <img
                    src={productGame?.image_url}
                    alt={`Portada de ${productGame?.name ?? "juego"}`}
                    loading="lazy"
                    width={768}
                    height={1024}
                    className="size-20 shrink-0 rounded-lg object-cover"
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <p className="text-xs text-muted-foreground">{productGame?.name}</p>
                    <h2 className="truncate text-sm font-semibold">{product.name}</h2>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <StatusBadge status={product.available ? "disponible" : "no disponible"} />
                      <span className="text-[11px] text-muted-foreground">
                        {product.delivery_method === "via_id" ? "Por ID" : "Por cuenta"}
                      </span>
                    </div>
                    <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                      <span className="font-display text-base font-bold text-primary">
                        {formatCUP(product.sale_price)}
                      </span>
                      <Button asChild size="sm" variant="outline" disabled={!product.available}>
                        <Link
                          to="/app/recargas/$slug"
                          params={{ slug: productGame?.slug ?? "free-fire" }}
                        >
                          Comprar
                        </Link>
                      </Button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
