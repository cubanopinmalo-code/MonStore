import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AdminShell } from "@/components/layout/AdminShell";
import { EmptyState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PrivateAccountPanel } from "@/components/marketplace/PrivateAccountPanel";
import { supabase } from "@/integrations/supabase/client";
import {
  useAccountSales,
  useAdminListings,
  useCountdown,
  useSignedImages,
} from "@/hooks/useMarketplace";
import { useAdminRealtime } from "@/hooks/useAdminPanel";
import { formatCUP, formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/cuentas-vendidas")({
  head: () => ({
    meta: [
      { title: "Cuentas vendidas — Panel MONSTORE" },
      {
        name: "description",
        content: "Historial permanente de cuentas vendidas, pagos retenidos y entregas.",
      },
      { property: "og:title", content: "Cuentas vendidas — Panel MONSTORE" },
      { property: "og:description", content: "Ventas, retenciones y entregas de cuentas gamer." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SoldAccountsPage,
});

type Sale = NonNullable<ReturnType<typeof useAccountSales>["data"]>[number];
type Listing = NonNullable<ReturnType<typeof useAdminListings>["data"]>[number];

function usePeople(ids: string[]) {
  const key = [...new Set(ids)].sort().join("|");
  return useQuery({
    queryKey: ["sale-people", key],
    enabled: key.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, name, phone")
        .in("id", key.split("|"));
      const map = new Map<string, { name: string; phone: string }>();
      for (const row of data ?? []) map.set(row.id, { name: row.name, phone: row.phone });
      return map;
    },
  });
}

function SaleCard({
  sale,
  listing,
  people,
}: {
  sale: Sale;
  listing: Listing | undefined;
  people: Map<string, { name: string; phone: string }> | undefined;
}) {
  const images = useSignedImages((listing?.images as string[] | undefined) ?? []);
  const releaseLeft = useCountdown(sale.status === "retenido" ? sale.release_at : null);
  const secureLeft = useCountdown(listing?.secure_deadline ?? null);
  const buyer = people?.get(sale.buyer_id);
  const seller = people?.get(sale.seller_id);

  const fundsLabel =
    sale.status === "liberado"
      ? "Pago acreditado al vendedor"
      : sale.status === "pendiente_liberacion"
        ? "Liberación pendiente"
        : "Pago retenido";

  return (
    <article className="surface-card space-y-3 p-3">
      <div className="flex gap-3">
        {images[0] ? (
          <img
            src={images[0]}
            alt={listing?.title ?? "Cuenta vendida"}
            loading="lazy"
            width={768}
            height={1024}
            className="size-24 shrink-0 rounded-lg object-cover"
          />
        ) : (
          <div className="size-24 shrink-0 rounded-lg bg-muted" aria-hidden="true" />
        )}
        <div className="min-w-0 flex-1 space-y-1 text-xs">
          <h2 className="text-sm font-semibold">{listing?.title ?? "Cuenta vendida"}</h2>
          <p className="text-muted-foreground">
            {listing?.games?.name} · {listing?.region} · {listing?.platform}
          </p>
          <p className="font-display text-base font-bold text-primary">{formatCUP(sale.amount)}</p>
          <p className="text-muted-foreground">Vendida el {formatDateTime(sale.purchased_at)}</p>
          <p
            className={
              sale.status === "liberado"
                ? "font-medium text-success"
                : sale.status === "pendiente_liberacion"
                  ? "font-medium text-destructive"
                  : "font-medium text-warning"
            }
          >
            {fundsLabel}
            {sale.status === "retenido" && releaseLeft ? ` · se libera en ${releaseLeft}` : ""}
            {sale.released_at ? ` · ${formatDateTime(sale.released_at)}` : ""}
          </p>
          {sale.release_error ? (
            <p className="text-destructive">Incidencia: {sale.release_error}</p>
          ) : null}
        </div>
      </div>

      <dl className="grid gap-1 text-xs sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Vendedor</dt>
          <dd>
            {seller?.name ?? "—"} · {seller?.phone ?? "—"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Comprador</dt>
          <dd>
            {buyer?.name ?? "—"} · {buyer?.phone ?? "—"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Entrega de datos</dt>
          <dd>
            {listing?.credentials_delivered_at
              ? `Entregados el ${formatDateTime(listing.credentials_delivered_at)}`
              : "Pendiente"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">24 horas del comprador</dt>
          <dd>{secureLeft && secureLeft !== "00:00:00" ? `Quedan ${secureLeft}` : "Terminadas"}</dd>
        </div>
      </dl>

      {listing ? <PrivateAccountPanel listingId={listing.id} /> : null}
    </article>
  );
}

function SoldAccountsPage() {
  const { data: sales, isLoading } = useAccountSales();
  const { data: listings } = useAdminListings();
  useAdminRealtime(["account-sales", "listings-admin", "admin-panel"]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"todas" | "retenido" | "liberado" | "pendiente_liberacion">(
    "todas",
  );

  const listingMap = useMemo(() => {
    const map = new Map<string, Listing>();
    for (const listing of listings ?? []) map.set(listing.id, listing);
    return map;
  }, [listings]);

  const { data: people } = usePeople(
    (sales ?? []).flatMap((sale) => [sale.buyer_id, sale.seller_id]),
  );

  const rows = (sales ?? []).filter((sale) => {
    if (filter !== "todas" && sale.status !== filter) return false;
    if (!search.trim()) return true;
    const needle = search.trim().toLowerCase();
    const listing = listingMap.get(sale.listing_id);
    const buyer = people?.get(sale.buyer_id);
    const seller = people?.get(sale.seller_id);
    return [
      listing?.title,
      listing?.games?.name,
      listing?.region,
      buyer?.name,
      buyer?.phone,
      seller?.name,
      seller?.phone,
      sale.id,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(needle));
  });

  return (
    <AdminShell
      title="Cuentas vendidas"
      description="Historial permanente de ventas, pagos retenidos y entregas."
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(["todas", "retenido", "liberado", "pendiente_liberacion"] as const).map((item) => (
          <Button
            key={item}
            size="sm"
            variant={filter === item ? "gradient" : "outline"}
            aria-pressed={filter === item}
            onClick={() => setFilter(item)}
          >
            {item === "todas"
              ? "Todas"
              : item === "retenido"
                ? "Pago retenido"
                : item === "liberado"
                  ? "Pago acreditado"
                  : "Liberación pendiente"}
          </Button>
        ))}
        <Input
          className="sm:max-w-xs"
          placeholder="Buscar por nombre, teléfono o juego"
          aria-label="Buscar venta"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {!isLoading && rows.length === 0 ? (
        <EmptyState
          title="Todavía no hay ventas"
          description="Cuando alguien compre una cuenta, la venta queda registrada aquí para siempre."
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {rows.map((sale) => (
            <SaleCard
              key={sale.id}
              sale={sale}
              listing={listingMap.get(sale.listing_id)}
              people={people}
            />
          ))}
        </div>
      )}
    </AdminShell>
  );
}
