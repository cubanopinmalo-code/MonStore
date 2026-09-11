import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { signInWithPhone, signUpWithPhone } from "@/lib/auth";

type AuthSearch = { ref?: string; evento?: string };


export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): AuthSearch => {
    const result: AuthSearch = {};
    if (typeof search['ref'] === "string" && search['ref'].length > 0) {
      result.ref = search['ref'];
    }
    if (typeof search['evento'] === "string" && search['evento'].length > 0) {
      result.evento = search['evento'];
    }
    return result;
  },
  head: () => ({
    meta: [
      { title: "MONSTORE — Inicia sesión o crea tu cuenta" },
      {
        name: "description",
        content:
          "Accede a MONSTORE con tu número de teléfono para recargar juegos y usar tu wallet en CUP.",
      },
      { property: "og:title", content: "MONSTORE — Acceso" },
      {
        property: "og:description",
        content: "Inicia sesión o crea tu cuenta MONSTORE solo con tu teléfono.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { ref, evento } = Route.useSearch();
  const sharedEvent = evento ? mockEvents.find((item) => item.id === evento) : undefined;
  const [tab, setTab] = useState<"login" | "registro">("login");

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 py-10">
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{ background: "var(--gradient-surface)" }}
        aria-hidden="true"
      />

      <div className="relative w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <Logo />
          <h1 className="text-2xl font-bold">Bienvenido a MONSTORE</h1>
          <p className="text-sm text-muted-foreground">
            Recargas de videojuegos y wallet en CUP. Entra con tu número de teléfono.
          </p>
        </div>

        {sharedEvent ? (
          <div className="surface-card space-y-1 p-4 text-center">
            <p className="text-sm font-semibold text-primary">
              Te invitaron al evento {sharedEvent.name}
            </p>
            <p className="text-xs text-muted-foreground">
              Crea tu cuenta o inicia sesión y te llevamos directo a este evento.
            </p>
          </div>
        ) : null}

        <Tabs value={tab} onValueChange={(value) => setTab(value as "login" | "registro")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="login">Iniciar sesión</TabsTrigger>
            <TabsTrigger value="registro">Crear cuenta</TabsTrigger>
          </TabsList>

          <TabsContent value="login">
            <form
              className="surface-card mt-4 space-y-4 p-5"
              onSubmit={(event) => {
                event.preventDefault();
                toast.info("Prototipo visual: el acceso real llega en la próxima fase.");
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="login-telefono">Número de teléfono</Label>
                <Input
                  id="login-telefono"
                  type="tel"
                  inputMode="tel"
                  placeholder="+53 5 000 0000"
                  autoComplete="tel"
                  maxLength={20}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="login-clave">Contraseña</Label>
                <Input id="login-clave" type="password" autoComplete="current-password" />
              </div>
              <Button type="submit" className="w-full">
                Entrar
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="registro">
            <form
              className="surface-card mt-4 space-y-4 p-5"
              onSubmit={(event) => {
                event.preventDefault();
                toast.info("Prototipo visual: el registro real llega en la próxima fase.");
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="reg-nombre">Nombre completo</Label>
                <Input id="reg-nombre" placeholder="Tu nombre" autoComplete="name" maxLength={100} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reg-telefono">Número de teléfono</Label>
                <Input
                  id="reg-telefono"
                  type="tel"
                  inputMode="tel"
                  placeholder="+53 5 000 0000"
                  autoComplete="tel"
                  maxLength={20}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reg-clave">Contraseña</Label>
                <Input id="reg-clave" type="password" autoComplete="new-password" />
              </div>
              {ref ? (
                <p className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-xs text-primary">
                  Te invitó el enlace de referido <span className="font-semibold">{ref}</span>.
                </p>
              ) : null}
              <Button type="submit" className="w-full">
                Crear cuenta
              </Button>
            </form>
          </TabsContent>
        </Tabs>

        <div className="border-t border-border/70 pt-5 text-center">
          <p className="mb-3 text-xs text-muted-foreground">
            Acceso temporal mientras terminamos MONSTORE
          </p>
          <Button asChild variant="outline" className="w-full">
            {sharedEvent ? (
              <Link to="/app/eventos/$id" params={{ id: sharedEvent.id }}>
                Entrar como usuario de prueba
              </Link>
            ) : (
              <Link to="/app">Entrar como usuario de prueba</Link>
            )}
          </Button>
        </div>

        <ProtectedNotice area="el acceso a la cuenta" />
      </div>
    </main>
  );
}
