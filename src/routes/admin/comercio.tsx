import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { AdminShell } from "@/components/layout/AdminShell";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { mockGameAccounts } from "@/data/mock/marketplace";
import { mockGames } from "@/data/mock/games";
import { formatCUP, formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/admin/comercio")({
  head: () => ({
    meta: [
      { title: "Comercio — Panel MONSTORE" },
      { name: "description", content: "Revisión de publicaciones de cuentas de la comunidad." },
    ],
  }),
  component: AdminMarketplacePage,
});

function AdminMarketplacePage() {
  return (
    <AdminShell title="Comercio" description="Publicaciones enviadas por los usuarios.">
      <div className="grid gap-3 lg:grid-cols-2">
        {mockGameAccounts.map((listing) => {
          const game = mockGames.find((item) => item.id === listing.game_id);
          return (
            <article key={listing.id} className="surface-card space-y-3 p-3">
              <div className="flex gap-3">
              <img
                src={listing.images[0]}
                alt={listing.title}
                loading="lazy"
                width={768}
                height={1024}
                className="size-28 shrink-0 rounded-lg object-cover"
              />
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-sm font-semibold">{listing.title}</h2>
                  <StatusBadge status={listing.status} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {game?.name} · {listing.seller_name} · {listing.region} · {listing.platform}
                </p>
                <p className="text-xs text-muted-foreground">{formatDateTime(listing.created_at)}</p>
                <p className="line-clamp-2 text-xs text-muted-foreground">
                  {listing.description}
                </p>
                <p className="font-display text-base font-bold text-primary">
                  {formatCUP(listing.price)}
                </p>
              </div>
              </div>
              <div className="rounded-md border border-warning/30 bg-warning/10 p-3 text-xs">
                <p className="mb-2 font-semibold text-warning">Datos privados — solo administración</p>
                <dl className="space-y-1">
                  <div><dt className="inline text-muted-foreground">Correo: </dt><dd className="inline">{listing.account_email}</dd></div>
                  <div><dt className="inline text-muted-foreground">Contraseña: </dt><dd className="inline">{listing.account_password}</dd></div>
                  <div><dt className="inline text-muted-foreground">Acceso: </dt><dd className="inline">{listing.admin_access_notes}</dd></div>
                </dl>
              </div>
              {listing.status === "pendiente" ? (
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => toast.success("Publicación aprobada (simulado)")}>Aprobar</Button>
                  <Button size="sm" variant="outline" onClick={() => toast.error("Publicación rechazada (simulado)")}>Rechazar</Button>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </AdminShell>
  );
}
