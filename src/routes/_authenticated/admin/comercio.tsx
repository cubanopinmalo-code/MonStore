import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AdminShell } from "@/components/layout/AdminShell";
import { StatusBadge } from "@/components/common/StatusBadge";
import { EmptyState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAdminListings, useSignedImages, remainingLabel } from "@/hooks/useMarketplace";
import { formatCUP, formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/comercio")({
  head: () => ({
    meta: [
      { title: "Comercio — Panel MONSTORE" },
      { name: "description", content: "Revisión de publicaciones de cuentas de la comunidad." },
    ],
  }),
  component: AdminMarketplacePage,
});

type Listing = NonNullable<ReturnType<typeof useAdminListings>["data"]>[number];

function AdminListingCard({ listing }: { listing: Listing }) {
  const queryClient = useQueryClient();
  const images = useSignedImages(listing.images as string[]);
  const [working, setWorking] = useState(false);
  const secrets = Array.isArray(listing.game_account_secrets)
    ? listing.game_account_secrets[0]
    : listing.game_account_secrets;

  async function review(approve: boolean) {
    const reason = approve
      ? null
      : window.prompt("Motivo del rechazo (se le devuelve el importe al vendedor):") ?? "";
    if (!approve && !reason) return;
    setWorking(true);
    const { error } = await supabase.rpc("review_game_account", {
      p_listing: listing.id,
      p_approve: approve,
      p_reason: reason ?? "",
    });
    setWorking(false);
    if (error) {
      toast.error("No pudimos revisar la publicación", { description: error.message });
      return;
    }
    await queryClient.invalidateQueries();
    toast.success(
      approve
        ? `Publicada por ${listing.duration_days * 24} horas`
        : "Publicación rechazada e importe devuelto",
    );
  }

  return (
    <article className="surface-card space-y-3 p-3">
      <div className="flex gap-3">
        {images[0] ? (
          <img
            src={images[0]}
            alt={listing.title}
            loading="lazy"
            width={768}
            height={1024}
            className="size-28 shrink-0 rounded-lg object-cover"
          />
        ) : (
          <div className="size-28 shrink-0 rounded-lg bg-muted" aria-hidden="true" />
        )}
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-sm font-semibold">{listing.title}</h2>
            <StatusBadge status={listing.status} />
          </div>
          <p className="text-xs text-muted-foreground">
            {listing.games?.name} · {listing.seller_name} · {listing.region} · {listing.platform}
          </p>
          <p className="text-xs text-muted-foreground">{formatDateTime(listing.created_at)}</p>
          <p className="text-xs text-muted-foreground">
            Contrató {listing.duration_days} día(s) ({listing.duration_days * 24} h) ·{" "}
            {formatCUP(listing.publish_fee)} cobrados
          </p>
          {listing.status === "aprobada" ? (
            <p className="text-xs font-medium text-primary">{remainingLabel(listing.expires_at)}</p>
          ) : null}
          <p className="font-display text-base font-bold text-primary">
            {formatCUP(listing.price)}
          </p>
        </div>
      </div>
      <div className="rounded-md border border-warning/30 bg-warning/10 p-3 text-xs">
        <p className="mb-2 font-semibold text-warning">Datos privados — solo administración</p>
        <dl className="space-y-1">
          <div><dt className="inline text-muted-foreground">Correo: </dt><dd className="inline">{secrets?.account_email}</dd></div>
          <div><dt className="inline text-muted-foreground">Contraseña: </dt><dd className="inline">{secrets?.account_password}</dd></div>
          <div><dt className="inline text-muted-foreground">Acceso: </dt><dd className="inline">{secrets?.admin_access_notes}</dd></div>
        </dl>
      </div>
      {listing.status === "pendiente" ? (
        <div className="flex gap-2">
          <Button size="sm" disabled={working} onClick={() => void review(true)}>
            Aprobar y publicar {listing.duration_days * 24} h
          </Button>
          <Button size="sm" variant="outline" disabled={working} onClick={() => void review(false)}>
            Rechazar
          </Button>
        </div>
      ) : null}
    </article>
  );
}

function AdminMarketplacePage() {
  const { data, isLoading } = useAdminListings();
  const listings = data ?? [];

  return (
    <AdminShell title="Comercio" description="Publicaciones enviadas por los usuarios.">
      {!isLoading && listings.length === 0 ? (
        <EmptyState
          title="Sin publicaciones"
          description="Cuando un usuario envíe una cuenta, aparecerá aquí para revisión."
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {listings.map((listing) => (
            <AdminListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      )}
    </AdminShell>
  );
}
