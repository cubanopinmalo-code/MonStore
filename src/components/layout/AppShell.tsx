import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

const NAV = [
  { to: "/", label: "Inicio" },
  { to: "/juegos", label: "Juegos" },
  { to: "/recargas", label: "Recargas" },
  { to: "/comercio", label: "Comercio" },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-3 px-4">
          <Logo />
          <nav className="ml-6 hidden items-center gap-1 md:flex">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
                activeProps={{ className: "text-foreground font-medium" }}
                activeOptions={{ exact: item.to === "/" }}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto hidden items-center gap-2 md:flex">
            <Button asChild size="sm">
              <Link to="/">Iniciar sesión</Link>
            </Button>
          </div>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" className="ml-auto md:hidden">
                <Menu className="size-5" aria-hidden="true" />
                <span className="sr-only">Abrir menú</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72 p-6">
              <SheetTitle className="mb-6 text-left">Menú</SheetTitle>
              <nav className="grid gap-1">
                {NAV.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    className="rounded-md px-3 py-2.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                    activeProps={{ className: "bg-muted text-foreground font-medium" }}
                    activeOptions={{ exact: item.to === "/" }}
                  >
                    {item.label}
                  </Link>
                ))}
                <Link
                  to="/app"
                  className="rounded-md px-3 py-2.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  Mi cuenta
                </Link>
              </nav>
              <div className="mt-6 grid gap-2">
                <Button asChild variant="outline">
                  <Link to="/login">Iniciar sesión</Link>
                </Button>
                <Button asChild>
                  <Link to="/registro">Crear cuenta</Link>
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-border/70 bg-surface/40">
        <div className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-10 md:grid-cols-3">
          <div className="space-y-3">
            <Logo />
            <p className="max-w-xs text-sm text-muted-foreground">
              Recargas de videojuegos, wallet en CUP y comercio de cuentas para la comunidad
              gamer cubana.
            </p>
          </div>
          <div className="space-y-2 text-sm">
            <p className="font-semibold">Plataforma</p>
            <div className="grid gap-1.5 text-muted-foreground">
              <Link to="/juegos" className="hover:text-foreground">Juegos</Link>
              <Link to="/recargas" className="hover:text-foreground">Recargas</Link>
              <Link to="/comercio" className="hover:text-foreground">Comercio de cuentas</Link>
            </div>
          </div>
          <div className="space-y-2 text-sm">
            <p className="font-semibold">Cuenta</p>
            <div className="grid gap-1.5 text-muted-foreground">
              <Link to="/login" className="hover:text-foreground">Iniciar sesión</Link>
              <Link to="/registro" className="hover:text-foreground">Crear cuenta</Link>
              <Link to="/app/wallet" className="hover:text-foreground">Wallet</Link>
              <Link to="/admin" className="hover:text-foreground">Panel admin</Link>
            </div>
          </div>
        </div>
        <div className="border-t border-border/70 px-4 py-4 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} MONSTORE. Prototipo visual — datos de ejemplo.
        </div>
      </footer>
    </div>
  );
}
