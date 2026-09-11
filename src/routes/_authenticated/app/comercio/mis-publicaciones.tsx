import { createFileRoute, Link } from "@tanstack/react-router";
import { UserShell } from "@/components/layout/UserShell";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusBadge } from "@/components/common/StatusBadge";
import { EmptyState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { mockGameAccounts } from "@/data/mock/marketplace";
import { mockGames } from "@/data/mock/games";
import { formatCUP, formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/app/comercio/mis-publicaciones")({
  head: () => ({
    meta: [
      { title: "Mis publicaciones — MONSTORE" },
      { name: "description", content: "Estado de las cuentas que publicaste." },
    ],
  }),
  component: MyListingsPage,
});

function MyListingsPage() {
  const listings = mockGameAccounts.filter((item) => item.seller_id === "us_001");

  return (
    <UserShell>
      <div className="space-y-6">
        <PageHeader
          title="Mis publicaciones"
          description="Sigue el estado de cada anuncio."
          action={
            <Button asChild size="sm">
              <Link to="/app/comercio/publicar">Publicar otra</Link>
            </Button>
          }
        />

        {listings.length === 0 ? (
          <EmptyState
            title="No tienes publicaciones todavía"
            description="Publica una cuenta y aparecerá aquí."
          />
        ) : (
          <div className="grid gap-3">
            {listings.map((listing) => {
              const game = mockGames.find((item) => item.id === listing.game_id);
              return (
                <article key={listing.id} className="surface-card flex gap-3 p-3">
                  <img
                    src={listing.images[0]}
                    alt={listing.title}
                    loading="lazy"
                    width={768}
                    height={1024}
                    className="size-24 shrink-0 rounded-lg object-cover"
                  />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="text-sm font-semibold">{listing.title}</h2>
                      <StatusBadge status={listing.status} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {game?.name} · {formatDate(listing.created_at)}
                    </p>
                    <p className="font-display text-base font-bold text-primary">
                      {formatCUP(listing.price)}
                    </p>
                    {listing.rejection_reason ? (
                      <p className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
                        Motivo del rechazo: {listing.rejection_reason}
                      </p>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </UserShell>
  );
}
