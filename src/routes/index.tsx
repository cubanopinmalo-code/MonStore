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
  const navigate = useNavigate();
  const [tab, setTab] = useState<"login" | "registro">("login");
  const [loading, setLoading] = useState(false);
  // Mientras comprobamos la sesión guardada no mostramos el formulario:
  // así quien ya entró una vez vuelve directo a su cuenta.
  const [checking, setChecking] = useState(true);

  const goToApp = () => {
    if (evento) {
      void navigate({ to: "/app/eventos/$id", params: { id: evento }, replace: true });
    } else {
      void navigate({ to: "/app", replace: true });
    }
  };

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (data.session) goToApp();
      else setChecking(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (session && (event === "SIGNED_IN" || event === "TOKEN_REFRESHED")) goToApp();
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setLoading(true);
    const { error } = await signInWithPhone(
      String(form.get("phone") ?? ""),
      String(form.get("password") ?? ""),
    );
    setLoading(false);
    if (error) {
      toast.error("No pudimos entrar. Revisa el teléfono y la contraseña.");
      return;
    }
    toast.success("¡Bienvenido de vuelta!");
    goToApp();
  };

  const handleSignUp = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    if (password.length < 6) {
      toast.error("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    setLoading(true);
    const { error } = await signUpWithPhone({
      phone: String(form.get("phone") ?? ""),
      password,
      name: String(form.get("name") ?? ""),
      referralCode: ref,
    });
    setLoading(false);
    if (error) {
      toast.error(
        error.message.toLowerCase().includes("registered")
          ? "Ese número ya tiene una cuenta. Inicia sesión."
          : "No pudimos crear la cuenta. Intenta de nuevo.",
      );
      return;
    }
    toast.success("Cuenta creada. ¡Bienvenido a MONSTORE!");
    goToApp();
  };

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

        {evento ? (
          <div className="surface-card space-y-1 p-4 text-center">
            <p className="text-sm font-semibold text-primary">Te invitaron a un evento</p>
            <p className="text-xs text-muted-foreground">
              Crea tu cuenta o inicia sesión y te llevamos directo al evento.
            </p>
          </div>
        ) : null}

        <Tabs value={tab} onValueChange={(value) => setTab(value as "login" | "registro")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="login">Iniciar sesión</TabsTrigger>
            <TabsTrigger value="registro">Crear cuenta</TabsTrigger>
          </TabsList>

          <TabsContent value="login">
            <form className="surface-card mt-4 space-y-4 p-5" onSubmit={handleLogin}>
              <div className="space-y-1.5">
                <Label htmlFor="login-telefono">Número de teléfono</Label>
                <Input
                  id="login-telefono"
                  name="phone"
                  type="tel"
                  inputMode="tel"
                  placeholder="+53 5 000 0000"
                  autoComplete="tel"
                  maxLength={20}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="login-clave">Contraseña</Label>
                <Input
                  id="login-clave"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Entrando…" : "Entrar"}
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="registro">
            <form className="surface-card mt-4 space-y-4 p-5" onSubmit={handleSignUp}>
              <div className="space-y-1.5">
                <Label htmlFor="reg-nombre">Nombre completo</Label>
                <Input
                  id="reg-nombre"
                  name="name"
                  placeholder="Tu nombre"
                  autoComplete="name"
                  maxLength={100}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reg-telefono">Número de teléfono</Label>
                <Input
                  id="reg-telefono"
                  name="phone"
                  type="tel"
                  inputMode="tel"
                  placeholder="+53 5 000 0000"
                  autoComplete="tel"
                  maxLength={20}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reg-clave">Contraseña</Label>
                <Input
                  id="reg-clave"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={6}
                  required
                />
              </div>
              {ref ? (
                <p className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-xs text-primary">
                  Te invitó el enlace de referido <span className="font-semibold">{ref}</span>.
                </p>
              ) : null}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Creando cuenta…" : "Crear cuenta"}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}

