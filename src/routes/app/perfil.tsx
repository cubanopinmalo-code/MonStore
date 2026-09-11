import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { UserShell } from "@/components/layout/UserShell";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { mockProfile } from "@/data/mock/account";

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
            <p className="text-sm text-muted-foreground">{mockProfile.email}</p>
            <p className="text-xs text-primary">Código: {mockProfile.referral_code}</p>
          </div>
        </div>

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
