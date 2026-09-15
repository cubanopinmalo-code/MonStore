import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Logo } from "@/components/brand/Logo";
import { RouteLoading } from "@/components/common/RouteLoading";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { otpRequestStatus, requestOtp, verifyOtp } from "@/lib/otp.functions";
import { otpMessage } from "@/lib/otp-messages";
import { isValidCubanMobile } from "@/lib/phone";

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
      { title: "MONSTORE — Entra con tu número de teléfono" },
      {
        name: "description",
        content:
          "Accede a MONSTORE con tu número de teléfono y un código de un solo uso para recargar juegos y usar tu wallet en CUP.",
      },
      { property: "og:title", content: "MONSTORE — Acceso" },
      {
        property: "og:description",
        content: "Entra a MONSTORE solo con tu teléfono y un código de un solo uso.",
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
  const askCode = useServerFn(requestOtp);
  const checkCode = useServerFn(verifyOtp);
  const askStatus = useServerFn(otpRequestStatus);

  const [step, setStep] = useState<"telefono" | "codigo">("telefono");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [checking, setChecking] = useState(true);
  /** Fin del bloqueo, en tiempo local ya corregido con la hora del servidor. */
  const [blockUntil, setBlockUntil] = useState<number | null>(null);
  const [blockLeft, setBlockLeft] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  /**
   * El servidor manda la marca de tiempo y su hora actual: el temporizador se
   * calcula sobre esa diferencia, así que recargar la página, reabrir el
   * navegador o cambiar el reloj del dispositivo no reinicia el bloqueo.
   */
  const applyBlock = (blockedUntil: string | null | undefined, serverNow?: string) => {
    if (!blockedUntil) {
      setBlockUntil(null);
      setBlockLeft(0);
      return;
    }
    const end = new Date(blockedUntil).getTime();
    const reference = serverNow ? new Date(serverNow).getTime() : Date.now();
    setBlockUntil(Date.now() + Math.max(0, end - reference));
  };

  useEffect(() => {
    if (!blockUntil) return;
    const tick = () => setBlockLeft(Math.max(0, Math.ceil((blockUntil - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [blockUntil]);

  useEffect(() => {
    if (blockUntil && blockLeft === 0) setBlockUntil(null);
  }, [blockLeft, blockUntil]);

  // Al escribir un número válido se consulta al servidor si sigue bloqueado.
  useEffect(() => {
    if (!isValidCubanMobile(phone)) {
      setBlockUntil(null);
      return;
    }
    let active = true;
    const id = setTimeout(() => {
      void askStatus({ data: { phone } })
        .then((result) => {
          if (active) applyBlock(result.blockedUntil, result.serverNow);
        })
        .catch(() => {});
    }, 500);
    return () => {
      active = false;
      clearTimeout(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone]);

  /**
   * Destino después del acceso. El rol se consulta SIEMPRE por UUID en
   * public.user_roles (RLS: cada usuario solo ve su propio rol). Nunca se usa
   * el teléfono ni ninguna bandera del navegador para decidir el panel.
   */
  const goToApp = async () => {
    if (evento) {
      void navigate({ to: "/app/eventos/$id", params: { id: evento }, replace: true });
      return;
    }
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (userId) {
      const { data: role } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("role", "admin")
        .maybeSingle();
      if (role) {
        void navigate({ to: "/admin", replace: true });
        return;
      }
    }
    void navigate({ to: "/app", replace: true });
  };

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (data.session) void goToApp();
      else setChecking(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (session && (event === "SIGNED_IN" || event === "TOKEN_REFRESHED")) void goToApp();
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
      if (timer.current) clearInterval(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startCooldown = (seconds: number) => {
    setCooldown(seconds);
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => {
      setCooldown((value) => {
        if (value <= 1 && timer.current) clearInterval(timer.current);
        return Math.max(0, value - 1);
      });
    }, 1000);
  };

  const handleRequest = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isValidCubanMobile(phone)) {
      toast.error("Ese número no parece un móvil cubano válido.");
      return;
    }
    // Sin reintentos inútiles: si el servidor ya dijo que está bloqueado,
    // no se vuelve a pedir hasta que el temporizador llegue a cero.
    if (blockLeft > 0) return;
    setLoading(true);
    try {
      const result = await askCode({ data: { phone } });
      if (!result.ok) {
        toast.error(otpMessage(result.reason));
        if (result.reason === "espera" && "retryInSeconds" in result) {
          startCooldown(Number(result.retryInSeconds ?? 60));
        }
        if (result.reason === "limite_telefono" && "blockedUntil" in result) {
          applyBlock(result.blockedUntil as string | null);
        }
        return;
      }
      if ("blockedUntil" in result) applyBlock(result.blockedUntil);
      setStep("codigo");
      setCode("");
      startCooldown(60);
      toast.success("Te enviamos un código por mensaje. Caduca en 5 minutos.");
    } catch {
      toast.error("No pudimos enviar el código. Inténtalo nuevamente.");
    } finally {
      setLoading(false);
    }
  };

  /** Tiempo restante del bloqueo en formato HH:MM:SS. */
  const blockClock = [
    Math.floor(blockLeft / 3600),
    Math.floor((blockLeft % 3600) / 60),
    blockLeft % 60,
  ]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");

  const handleVerify = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    try {
      const result = await checkCode({
        data: { phone, code, ...(ref ? { referralCode: ref } : {}) },
      });
      if (!result.ok) {
        toast.error(otpMessage(result.reason));
        return;
      }
      const { error } = await supabase.auth.verifyOtp({
        token_hash: result.tokenHash,
        type: "email",
      });
      if (error) {
        toast.error("No pudimos completar el acceso. Inténtalo nuevamente.");
        return;
      }
      toast.success(result.created ? "¡Bienvenido a MONSTORE!" : "¡Bienvenido de vuelta!");
      await goToApp();
    } catch {
      toast.error("No pudimos completar el acceso. Inténtalo nuevamente.");
    } finally {
      setLoading(false);
    }
  };

  if (checking) return <RouteLoading />;

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
            Recargas de videojuegos y wallet en CUP. Entra solo con tu número de teléfono.
          </p>
        </div>

        {evento ? (
          <div className="surface-card space-y-1 p-4 text-center">
            <p className="text-sm font-semibold text-primary">Te invitaron a un evento</p>
            <p className="text-xs text-muted-foreground">
              Entra con tu teléfono y te llevamos directo al evento.
            </p>
          </div>
        ) : null}

        {step === "telefono" ? (
          <form className="surface-card space-y-4 p-5" onSubmit={handleRequest}>
            <div className="space-y-1.5">
              <Label htmlFor="telefono">Número de teléfono</Label>
              <Input
                id="telefono"
                name="phone"
                type="tel"
                inputMode="tel"
                placeholder="+53 5 000 0000"
                autoComplete="tel"
                maxLength={20}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
            </div>
            {ref ? (
              <p className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-xs text-primary">
                Te invitó el enlace de referido <span className="font-semibold">{ref}</span>.
              </p>
            ) : null}
            <Button type="submit" className="w-full" disabled={loading || cooldown > 0}>
              {loading
                ? "Enviando código…"
                : cooldown > 0
                  ? `Espera ${cooldown}s`
                  : "Enviarme el código"}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Te enviamos un código de 6 cifras por mensaje. No necesitas contraseña.
            </p>
          </form>
        ) : (
          <form className="surface-card space-y-4 p-5" onSubmit={handleVerify}>
            <div className="space-y-1.5">
              <Label htmlFor="codigo">Código recibido</Label>
              <Input
                id="codigo"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                required
              />
              <p className="text-xs text-muted-foreground">
                Enviado a {phone}. Caduca en 5 minutos.
              </p>
            </div>
            <Button type="submit" className="w-full" disabled={loading || code.length < 6}>
              {loading ? "Comprobando…" : "Entrar"}
            </Button>
            <div className="flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setStep("telefono");
                  setCode("");
                }}
              >
                Cambiar número
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={loading || cooldown > 0}
                onClick={() => {
                  void handleRequest({
                    preventDefault: () => {},
                  } as unknown as React.FormEvent<HTMLFormElement>);
                }}
              >
                {cooldown > 0 ? `Reenviar en ${cooldown}s` : "Reenviar código"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
