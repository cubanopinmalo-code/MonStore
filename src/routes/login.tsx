import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProtectedNotice } from "@/components/common/states";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Iniciar sesión — MONSTORE" },
      {
        name: "description",
        content: "Accede a tu cuenta MONSTORE para recargar juegos y gestionar tu wallet en CUP.",
      },
      { property: "og:title", content: "Iniciar sesión — MONSTORE" },
      { property: "og:description", content: "Accede a tu cuenta MONSTORE." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  return (
    <AppShell>
      <div className="mx-auto w-full max-w-md space-y-5 px-4 py-12">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-bold">Iniciar sesión</h1>
          <p className="text-sm text-muted-foreground">Entra a tu cuenta MONSTORE.</p>
        </div>

        <form
          className="surface-card space-y-4 p-5"
          onSubmit={(event) => {
            event.preventDefault();
            toast.info("Prototipo visual: el acceso real llega en la próxima fase.");
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="email">Correo o teléfono</Label>
            <Input id="email" type="text" placeholder="correo@ejemplo.com" autoComplete="username" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Contraseña</Label>
            <Input id="password" type="password" autoComplete="current-password" />
          </div>
          <Button type="submit" className="w-full">
            Entrar
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            ¿No tienes cuenta?{" "}
            <Link to="/registro" className="text-primary hover:underline">
              Crear cuenta
            </Link>
          </p>
        </form>

        <ProtectedNotice area="el inicio de sesión" />

        <div className="text-center">
          <Button asChild variant="outline" size="sm">
            <Link to="/app">Ver el área de usuario (demo)</Link>
          </Button>
        </div>
      </div>
    </AppShell>
  );
}
