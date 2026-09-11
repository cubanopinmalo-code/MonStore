import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Copy, Gift, Share2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { UserShell } from "@/components/layout/UserShell";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useClearAccountCache, useProfile, useReferrals } from "@/hooks/useAccount";
import { supabase } from "@/integrations/supabase/client";
import { signOut } from "@/lib/auth";
import { getUsdRate } from "@/lib/catalog.functions";

const REFERRAL_GOAL = 10;

export const Route = createFileRoute("/_authenticated/app/perfil")({
  head: () => ({
    meta: [
      { title: "Mi perfil — MONSTORE" },
      { name: "description", content: "Datos personales y configuración de tu cuenta." },
    ],
  }),
  loader: () => getUsdRate(),
  component: ProfilePage,
});

function ProfilePage() {
  const navigate = useNavigate();
  const { rate: usdRate } = Route.useLoaderData();
  const rewardCup = Math.round(usdRate);
  const queryClient = useQueryClient();
  const clearCache = useClearAccountCache();
  const { data: profile, isLoading } = useProfile();
  const { data: referrals } = useReferrals();
  const [saving, setSaving] = useState(false);
  const [claiming, setClaiming] = useState(false);

  const name = profile?.name || "Mi cuenta";
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const origin = typeof window !== "undefined" ? window.location.origin : "https://monstore.cu";
  const referralLink = profile ? `${origin}/?ref=${profile.referral_code}` : "";
  const invited = (referrals ?? []).filter((item) => !item.reward_claimed_at).length;
  const progress = Math.min((invited / REFERRAL_GOAL) * 100, 100);
  const remaining = Math.max(REFERRAL_GOAL - invited, 0);
  const canClaim = invited >= REFERRAL_GOAL;

  async function claimReward() {
    setClaiming(true);
    const { data, error } = await supabase.rpc("claim_referral_reward");
    setClaiming(false);
    if (error) {
      toast.error("No pudimos entregar el premio", { description: error.message });
      return;
    }
    const amount = Number((data as { amount?: number } | null)?.amount ?? 0);
    await queryClient.invalidateQueries({ queryKey: ["referrals"] });
    await queryClient.invalidateQueries({ queryKey: ["wallet"] });
    await queryClient.invalidateQueries({ queryKey: ["wallet-transactions"] });
    await queryClient.invalidateQueries({ queryKey: ["notifications"] });
    toast.success("¡Premio agregado a tu wallet!", {
      description: `Sumamos ${amount.toLocaleString("es-CU")} CUP (1 USD) a tu saldo.`,
    });
  }

  async function copyLink() {
    await navigator.clipboard?.writeText(referralLink);
    toast.success("Enlace de referidos copiado");
  }

  async function shareLink() {
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({
          title: "MONSTORE",
          text: "Recarga tus juegos con MONSTORE",
          url: referralLink,
        });
        return;
      } catch {
        // el usuario canceló: seguimos con la copia
      }
    }
    await copyLink();
  }

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile) return;
    const form = new FormData(event.currentTarget);
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        name: String(form.get("name") ?? ""),
        phone: String(form.get("phone") ?? ""),
        province: String(form.get("province") ?? ""),
        municipality: String(form.get("municipality") ?? ""),
      })
      .eq("id", profile.id);
    setSaving(false);
    if (error) {
      toast.error("No pudimos guardar los cambios.");
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["profile"] });
    toast.success("Cambios guardados");
  }

  async function handleSignOut() {
    await clearCache();
    await signOut();
    void navigate({ to: "/", replace: true });
  }

  return (
    <UserShell>
      <div className="mx-auto max-w-xl space-y-5">
        <PageHeader title="Mi perfil" description="Datos personales y preferencias." />

        <div className="surface-card flex items-center gap-4 p-5">
          <Avatar className="size-16">
            <AvatarFallback className="bg-primary/12 text-lg text-primary">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="text-base font-semibold">{name}</p>
            <p className="text-sm text-muted-foreground">{profile?.phone ?? ""}</p>
          </div>
        </div>

        <section className="surface-card space-y-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Referidos y recompensas</h2>
              <p className="text-xs text-muted-foreground">
                Invita 10 personas y gana {rewardCup} CUP gratis.
              </p>
            </div>
            <span className="text-primary">
              <Gift className="size-5" aria-hidden="true" />
            </span>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">
                {invited} de {REFERRAL_GOAL} invitados
              </span>
              <span className="text-muted-foreground">{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} aria-label="Progreso hacia la recompensa" />
            <p className="text-xs text-muted-foreground">
              {remaining > 0
                ? `Te faltan ${remaining} invitados para ganar (valor de la base actual = ${rewardCup} CUP) Gratis.`
                : `¡Recompensa desbloqueada! Tienes ${rewardCup} CUP gratis.`}
            </p>
          </div>

          <Button
            className="w-full"
            disabled={!canClaim || claiming}
            onClick={() => void claimReward()}
          >
            <Gift className="size-4" aria-hidden="true" />
            {claiming
              ? "Entregando premio…"
              : canClaim
                ? `Obtener premio (${rewardCup} CUP en tu wallet)`
                : "Premio disponible al llegar a 10 invitados"}
          </Button>

          <div className="space-y-1.5">
            <Label htmlFor="enlace-referido">Tu enlace de referidos</Label>
            <Input id="enlace-referido" readOnly value={referralLink} />
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => void copyLink()}>
                <Copy className="size-4" aria-hidden="true" />
                Copiar
              </Button>
              <Button className="flex-1" onClick={() => void shareLink()}>
                <Share2 className="size-4" aria-hidden="true" />
                Compartir
              </Button>
            </div>
          </div>

          <Button asChild variant="ghost" size="sm" className="w-full">
            <Link to="/app/referidos">Ver mis referidos</Link>
          </Button>
        </section>

        {isLoading ? null : (
          <form className="surface-card space-y-4 p-5" onSubmit={(e) => void handleSave(e)}>
            <div className="space-y-1.5">
              <Label htmlFor="nombre">Nombre</Label>
              <Input id="nombre" name="name" defaultValue={profile?.name ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="telefono">Teléfono</Label>
              <Input id="telefono" name="phone" defaultValue={profile?.phone ?? ""} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="provincia">Provincia</Label>
                <Input id="provincia" name="province" defaultValue={profile?.province ?? ""} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="municipio">Municipio</Label>
                <Input
                  id="municipio"
                  name="municipality"
                  defaultValue={profile?.municipality ?? ""}
                />
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? "Guardando…" : "Guardar cambios"}
            </Button>
          </form>
        )}

        <Button variant="outline" className="w-full" onClick={() => void handleSignOut()}>
          Cerrar sesión
        </Button>
      </div>
    </UserShell>
  );
}
