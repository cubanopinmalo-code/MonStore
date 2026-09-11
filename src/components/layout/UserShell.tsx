import type { ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Bell, Gamepad2, Home, LogOut, Store, User, Wallet } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { useNotifications, useWallet, useClearAccountCache } from "@/hooks/useAccount";
import { signOut } from "@/lib/auth";
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
  const navigate = useNavigate();
  const { data: wallet } = useWallet();
  const { data: notifications } = useNotifications();
  const clearCache = useClearAccountCache();
  const balance = Number(wallet?.balance ?? 0);
  const unread = (notifications ?? []).filter((item) => !item.read).length;

  const handleSignOut = async () => {
    await clearCache();
    await signOut();
    void navigate({ to: "/", replace: true });
  };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-3 px-4">
          <Logo to="/app" />
          <nav className="ml-6 hidden items-center gap-1 lg:flex">
            {MAIN_NAV.map((item) => (
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
            <Button
              variant="ghost"
              size="icon"
              onClick={() => void handleSignOut()}
              aria-label="Cerrar sesión"
            >
              <LogOut className="size-5" aria-hidden="true" />
            </Button>
          </div>

        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 pb-28 lg:pb-10">{children}</main>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
        aria-label="Navegación principal"
      >
        <div className="grid grid-cols-5">
          {MAIN_NAV.map((item) => (
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
