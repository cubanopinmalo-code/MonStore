import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AdminShell } from "@/components/layout/AdminShell";
import { StatusBadge } from "@/components/common/StatusBadge";
import { EmptyState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PrivateAccountPanel } from "@/components/marketplace/PrivateAccountPanel";
import { supabase } from "@/integrations/supabase/client";
import { useAdminListings, useSignedImages, remainingLabel } from "@/hooks/useMarketplace";
import { useAdminRealtime } from "@/hooks/useAdminPanel";
import { disableListingTotp, rotateListingTotp } from "@/lib/marketplace.functions";
import { formatCUP, formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/comercio")({
  head: () => ({
    meta: [
      { title: "Solicitudes de cuentas — Panel MONSTORE" },
      {
        name: "description",
        content: "Revisión, publicación y seguimiento de las cuentas de la comunidad.",
      },
      { property: "og:title", content: "Solicitudes de cuentas — Panel MONSTORE" },
      { property: "og:description", content: "Revisa, publica y sigue cada cuenta en venta." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminMarketplacePage,
});

type Listing = NonNullable<ReturnType<typeof useAdminListings>["data"]>[number];

const TABS = [
  { id: "pendiente", label: "Pendientes" },
  { id: "publicada", label: "Publicadas" },
  { id: "vendida", label: "Vendidas" },
  { id: "expirada", label: "Expiradas" },
  { id: "republicar", label: "Listas para republicar" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function tabOf(listing: Listing): TabId | "otras" {
  if (listing.status === "pendiente") return "pendiente";
  if (listing.status === "aprobada" && !listing.buyer_id) return "publicada";
  if (listing.status === "vendida" || listing.buyer_id) return "vendida";
  if (listing.status === "expirada") return "expirada";
  if (listing.status === "retirada" || listing.status === "rechazada") return "republicar";
  return "otras";
}

function AdminListingCard({ listing }: { listing: Listing }) {
  const queryClient = useQueryClient();
  const images = useSignedImages(listing.images as string[]);
  const rotate = useServerFn(rotateListingTotp);
  const disable = useServerFn(disableListingTotp);
  const [working, setWorking] = useState(false);
  const [finalEmail, setFinalEmail] = useState("");
  const [finalPassword, setFinalPassword] = useState("");
  const [finalNotes, setFinalNotes] = useState("");

  async function refresh() {
    await queryClient.invalidateQueries();
  }

  async function run(action: () => Promise<void>, success: string) {
    setWorking(true);
    try {
      await action();
      await refresh();
      toast.success(success);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No pudimos completar la acción.");
    } finally {
      setWorking(false);
    }
  }

  async function review(approve: boolean) {
    const reason = approve
      ? null
      : window.prompt("Motivo del rechazo (se le devuelve el importe al vendedor):") ?? "";
    if (!approve && !reason) return;
    await run(async () => {
      const { error } = await supabase.rpc("review_game_account", {
        p_listing: listing.id,
        p_approve: approve,
        p_reason: reason ?? "",
      });
      if (error) throw new Error(error.message);
    }, approve ? `Publicada por ${listing.duration_days * 24} horas` : "Publicación rechazada e importe devuelto");
  }

  async function withdraw() {
    const reason = window.prompt("Motivo para retirar la publicación:") ?? "";
    if (!reason) return;
    await run(async () => {
      const { error } = await supabase.rpc("withdraw_listing", {
        p_listing: listing.id,
        p_reason: reason,
      });
      if (error) throw new Error(error.message);
    }, "Publicación retirada del comercio");
  }

  async function saveFinal() {
    if (!finalEmail && !finalPassword) {
      toast.error("Escribe el correo y la contraseña finales.");
      return;
    }
    await run(async () => {
      const { error } = await supabase.rpc("admin_set_listing_secrets", {
        p_listing: listing.id,
        p_final_email: finalEmail,
        p_final_password: finalPassword,
        p_final_notes: finalNotes,
      });
      if (error) throw new Error(error.message);
      setFinalPassword("");
    }, "Datos finales guardados y cifrados");
  }

  const tab = tabOf(listing);
  const canWithdraw = !listing.buyer_id && (listing.status === "aprobada" || listing.status === "pendiente");

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
            Contrató {listing.duration_days} día(s) · {formatCUP(listing.publish_fee)} cobrados
          </p>
          {tab === "publicada" ? (
            <p className="text-xs font-medium text-primary">{remainingLabel(listing.expires_at)}</p>
          ) : null}
          {tab === "vendida" ? (
            <p className="text-xs font-medium text-success">
              Vendida el {formatDateTime(listing.sold_at ?? listing.updated_at)} ·{" "}
              {listing.funds_status === "liberado"
                ? "pago acreditado al vendedor"
                : listing.funds_status === "pendiente_liberacion"
                  ? "liberación pendiente"
                  : "pago retenido"}
            </p>
          ) : null}
          {tab === "expirada" ? (
            <p className="text-xs text-muted-foreground">
              Venció sin comprador. El vendedor ya puede asegurarla y volver a publicarla.
            </p>
          ) : null}
          {listing.withdrawn_reason ? (
            <p className="text-xs text-muted-foreground">Retirada: {listing.withdrawn_reason}</p>
          ) : null}
          <p className="font-display text-base font-bold text-primary">{formatCUP(listing.price)}</p>
        </div>
      </div>

      <PrivateAccountPanel listingId={listing.id} />

      {!listing.buyer_id ? (
        <div className="space-y-2 rounded-md border border-border/60 p-3 text-xs">
          <p className="font-semibold">Datos finales que recibirá el comprador</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor={`fe-${listing.id}`}>Correo final</Label>
              <Input
                id={`fe-${listing.id}`}
                value={finalEmail}
                onChange={(event) => setFinalEmail(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`fp-${listing.id}`}>Contraseña final</Label>
              <Input
                id={`fp-${listing.id}`}
                value={finalPassword}
                onChange={(event) => setFinalPassword(event.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor={`fn-${listing.id}`}>Cómo entrar (opcional)</Label>
            <Input
              id={`fn-${listing.id}`}
              value={finalNotes}
              onChange={(event) => setFinalNotes(event.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={working} onClick={() => void saveFinal()}>
              Guardar datos finales
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={working}
              onClick={() =>
                void run(async () => {
                  const result = await rotate({ data: { listingId: listing.id, active: true } });
                  window.prompt("Clave para tu app de autenticación (guárdala):", result.secret);
                }, "Doble factor configurado")
              }
            >
              Generar doble factor
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={working}
              onClick={() =>
                void run(async () => {
                  await disable({ data: { listingId: listing.id } });
                }, "Doble factor desactivado")
              }
            >
              Quitar doble factor
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {listing.status === "pendiente" ? (
          <>
            <Button size="sm" disabled={working} onClick={() => void review(true)}>
              Aprobar y publicar {listing.duration_days * 24} h
            </Button>
            <Button size="sm" variant="outline" disabled={working} onClick={() => void review(false)}>
              Rechazar
            </Button>
          </>
        ) : null}
        {canWithdraw ? (
          <Button size="sm" variant="outline" disabled={working} onClick={() => void withdraw()}>
            Retirar publicación
          </Button>
        ) : null}
        {listing.buyer_id ? (
          <p className="text-xs text-muted-foreground">
            Entrega automática {listing.credentials_delivered_at ? "completada" : "pendiente"} ·
            esta cuenta ya pertenece al comprador.
          </p>
        ) : null}
      </div>
    </article>
  );
}

function AdminMarketplacePage() {
  const { data, isLoading } = useAdminListings();
  useAdminRealtime(["listings-admin", "account-sales", "admin-panel"]);
  const [tab, setTab] = useState<TabId>("pendiente");

  const grouped = useMemo(() => {
    const map = new Map<string, Listing[]>();
    for (const listing of data ?? []) {
      const key = tabOf(listing);
      map.set(key, [...(map.get(key) ?? []), listing]);
    }
    return map;
  }, [data]);

  const listings = grouped.get(tab) ?? [];

  return (
    <AdminShell
      title="Solicitudes de cuentas"
      description="Revisa, publica y sigue cada cuenta enviada por la comunidad."
    >
      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((item) => (
          <Button
            key={item.id}
            size="sm"
            variant={tab === item.id ? "gradient" : "outline"}
            aria-pressed={tab === item.id}
            onClick={() => setTab(item.id)}
          >
            {item.label} ({(grouped.get(item.id) ?? []).length})
          </Button>
        ))}
      </div>

      {!isLoading && listings.length === 0 ? (
        <EmptyState
          title="Nada por aquí"
          description="Cuando haya cuentas en este estado, aparecerán en esta lista."
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
