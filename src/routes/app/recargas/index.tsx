import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { UserShell } from "@/components/layout/UserShell";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/states";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { mockGames } from "@/data/mock/games";

export const Route = createFileRoute("/app/recargas/")({
  head: () => ({
    meta: [
      { title: "Recargas — MONSTORE" },
      { name: "description", content: "Elige el juego que quieres recargar." },
    ],
  }),
  component: UserRechargesPage,
});

function UserRechargesPage() {
  const [query, setQuery] = useState("");
  const games = mockGames.filter((game) =>
    game.name.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <UserShell>
      <div className="space-y-6">
        <PageHeader title="Recargas" description="Elige un juego para comprar." />

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

        {games.length === 0 ? (
          <EmptyState title="Sin resultados" description="No encontramos ese juego." />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {games.map((game) => (
              <Link
                key={game.id}
                to="/app/recargas/$slug"
                params={{ slug: game.slug }}
                className="surface-card overflow-hidden transition-transform hover:-translate-y-1"
              >
                <img
                  src={game.image_url}
                  alt={`Portada de ${game.name}`}
                  loading="lazy"
                  width={768}
                  height={1024}
                  className="aspect-3/4 w-full object-cover"
                />
                <div className="space-y-0.5 p-3">
                  <p className="text-sm font-semibold">{game.name}</p>
                  <p className="text-xs text-muted-foreground">{game.offers_count} ofertas</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </UserShell>
  );
}
