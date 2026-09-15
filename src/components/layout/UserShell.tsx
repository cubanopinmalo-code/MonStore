import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Bell, Gamepad2, Home, LogOut, ShieldCheck, Store, User, Wallet, Wrench } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { SignOutDialog } from "@/components/common/SignOutDialog";
import { Button } from "@/components/ui/button";
import { useIsAdmin, useNotifications, useWallet } from "@/hooks/useAccount";
import { usePlatformFlags } from "@/hooks/usePlatformFlags";
import { formatCUP } from "@/lib/format";


const MAIN_NAV = [
  { to: "/app", label: "Inicio", icon: Home, exact: true },
  { to: "/app/recargas", label: "Recargas", icon: Gamepad2, exact: false },
  { to: "/app/comercio", label: "Comercio", icon: Store, exact: false },
  { to: "/app/wallet", label: "Wallet", icon: Wallet, exact: false },
  { to: "/app/perfil", label: "Perfil", icon: User, exact: false },
] as const;

const DESKTOP_EXTRA = [
  { to: "/app/eventos", label: "Eventos" },
  { to: "/app/pedidos", label: "Mis pedidos" },
  { to: "/app/referidos", label: "Referidos" },
] as const;

export function UserShell({ children }: { children: ReactNode }) {
  const { data: wallet } = useWallet();
  const { data: notifications } = useNotifications();
  const { data: isAdmin } = useIsAdmin();
  const { data: flags } = usePlatformFlags();
  const balance = Number(wallet?.balance ?? 0);
  const unread = (notifications ?? []).filter((item) => !item.read).length;
  // El administrador conserva su acceso completo incluso en mantenimiento.
  const inMaintenance = Boolean(flags?.maintenance) && !isAdmin;
  const nav = MAIN_NAV.filter(
    (item) => item.to !== "/app/comercio" || flags?.marketplaceEnabled !== false,
  );


  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-3 px-4">
          <Logo to="/app" />
          <nav className="ml-6 hidden items-center gap-1 lg:flex">
            {nav.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
                activeProps={{ className: "text-foreground font-medium" }}
                activeOptions={{ exact: item.exact }}
              >
                {item.label}
              </Link>
            ))}
            {DESKTOP_EXTRA.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
                activeProps={{ className: "text-foreground font-medium" }}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Link
              to="/app/wallet"
              className="flex min-w-0 items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs font-semibold text-primary transition-colors hover:border-primary/50 sm:px-3"
              aria-label={`Saldo disponible: ${formatCUP(balance)}`}
            >
              <Wallet className="size-4 shrink-0" aria-hidden="true" />
              <span className="whitespace-nowrap">{formatCUP(balance)}</span>
            </Link>
            <Button asChild variant="ghost" size="icon" className="relative">
              <Link to="/app/notificaciones" aria-label="Notificaciones">
                <Bell className="size-5" aria-hidden="true" />
                {unread > 0 ? (
                  <span className="absolute right-2 top-2 size-2 rounded-full bg-primary" />
                ) : null}
              </Link>
            </Button>
            {isAdmin ? (
              <Button asChild variant="ghost" size="icon">
                <Link to="/admin" aria-label="Panel administrativo">
                  <ShieldCheck className="size-5" aria-hidden="true" />
                </Link>
              </Button>
            ) : null}
            <SignOutDialog>
              <Button variant="ghost" size="icon" aria-label="Cerrar sesión">
                <LogOut className="size-5" aria-hidden="true" />
              </Button>
            </SignOutDialog>
          </div>

        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 pb-28 lg:pb-10">
        {inMaintenance ? (
          <section className="surface-card mx-auto max-w-lg space-y-3 p-6 text-center">
            <Wrench className="mx-auto size-8 text-primary" aria-hidden="true" />
            <h1 className="font-display text-xl font-bold">Estamos en mantenimiento</h1>
            <p className="text-sm text-muted-foreground">
              MONSTORE está en mantenimiento durante unos minutos. No se pueden hacer recargas,
              compras, envíos de saldo ni retiros ahora mismo. Tu saldo y tus pedidos están a salvo.
            </p>
            <p className="text-sm text-muted-foreground">
              Vuelve a intentarlo en un momento: la aplicación se reactiva sola cuando terminamos.
            </p>
          </section>
        ) : (
          children
        )}
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
        aria-label="Navegación principal"
      >
        <div className={nav.length === 5 ? "grid grid-cols-5" : "grid grid-cols-4"}>
          {nav.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="flex min-h-14 flex-col items-center justify-center gap-1 py-2 text-[11px] text-muted-foreground"
              activeProps={{ className: "text-primary" }}
              activeOptions={{ exact: item.exact }}
            >
              <item.icon className="size-5" aria-hidden="true" />
              {item.label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
