import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowDownWideNarrow, FileStack, Plus, SlidersHorizontal, Store } from "lucide-react";
import { UserShell } from "@/components/layout/UserShell";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { EmptyState } from "@/components/common/states";
import { ShareListingButton } from "@/components/common/ShareListingButton";
import { formatCUP } from "@/lib/format";
import { usePublicListings, useSignedImages, remainingLabel } from "@/hooks/useMarketplace";

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export const Route = createFileRoute("/_authenticated/app/comercio/")({
  head: () => ({
    meta: [
      { title: "Comercio — MONSTORE" },
      { name: "description", content: "Cuentas de videojuegos publicadas por la comunidad." },
      { property: "og:title", content: "Comercio — MONSTORE" },
      { property: "og:description", content: "Compra cuentas de videojuegos revisadas por MONSTORE." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: UserMarketplacePage,
});

type Listing = ReturnType<typeof usePublicListings>["data"] extends (infer T)[] | undefined
  ? T
  : never;

function ListingCard({ listing }: { listing: Listing }) {
  const images = useSignedImages(listing.images as string[]);
  const cover = images[0];
  const remaining = remainingLabel(listing.expires_at);

  return (
    <article className="surface-card overflow-hidden">
      <Link
        to="/app/comercio/$id"
        params={{ id: listing.id }}
        aria-label={`Ver fotos de ${listing.title}`}
        className="group relative block overflow-hidden"
      >
        {cover ? (
          <img
            src={cover}
            alt={`Foto principal de ${listing.title}`}
            loading="lazy"
            width={768}
            height={1024}
            className="aspect-4/3 w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="aspect-4/3 w-full bg-muted" aria-hidden="true" />
        )}
        <span className="absolute bottom-2 right-2 rounded-md bg-background/85 px-2 py-1 text-xs font-medium backdrop-blur">
          {listing.images.length} fotos
        </span>
      </Link>
      <div className="space-y-3 p-4">
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
          <div className="col-span-2">
            <dt className="text-muted-foreground">Vendedor</dt>
            <dd className="mt-1 flex items-center gap-2">
              <Avatar className="size-8 border border-border">
                <AvatarFallback className="text-[10px] font-semibold">
                  {getInitials(listing.seller_name)}
                </AvatarFallback>
              </Avatar>
              <span className="truncate font-medium">{listing.seller_name}</span>
            </dd>
          </div>
          <div><dt className="text-muted-foreground">Juego</dt><dd className="font-medium">{listing.games?.name}</dd></div>
          <div><dt className="text-muted-foreground">Región</dt><dd className="font-medium">{listing.region}</dd></div>
          <div><dt className="text-muted-foreground">Plataforma</dt><dd className="font-medium">{listing.platform}</dd></div>
        </dl>
        {remaining ? <p className="text-xs text-muted-foreground">{remaining}</p> : null}
        <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
          <div>
            <p className="text-xs text-muted-foreground">Precio</p>
            <p className="font-display text-base font-bold text-primary">{formatCUP(listing.price)}</p>
          </div>
          <div className="flex items-center gap-2">
            <ShareListingButton listingId={listing.id} title={listing.title} withLabel={false} size="icon" />
            <Button asChild size="sm">
              <Link to="/app/comercio/$id" params={{ id: listing.id }}>Comprar</Link>
            </Button>
          </div>
        </div>
      </div>
    </article>
  );
}

type SortKey = "recientes" | "precio_asc" | "precio_desc" | "tiempo_asc";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "recientes", label: "Más recientes" },
  { value: "precio_asc", label: "Precio: menor a mayor" },
  { value: "precio_desc", label: "Precio: mayor a menor" },
  { value: "tiempo_asc", label: "Menos tiempo de publicación" },
];

function UserMarketplacePage() {
  const { data, isLoading } = usePublicListings();
  const [sort, setSort] = useState<SortKey>("recientes");
  const [region, setRegion] = useState<string>("todas");

  const regions = useMemo(
    () =>
      Array.from(new Set((data ?? []).map((l) => l.region).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b, "es"),
      ),
    [data],
  );

  const listings = useMemo(() => {
    const filtered = (data ?? []).filter((l) => region === "todas" || l.region === region);
    const byNewest = (a: (typeof filtered)[number], b: (typeof filtered)[number]) =>
      new Date(b.published_at ?? b.created_at).getTime() -
      new Date(a.published_at ?? a.created_at).getTime();
    const byRemaining = (l: (typeof filtered)[number]) =>
      l.expires_at ? new Date(l.expires_at).getTime() - Date.now() : Number.POSITIVE_INFINITY;
    const sorted = [...filtered];
    if (sort === "precio_asc") sorted.sort((a, b) => a.price - b.price);
    else if (sort === "precio_desc") sorted.sort((a, b) => b.price - a.price);
    else if (sort === "tiempo_asc") sorted.sort((a, b) => byRemaining(a) - byRemaining(b));
    else sorted.sort(byNewest);
    return sorted;
  }, [data, region, sort]);

  const total = listings.length;

  return (
    <UserShell>
      <div className="space-y-4">
        <section className="surface-card relative overflow-hidden">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-28 -right-16 size-56 rounded-full bg-primary/12 blur-3xl"
          />
          <div className="relative flex items-start gap-3 p-5">
            <span className="hidden size-11 shrink-0 place-items-center rounded-xl border border-primary/25 bg-primary/10 text-primary sm:grid">
              <Store className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1 space-y-1">
              <h1 className="text-2xl font-bold md:text-3xl">Comercio</h1>
              <p className="text-sm text-muted-foreground">
                Cuentas revisadas por el equipo antes de publicarse.
              </p>
            </div>
            <span className="hidden shrink-0 items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary sm:inline-flex">
              <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
              {total} en venta
            </span>
          </div>
        </section>

        <div className="sticky top-16 z-30 -mx-4 border-y border-border/70 bg-background/95 px-4 py-3 shadow-[0_10px_24px_-20px_oklch(0_0_0/0.9)] backdrop-blur">
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground sm:hidden">
              <span className="font-semibold text-foreground">{total}</span>{" "}
              {total === 1 ? "cuenta en venta" : "cuentas en venta"}
            </p>
            <p className="hidden text-sm text-muted-foreground sm:block">
              ¿Tienes una cuenta? Publícala y la revisamos antes de mostrarla.
            </p>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
              <Button asChild variant="outline" size="touch" className="bg-surface/60">
                <Link to="/app/comercio/mis-publicaciones">
                  <FileStack aria-hidden="true" />
                  Mis publicaciones
                </Link>
              </Button>
              <Button asChild variant="outline" size="touch" className="bg-surface/60">
                <Link to="/app/comercio/mis-compras">
                  <FileStack aria-hidden="true" />
                  Mis compras
                </Link>
              </Button>
              <Button asChild variant="gradient" size="touch" className="sm:ml-2">
                <Link to="/app/comercio/publicar">
                  <Plus aria-hidden="true" />
                  Publicar cuenta
                </Link>
              </Button>
            </div>
          </div>
        </div>

        <section
          aria-label="Filtros del comercio"
          className="surface-card flex flex-col gap-3 p-3 sm:flex-row sm:items-end"
        >
          <div className="flex items-center gap-2 text-sm font-semibold">
            <SlidersHorizontal className="size-4 text-primary" aria-hidden="true" />
            Filtros
          </div>
          <div className="grid flex-1 gap-3 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Ordenar por</span>
              <div className="relative">
                <ArrowDownWideNarrow
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as SortKey)}
                  className="w-full appearance-none rounded-md border border-border bg-surface/60 py-2 pl-9 pr-3 text-sm outline-none focus:border-primary"
                >
                  {SORT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Región</span>
              <select
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                className="w-full appearance-none rounded-md border border-border bg-surface/60 px-3 py-2 text-sm outline-none focus:border-primary"
              >
                <option value="todas">Todas las regiones</option>
                {regions.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        {!isLoading && total === 0 ? (
          <EmptyState
            title="Todavía no hay cuentas publicadas"
            description="Publica la tuya y aparecerá aquí cuando el equipo la apruebe."
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {listings.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        )}
      </div>
    </UserShell>
  );
}
