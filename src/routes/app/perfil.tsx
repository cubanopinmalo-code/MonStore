import { createFileRoute, Link } from "@tanstack/react-router";
import { Copy, Gift, Share2 } from "lucide-react";
import { toast } from "sonner";
import { UserShell } from "@/components/layout/UserShell";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { mockProfile, mockReferrals } from "@/data/mock/account";

const REFERRAL_GOAL = 10;

export const Route = createFileRoute("/app/perfil")({
  head: () => ({
    meta: [
      { title: "Mi perfil — MONSTORE" },
      { name: "description", content: "Datos personales y configuración de tu cuenta." },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const initials = mockProfile.name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2);

  const referralLink = `https://monstore.cu/?ref=${mockProfile.referral_code}`;
  const invited = mockReferrals.length;
  const progress = Math.min((invited / REFERRAL_GOAL) * 100, 100);
  const remaining = Math.max(REFERRAL_GOAL - invited, 0);

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
          <Avatar className="size-16">
            <AvatarFallback className="bg-primary/12 text-lg text-primary">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="text-base font-semibold">{mockProfile.name}</p>
            <p className="text-sm text-muted-foreground">{mockProfile.phone}</p>
          </div>
        </div>

        <section className="surface-card space-y-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Referidos y recompensas</h2>
              <p className="text-xs text-muted-foreground">
                Invita 10 personas y obtén una compra de 1 USD gratis.
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
                ? `Te faltan ${remaining} invitados para tu compra de 1 USD gratis.`
                : "¡Recompensa desbloqueada! Tienes una compra de 1 USD gratis."}
            </p>
          </div>

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


        <form
          className="surface-card space-y-4 p-5"
          onSubmit={(event) => {
            event.preventDefault();
            toast.success("Cambios guardados (prototipo)");
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="nombre">Nombre</Label>
            <Input id="nombre" defaultValue={mockProfile.name} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="telefono">Teléfono</Label>
            <Input id="telefono" defaultValue={mockProfile.phone} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="provincia">Provincia</Label>
              <Input id="provincia" defaultValue={mockProfile.province} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="municipio">Municipio</Label>
              <Input id="municipio" defaultValue={mockProfile.municipality} />
            </div>
          </div>
          <Button type="submit" className="w-full">
            Guardar cambios
          </Button>
        </form>

        <div className="surface-card space-y-4 p-5">
          <h2 className="text-base font-semibold">Configuración</h2>
          <label className="flex items-center justify-between gap-4 text-sm">
            <span>
              Avisos de pedidos
              <span className="block text-xs text-muted-foreground">
                Recibe una notificación al completarse una recarga.
              </span>
            </span>
            <Switch defaultChecked />
          </label>
          <label className="flex items-center justify-between gap-4 text-sm">
            <span>
              Novedades y ofertas
              <span className="block text-xs text-muted-foreground">
                Promociones ocasionales de MONSTORE.
              </span>
            </span>
            <Switch />
          </label>
        </div>

        <Button asChild variant="outline" className="w-full">
          <Link to="/">Cerrar sesión</Link>
        </Button>
      </div>
    </UserShell>
  );
}
