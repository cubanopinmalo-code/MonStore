import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusBadge } from "@/components/common/StatusBadge";
import { mockGames } from "@/data/mock/games";

export const Route = createFileRoute("/juegos/")({
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
  component: GamesPage,
});

function GamesPage() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8">
      <PageHeader
        title="Juegos"
        description="Elige un juego para ver sus ofertas de recarga."
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {mockGames.map((game) => (
          <Link
            key={game.id}
            to="/juegos/$slug"
            params={{ slug: game.slug }}
            className="group surface-card overflow-hidden transition-transform duration-200 hover:-translate-y-1"
          >
            <img
              src={game.image_url}
              alt={`Portada de ${game.name}`}
              loading="lazy"
              width={768}
              height={1024}
              className="aspect-3/4 w-full object-cover"
            />
            <div className="space-y-1.5 p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold">{game.name}</p>
                <StatusBadge status={game.active ? "activo" : "pendiente"} />
              </div>
              <p className="line-clamp-2 text-xs text-muted-foreground">{game.description}</p>
              <p className="text-xs text-primary">{game.offers_count} ofertas</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

Route.options.component = GamesPage;
