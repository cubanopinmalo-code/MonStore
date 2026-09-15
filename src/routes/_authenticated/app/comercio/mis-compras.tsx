import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { UserShell } from "@/components/layout/UserShell";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { PrivateAccountPanel } from "@/components/marketplace/PrivateAccountPanel";
import { useCountdown, useMyPurchases, useSignedImages } from "@/hooks/useMarketplace";
import { formatCUP, formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/app/comercio/mis-compras")({
  head: () => ({
    meta: [
      { title: "Mis cuentas compradas — MONSTORE" },
      {
        name: "description",
        content: "Datos de acceso y doble factor de las cuentas que compraste en MONSTORE.",
      },
      { property: "og:title", content: "Mis cuentas compradas — MONSTORE" },
      { property: "og:description", content: "Asegura tu cuenta en las primeras 24 horas." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MyPurchasesPage,
});

type Purchase = NonNullable<ReturnType<typeof useMyPurchases>["data"]>[number];

function PurchaseCard({ purchase }: { purchase: Purchase }) {
  const images = useSignedImages(purchase.images as string[]);
  const secureLeft = useCountdown(purchase.secure_deadline);

  return (
    <article className="surface-card space-y-3 p-3">
      <div className="flex gap-3">
        {images[0] ? (
          <img
            src={images[0]}
            alt={purchase.title}
            loading="lazy"
            width={768}
            height={1024}
            className="size-24 shrink-0 rounded-lg object-cover"
          />
        ) : (
          <div className="size-24 shrink-0 rounded-lg bg-muted" aria-hidden="true" />
        )}
        <div className="min-w-0 flex-1 space-y-1 text-xs">
          <h2 className="text-sm font-semibold">{purchase.title}</h2>
          <p className="text-muted-foreground">
            {purchase.games?.name} · {purchase.region} · {purchase.platform}
          </p>
          <p className="font-display text-base font-bold text-primary">
            {formatCUP(purchase.sale_amount ?? purchase.price)}
          </p>
          <p className="text-muted-foreground">
            Comprada el {formatDateTime(purchase.sold_at ?? purchase.created_at)}
          </p>
          {secureLeft && secureLeft !== "00:00:00" ? (
            <p className="font-medium text-primary">
              Te quedan {secureLeft} del período recomendado para asegurar la cuenta
            </p>
          ) : (
            <p className="text-muted-foreground">
              Terminó el período inicial. La cuenta sigue siendo tuya.
            </p>
          )}
        </div>
      </div>

      <PrivateAccountPanel listingId={purchase.id} />
    </article>
  );
}

function MyPurchasesPage() {
  const { data, isLoading } = useMyPurchases();
  const purchases = data ?? [];

  return (
    <UserShell>
      <div className="space-y-6">
        <PageHeader
          title="Mis cuentas compradas"
          description="Datos de acceso y doble factor de cada cuenta que compraste."
          action={
            <Button asChild variant="outline" size="touch">
              <Link to="/app/comercio">Ver comercio</Link>
            </Button>
          }
        />

        <div className="flex gap-2 rounded-md border border-success/30 bg-success/10 p-3 text-xs text-muted-foreground">
          <ShieldCheck className="size-4 shrink-0 text-success" aria-hidden="true" />
          <p>
            Cambia el correo, la contraseña, el teléfono y el doble factor en las primeras 24 horas.
            La cuenta es tuya y no vuelve al vendedor.
          </p>
        </div>

        {!isLoading && purchases.length === 0 ? (
          <EmptyState
            title="Todavía no compraste cuentas"
            description="Cuando compres una cuenta, sus datos de acceso aparecerán aquí."
          />
        ) : (
          <div className="grid gap-3">
            {purchases.map((purchase) => (
              <PurchaseCard key={purchase.id} purchase={purchase} />
            ))}
          </div>
        )}
      </div>
    </UserShell>
  );
}
