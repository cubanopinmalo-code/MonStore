import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { UserShell } from "@/components/layout/UserShell";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusBadge } from "@/components/common/StatusBadge";
import { EmptyState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PrivateAccountPanel } from "@/components/marketplace/PrivateAccountPanel";
import { supabase } from "@/integrations/supabase/client";
import { formatCUP, formatDate } from "@/lib/format";
import {
  feeForDays,
  useListingFee,
  useMyListings,
  useSignedImages,
  remainingLabel,
} from "@/hooks/useMarketplace";

export const Route = createFileRoute("/_authenticated/app/comercio/mis-publicaciones")({
  head: () => ({
    meta: [
      { title: "Mis publicaciones — MONSTORE" },
      { name: "description", content: "Estado de las cuentas que publicaste." },
    ],
  }),
  component: MyListingsPage,
});

type Listing = NonNullable<ReturnType<typeof useMyListings>["data"]>[number];

function MyListingCard({ listing }: { listing: Listing }) {
  const images = useSignedImages(listing.images as string[]);
  const cover = images[0];
  const remaining = listing.status === "aprobada" ? remainingLabel(listing.expires_at) : null;

  return (
    <article className="surface-card flex gap-3 p-3">
      {cover ? (
        <img
          src={cover}
          alt={listing.title}
          loading="lazy"
          width={768}
          height={1024}
          className="size-24 shrink-0 rounded-lg object-cover"
        />
      ) : (
        <div className="size-24 shrink-0 rounded-lg bg-muted" aria-hidden="true" />
      )}
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-sm font-semibold">{listing.title}</h2>
          <StatusBadge status={listing.status} />
        </div>
        <p className="text-xs text-muted-foreground">
          {listing.games?.name} · {formatDate(listing.created_at)}
        </p>
        <p className="text-xs text-muted-foreground">
          {listing.duration_days} día(s) contratados · {formatCUP(listing.publish_fee)} pagados
        </p>
        {remaining ? <p className="text-xs font-medium text-primary">{remaining}</p> : null}
        {listing.status === "pendiente" ? (
          <p className="text-xs text-muted-foreground">
            Al ser aprobada se publicará por {listing.duration_days * 24} horas.
          </p>
        ) : null}
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
}

function MyListingsPage() {
  const { data, isLoading } = useMyListings();
  const listings = data ?? [];

  return (
    <UserShell>
      <div className="space-y-6">
        <PageHeader
          title="Mis publicaciones"
          description="Sigue el estado de cada anuncio."
          action={
            <Button asChild variant="gradient" size="touch">
              <Link to="/app/comercio/publicar">
                <Plus aria-hidden="true" />
                Publicar otra
              </Link>
            </Button>
          }
        />

        {!isLoading && listings.length === 0 ? (
          <EmptyState
            title="No tienes publicaciones todavía"
            description="Publica una cuenta y aparecerá aquí."
          />
        ) : (
          <div className="grid gap-3">
            {listings.map((listing) => (
              <MyListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        )}
      </div>
    </UserShell>
  );
}
