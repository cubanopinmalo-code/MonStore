import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Camera, Copy, Gift, MessageCircle, Pencil, Share2 } from "lucide-react";
import { type MouseEvent, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { UserShell } from "@/components/layout/UserShell";
import { PageHeader } from "@/components/common/PageHeader";
import { SignOutDialog } from "@/components/common/SignOutDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useProfile, useReferrals } from "@/hooks/useAccount";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_USD_MARGIN, DEFAULT_USD_RATE, getUsdRate } from "@/lib/catalog.functions";
import { claimReferralReward } from "@/lib/payments.functions";

const REFERRAL_GOAL = 10;
const SUPPORT_PHONE = "5351115040";
const SUPPORT_WHATSAPP_URL =
  "https://wa.me/" +
  SUPPORT_PHONE +
  "?text=" +
  encodeURIComponent("Hola MONSTORE, necesito ayuda con mi cuenta.");

function openSupportChat(event: MouseEvent<HTMLAnchorElement>) {
  // In some embedded previews target="_blank" is blocked, so fall back to direct navigation.
  event.preventDefault();
  const opened = window.open(
    SUPPORT_WHATSAPP_URL,
    "_blank",
    "noopener,noreferrer",
  );
  if (!opened) window.location.assign(SUPPORT_WHATSAPP_URL);
}

export const Route = createFileRoute("/_authenticated/app/perfil")({
  head: () => ({
    meta: [
      { title: "Mi perfil — MONSTORE" },
      { name: "description", content: "Datos personales y configuración de tu cuenta." },
    ],
  }),
  loader: async () => {
    try {
      return await getUsdRate();
    } catch {
      return { rate: DEFAULT_USD_RATE, margin: DEFAULT_USD_MARGIN };
    }
  },
  component: ProfilePage,
});

function ProfilePage() {
  const { rate: usdRate } = Route.useLoaderData();
  const rewardCup = Math.round(usdRate);
  const queryClient = useQueryClient();
  const { data: profile, isLoading } = useProfile();
  const { data: referrals } = useReferrals();
  
  const [claiming, setClaiming] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const avatarPath = profile?.avatar ?? null;

  useEffect(() => {
    let cancelled = false;
    if (!avatarPath) {
      setAvatarUrl(null);
      return;
    }
    void supabase.storage
      .from("avatars")
      .createSignedUrl(avatarPath, 3600)
      .then(({ data }) => {
        if (!cancelled) setAvatarUrl(data?.signedUrl ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [avatarPath]);

  async function handleAvatarChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !profile) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Selecciona una imagen válida");
      return;
    }
    setUploading(true);
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${profile.id}/avatar-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (uploadError) {
      setUploading(false);
      toast.error("No pudimos subir la foto", { description: uploadError.message });
      return;
    }
    const { error } = await supabase.from("profiles").update({ avatar: path }).eq("id", profile.id);
    setUploading(false);
    if (error) {
      toast.error("No pudimos guardar la foto");
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["profile"] });
    toast.success("Foto de perfil actualizada");
  }

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

  const claimRewardFn = useServerFn(claimReferralReward);

  async function claimReward() {
    setClaiming(true);
    try {
      const result = await claimRewardFn();
      const amount = Number(result?.amount ?? 0);
      await queryClient.invalidateQueries({ queryKey: ["referrals"] });
      await queryClient.invalidateQueries({ queryKey: ["wallet"] });
      await queryClient.invalidateQueries({ queryKey: ["wallet-transactions"] });
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
      toast.success("¡Premio agregado a tu wallet!", {
        description: `Sumamos ${amount.toLocaleString("es-CU")} CUP (1 USD) a tu saldo.`,
      });
    } catch (error) {
      toast.error("No pudimos entregar el premio", {
        description: error instanceof Error ? error.message : "Inténtalo de nuevo.",
      });
    } finally {
      setClaiming(false);
    }
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


  return (
    <UserShell>
      <div className="mx-auto max-w-xl space-y-5">
        <PageHeader title="Mi perfil" description="Datos personales y preferencias." />

        <div className="surface-card flex items-center gap-4 p-5">
          <div className="relative">
            <Avatar className="size-16">
              {avatarUrl ? <AvatarImage src={avatarUrl} alt={`Foto de ${name}`} /> : null}
              <AvatarFallback className="bg-primary/12 text-lg text-primary">
                {initials}
              </AvatarFallback>
            </Avatar>
            <button
              type="button"
              aria-label="Cambiar foto de perfil"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              className="absolute -bottom-1 -right-1 grid size-7 place-items-center rounded-full border border-border bg-primary text-primary-foreground disabled:opacity-60"
            >
              <Camera className="size-3.5" aria-hidden="true" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => void handleAvatarChange(e)}
            />
          </div>
          <div>
            <p className="text-base font-semibold">{name}</p>
            <p className="text-sm text-muted-foreground">{profile?.phone ?? ""}</p>
            <p className="text-xs text-muted-foreground">
              {uploading ? "Subiendo foto…" : "Toca la cámara para cambiar tu foto"}
            </p>
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
                ? `Te faltan ${remaining} invitados para ganar ${rewardCup} CUP gratis.`
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
          <section className="surface-card space-y-3 p-5">
            <div>
              <h2 className="text-base font-semibold">Datos personales</h2>
              <p className="text-xs text-muted-foreground">
                Nombre, provincia y municipio de tu cuenta.
              </p>
            </div>
            <Button asChild className="w-full">
              <Link to="/app/editar-perfil">
                <Pencil className="size-4" aria-hidden="true" />
                Editar perfil
              </Link>
            </Button>
          </section>
        )}

        <section className="surface-card space-y-3 p-5">
          <div>
            <h2 className="text-base font-semibold">Ayuda al cliente</h2>
            <p className="text-xs text-muted-foreground">
              ¿Tienes un problema con un pedido o tus fondos? Escríbenos por WhatsApp.
            </p>
          </div>
          <Button asChild className="w-full">
            <a
              onClick={openSupportChat}
              href={SUPPORT_WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Abrir chat de ayuda al cliente en WhatsApp"
            >
              <MessageCircle className="size-4" aria-hidden="true" />
              Ayuda al cliente por WhatsApp
            </a>
          </Button>
        </section>

        <SignOutDialog>
          <Button variant="outline" className="w-full">
            Cerrar sesión
          </Button>
        </SignOutDialog>
      </div>
    </UserShell>
  );
}
