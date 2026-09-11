import { createFileRoute } from "@tanstack/react-router";
import { Copy, Gift, Users } from "lucide-react";
import { toast } from "sonner";
import { UserShell } from "@/components/layout/UserShell";
import { PageHeader, StatCard } from "@/components/common/PageHeader";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { mockProfile, mockReferrals } from "@/data/mock/account";
import { formatCUP, formatDate } from "@/lib/format";

export const Route = createFileRoute("/app/referidos")({
  head: () => ({
    meta: [
      { title: "Referidos — MONSTORE" },
      { name: "description", content: "Invita amigos y sigue tus recompensas." },
    ],
  }),
  component: ReferralsPage,
});

function ReferralsPage() {
  const link = `https://monstore.cu/?ref=${mockProfile.referral_code}`;
  const rewards = mockReferrals.reduce((total, item) => total + item.reward_amount, 0);

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
            value={String(mockReferrals.length)}
            icon={<Users className="size-4" aria-hidden="true" />}
          />
          <StatCard
            label="Activos"
            value={String(mockReferrals.filter((r) => r.status === "activo").length)}
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
          <div className="grid gap-2">
            {mockReferrals.map((referral) => (
              <div key={referral.id} className="surface-card flex items-center justify-between p-4">
                <div>
                  <p className="text-sm font-medium">{referral.referred_name}</p>
                  <p className="text-xs text-muted-foreground">
                    Desde {formatDate(referral.created_at)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm">{formatCUP(referral.reward_amount)}</span>
                  <StatusBadge status={referral.status} />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </UserShell>
  );
}
