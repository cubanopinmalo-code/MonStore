import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProtectedNotice } from "@/components/common/states";

export const Route = createFileRoute("/registro")({
  head: () => ({
    meta: [
      { title: "Crear cuenta — MONSTORE" },
      {
        name: "description",
        content: "Regístrate en MONSTORE para recargar tus juegos con wallet en CUP.",
      },
      { property: "og:title", content: "Crear cuenta — MONSTORE" },
      { property: "og:description", content: "Regístrate gratis en MONSTORE." },
    ],
  }),
  component: RegisterPage,
});

function RegisterPage() {
  return (
    <AppShell>
      <div className="mx-auto w-full max-w-md space-y-5 px-4 py-12">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-bold">Crear cuenta</h1>
          <p className="text-sm text-muted-foreground">Es gratis y toma menos de un minuto.</p>
        </div>

        <form
          className="surface-card space-y-4 p-5"
          onSubmit={(event) => {
            event.preventDefault();
            toast.info("Prototipo visual: el registro real llega en la próxima fase.");
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="nombre">Nombre completo</Label>
            <Input id="nombre" placeholder="Tu nombre" autoComplete="name" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="correo">Correo</Label>
            <Input id="correo" type="email" placeholder="correo@ejemplo.com" autoComplete="email" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="telefono">Teléfono</Label>
            <Input id="telefono" placeholder="+53 5 000 0000" autoComplete="tel" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="clave">Contraseña</Label>
            <Input id="clave" type="password" autoComplete="new-password" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="referido">Código de referido (opcional)</Label>
            <Input id="referido" placeholder="MONS-XXXX" />
          </div>
          <Button type="submit" className="w-full">
            Crear cuenta
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            ¿Ya tienes cuenta?{" "}
            <Link to="/login" className="text-primary hover:underline">
              Iniciar sesión
            </Link>
          </p>
        </form>

        <ProtectedNotice area="el registro" />
      </div>
    </AppShell>
  );
}
