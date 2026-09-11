import { createFileRoute } from "@tanstack/react-router";
import { AdminShell } from "@/components/layout/AdminShell";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { mockGames } from "@/data/mock/games";
import { formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/admin/juegos")({
  head: () => ({
    meta: [
      { title: "Juegos — Panel MONSTORE" },
      { name: "description", content: "Catálogo de juegos sincronizados y su visibilidad." },
    ],
  }),
  component: AdminGamesPage,
});

function AdminGamesPage() {
  return (
    <AdminShell title="Juegos" description="Catálogo sincronizado desde el proveedor.">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {mockGames.map((game) => (
          <article key={game.id} className="surface-card overflow-hidden">
            <img
              src={game.image_url}
              alt={game.name}
              loading="lazy"
              width={768}
              height={512}
              className="aspect-video w-full object-cover"
            />
            <div className="space-y-2 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold">{game.name}</h2>
                  <p className="text-xs text-muted-foreground">{game.category}</p>
                </div>
                <StatusBadge status={game.active ? "activo" : "inactivo"} />
              </div>
              <p className="text-xs text-muted-foreground">
                ID proveedor: {game.g2bulk_id} · {game.offers_count} ofertas
              </p>
              <p className="text-xs text-muted-foreground">
                Actualizado {formatDateTime(game.updated_at)}
              </p>
              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Switch defaultChecked={game.active} />
                  Visible
                </label>
                <Button variant="outline" size="sm" disabled>
                  Editar
                </Button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </AdminShell>
  );
}
