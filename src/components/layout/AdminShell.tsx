import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  Activity,
  ArrowDownToLine,
  ArrowUpFromLine,
  CreditCard,
  Gamepad2,
  LayoutDashboard,
  Menu,
  Package,
  PiggyBank,
  RefreshCcw,
  Settings,
  ShoppingBag,
  Store,
  TrendingUp,
  Trophy,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

const ADMIN_NAV = [
  {
    group: "",
    items: [{ to: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true }],
  },
  {
    group: "Finanzas",
    items: [
      { to: "/admin/finanzas", label: "Resumen financiero", icon: TrendingUp, exact: false },
      { to: "/admin/pedidos", label: "Pedidos", icon: ShoppingBag, exact: false },
      { to: "/admin/pagos", label: "Cobros", icon: CreditCard, exact: false },
    ],
  },
  {
    group: "Fondos",
    items: [
      { to: "/admin/fondos", label: "Panel de fondos", icon: PiggyBank, exact: false },
      { to: "/admin/depositos", label: "Agregar fondos", icon: ArrowDownToLine, exact: false },
      { to: "/admin/retiros", label: "Retiros", icon: ArrowUpFromLine, exact: false },
      { to: "/admin/wallets", label: "Saldos", icon: Wallet, exact: false },
    ],
  },
  {
    group: "Solicitudes de cuentas",
    items: [
      { to: "/admin/comercio", label: "Revisión de cuentas", icon: Store, exact: false },
      { to: "/admin/cuentas-vendidas", label: "Cuentas vendidas", icon: Store, exact: false },
    ],
  },
  {
    group: "Eventos",
    items: [{ to: "/admin/eventos", label: "Gestión de eventos", icon: Trophy, exact: false }],
  },
  {
    group: "Configuración",
    items: [
      { to: "/admin/configuracion", label: "Ajustes globales", icon: Settings, exact: false },
      { to: "/admin/juegos", label: "Juegos", icon: Gamepad2, exact: false },
      { to: "/admin/productos", label: "Ofertas", icon: Package, exact: false },
      { to: "/admin/g2bulk", label: "Proveedor", icon: RefreshCcw, exact: false },
    ],
  },
  {
    group: "Operación",
    items: [
      { to: "/admin/usuarios", label: "Usuarios", icon: Users, exact: false },
      { to: "/admin/actividad", label: "Actividad", icon: Activity, exact: false },
      { to: "/admin/referidos", label: "Referidos", icon: UserPlus, exact: false },
    ],
  },
] as const;

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="grid gap-4">
      {ADMIN_NAV.map((section) => (
        <div key={section.group || "inicio"} className="grid gap-0.5">
          {section.group ? (
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {section.group}
            </p>
          ) : null}
          {section.items.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              activeProps={{
                className: "bg-sidebar-accent text-sidebar-accent-foreground font-medium",
              }}
              activeOptions={{ exact: item.exact }}
            >
              <item.icon className="size-4" aria-hidden="true" />
              {item.label}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}

export function AdminShell({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar p-4 lg:flex">
        <div className="px-2 pb-4">
          <Logo to="/admin" />
          <p className="mt-1 px-1 text-xs text-muted-foreground">Panel administrativo</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          <NavList />
        </div>
        <Button asChild variant="outline" size="sm" className="mt-4">
          <Link to="/">Salir del panel</Link>
        </Button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 px-4 py-3 backdrop-blur">
          <div className="flex items-center gap-3">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" className="lg:hidden">
                  <Menu className="size-5" aria-hidden="true" />
                  <span className="sr-only">Abrir menú del panel</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 overflow-y-auto bg-sidebar p-4">
                <SheetTitle className="mb-4 text-left">Panel MONSTORE</SheetTitle>
                <NavList />
              </SheetContent>
            </Sheet>
            <div className="min-w-0">
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbLink asChild>
                      <Link to="/admin">Admin</Link>
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage>{title}</BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            </div>
          </div>
        </header>

        <main className="min-w-0 flex-1 space-y-6 p-4 md:p-6">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold">{title}</h1>
            {description ? (
              <p className="text-sm text-muted-foreground">{description}</p>
            ) : null}
            {actions ? <div className="flex flex-wrap items-center gap-2 pt-2">{actions}</div> : null}
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
