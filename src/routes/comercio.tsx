import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/common/PageHeader";
import { GameCover } from "@/components/common/GameCover";
import { EmptyState, ErrorState, GridSkeleton } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { usePublicListings, useSignedImages } from "@/hooks/useMarketplace";
import { formatCUP, formatDate } from "@/lib/format";

export const Route = createFileRoute("/comercio")({
  head: () => ({
    meta: [
      { title: "Comercio de cuentas gamer — MONSTORE" },
      {
        name: "description",
        content:
          "Compra y vende cuentas de videojuegos verificadas por el equipo de MONSTORE, con precios en CUP.",
      },
      { property: "og:title", content: "Comercio de cuentas gamer — MONSTORE" },
      {
        property: "og:description",
        content: "Anuncios de cuentas revisadas por MONSTORE antes de publicarse.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MarketplacePage,
});

function MarketplacePage() {
  const { data: listings, isLoading, isError, refetch } = usePublicListings();
  const rows = (listings ?? []).filter(
    (listing) => !listing.expires_at || new Date(listing.expires_at).getTime() > Date.now(),
  );

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8">
        <PageHeader
          title="Comercio de cuentas"
          description="Anuncios revisados por el equipo antes de publicarse."
          action={
            <Button asChild>
              <Link to="/app/comercio/publicar">Publicar mi cuenta</Link>
            </Button>
          }
        />

        {isLoading ? (
          <GridSkeleton items={6} />
        ) : isError ? (
          <ErrorState onRetry={() => void refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            title="Todavía no hay cuentas publicadas"
            description="Cuando alguien publique su cuenta y sea aprobada, aparecerá aquí."
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {rows.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

type PublicListing = NonNullable<ReturnType<typeof usePublicListings>["data"]>[number];

function ListingCard({ listing }: { listing: PublicListing }) {
  const images = useSignedImages(listing.images ?? []);
  const cover = images[0] ?? null;

  return (
    <Link
      to="/app/comercio/$id"
      params={{ id: listing.id }}
      className="surface-card overflow-hidden transition-colors hover:border-primary/40"
    >
      <GameCover src={cover} name={listing.title} className="aspect-4/3 w-full" />
      <div className="space-y-2 p-4">
        <p className="text-xs text-muted-foreground">{listing.games?.name ?? "Cuenta gamer"}</p>
        <h2 className="text-base font-semibold">{listing.title}</h2>
        <p className="text-xs text-muted-foreground">
          {listing.region} · {listing.platform}
        </p>
        <div className="flex items-end justify-between pt-1">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Precio</p>
            <span className="font-display text-lg font-bold text-primary">
              {formatCUP(listing.price)}
            </span>
          </div>
          <span className="text-xs text-muted-foreground">
            {listing.seller_name} ·{" "}
            {formatDate(listing.published_at ?? listing.created_at)}
          </span>
        </div>
      </div>
    </Link>
  );
}
