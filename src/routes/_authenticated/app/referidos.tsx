import { createFileRoute } from "@tanstack/react-router";
import { Copy, Gift, Users } from "lucide-react";
import { toast } from "sonner";
import { UserShell } from "@/components/layout/UserShell";
import { PageHeader, StatCard } from "@/components/common/PageHeader";
import { StatusBadge } from "@/components/common/StatusBadge";
import { EmptyState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useProfile, useReferrals } from "@/hooks/useAccount";
import { formatCUP, formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/app/referidos")({
  head: () => ({
    meta: [
      { title: "Referidos — MONSTORE" },
      { name: "description", content: "Invita amigos y sigue tus recompensas." },
    ],
  }),
  component: ReferralsPage,
});

function ReferralsPage() {
  const { data: profile } = useProfile();
  const { data: referralsData } = useReferrals();
  const referrals = referralsData ?? [];

  const origin = typeof window !== "undefined" ? window.location.origin : "https://monstore.cu";
  const link = profile ? `${origin}/?ref=${profile.referral_code}` : "";
  const rewards = referrals.reduce((total, item) => total + Number(item.reward_amount ?? 0), 0);

  function copy(value: string, label: string) {
    void navigator.clipboard?.writeText(value);
    toast.success(`${label} copiado`);
  }

  return (
    <UserShell>
      <div className="space-y-6">
        <PageHeader title="Referidos" description="Invita y gana recompensas." />

        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard
            label="Invitados"
            value={String(referrals.length)}
            icon={<Users className="size-4" aria-hidden="true" />}
          />
          <StatCard
            label="Activos"
            value={String(referrals.filter((r) => r.status === "activo").length)}
          />
          <StatCard
            label="Recompensas"
            value={formatCUP(rewards)}
            icon={<Gift className="size-4" aria-hidden="true" />}
          />
        </div>

        <div className="surface-card space-y-3 p-5">
          <div className="space-y-1.5">
            <Label htmlFor="enlace">Tu enlace de invitación</Label>
            <div className="flex gap-2">
              <Input id="enlace" readOnly value={link} />
              <Button
                variant="outline"
                size="icon"
                onClick={() => copy(link, "Enlace")}
                aria-label="Copiar enlace"
              >
                <Copy className="size-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Comparte este enlace: quien entre por él queda registrado como tu invitado
            automáticamente. No hay códigos para escribir a mano.
          </p>
        </div>

        <section className="space-y-3">
          <h2 className="text-lg font-bold">Tus invitados</h2>
          {referrals.length === 0 ? (
            <EmptyState title="Todavía no tienes invitados" />
          ) : (
            <div className="grid gap-2">
              {referrals.map((referral) => (
                <div
                  key={referral.id}
                  className="surface-card flex items-center justify-between p-4"
                >
                  <div>
                    <p className="text-sm font-medium">Invitado</p>
                    <p className="text-xs text-muted-foreground">
                      Desde {formatDate(referral.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm">{formatCUP(Number(referral.reward_amount))}</span>
                    <StatusBadge status={referral.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </UserShell>
  );
}
