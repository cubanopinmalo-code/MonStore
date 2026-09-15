import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Coins,
  Lock,
  Store,
  TrendingUp,
  Trophy,
  Users,
} from "lucide-react";
import { AdminShell } from "@/components/layout/AdminShell";
import { StatCard } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAdminActivity, useAdminPanel, useAdminRealtime } from "@/hooks/useAdminPanel";
import { formatCUP, formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({
    meta: [
      { title: "Panel administrativo — MONSTORE" },
      {
        name: "description",
        content:
          "Control en tiempo real de fondos, retiros, cuentas, eventos, ganancias y alertas de MONSTORE.",
      },
      { property: "og:title", content: "Panel administrativo — MONSTORE" },
      {
        property: "og:description",
        content: "Fondos, retiros, cuentas, eventos y ganancias en una sola pantalla.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminDashboard,
});

function AdminDashboard() {
  const { data, isLoading } = useAdminPanel();
  useAdminRealtime(["admin-panel"]);

  return (
    <AdminShell
      title="Dashboard"
      description="Todo lo que necesita tu atención ahora mismo, actualizado automáticamente."
    >
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <TaskCard
          to="/admin/fondos"
          label="Solicitudes de fondos"
          value={data?.deposits_pending ?? 0}
          hint={data?.deposits_stale ? `${data.deposits_stale} con más de 24 h` : "Al día"}
          icon={<ArrowDownToLine className="size-4" aria-hidden="true" />}
        />
        <TaskCard
          to="/admin/retiros"
          label="Retiros pendientes"
          value={data?.withdrawals_pending ?? 0}
          icon={<ArrowUpFromLine className="size-4" aria-hidden="true" />}
        />
        <TaskCard
          to="/admin/comercio"
          label="Solicitudes de cuentas"
          value={data?.accounts_pending ?? 0}
          icon={<Store className="size-4" aria-hidden="true" />}
        />
        <TaskCard
          to="/admin/eventos"
          label="Eventos activos"
          value={data?.events_active ?? 0}
          hint={`${data?.events_upcoming ?? 0} próximos`}
          icon={<Trophy className="size-4" aria-hidden="true" />}
        />
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Ventas de hoy"
          value={formatCUP(data?.sales_today ?? 0)}
          icon={<TrendingUp className="size-4" aria-hidden="true" />}
        />
        <StatCard
          label="Ganancia de hoy"
          value={formatCUP(data?.profit_today ?? 0)}
          icon={<Coins className="size-4" aria-hidden="true" />}
        />
        <StatCard
          label="Ganancia del mes"
          value={formatCUP(data?.profit_month ?? 0)}
          hint={`${(data?.usd_sold_month ?? 0).toFixed(2)} USD vendidos`}
        />
        <StatCard
          label="Fondos retenidos"
          value={formatCUP(data?.held_funds ?? 0)}
          hint={`Saldo de clientes: ${formatCUP(data?.wallets_total ?? 0)}`}
          icon={<Lock className="size-4" aria-hidden="true" />}
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="surface-card space-y-3 p-5 lg:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <AlertTriangle className="size-4 text-primary" aria-hidden="true" />
              Alertas importantes
            </h2>
            {data?.alerts.length ? <Badge variant="outline">{data.alerts.length}</Badge> : null}
          </div>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Revisando la operación…</p>
          ) : (data?.alerts ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Sin alertas: no hay nada urgente por resolver.
            </p>
          ) : (
            <ul className="grid gap-2">
              {(data?.alerts ?? []).map((alert) => (
                <li
                  key={alert.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/70 p-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{alert.title}</p>
                    <p className="text-xs text-muted-foreground">{alert.detail}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge
                      variant={alert.level === "critica" ? "destructive" : "secondary"}
                      className="capitalize"
                    >
                      {alert.level === "critica"
                        ? "Urgente"
                        : alert.level === "atencion"
                          ? "Atención"
                          : "Info"}
                    </Badge>
                    <Button asChild size="sm" variant="outline">
                      <Link to={alert.to}>Resolver</Link>
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="surface-card space-y-3 p-5">
          <h2 className="text-base font-semibold">Plataforma</h2>
          <Row label="Usuarios registrados" value={String(data?.users_total ?? 0)} />
          <Row label="Cuentas restringidas" value={String(data?.users_blocked ?? 0)} />
          <Row label="Eventos con meta alcanzada" value={String(data?.events_goal_reached ?? 0)} />
          <Row label="Premios por entregar" value={String(data?.prizes_pending ?? 0)} />
          <div className="grid gap-2 pt-1">
            <Button asChild size="sm" variant="outline">
              <Link to="/admin/usuarios">
                <Users className="size-4" aria-hidden="true" />
                Ver usuarios
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to="/admin/finanzas">Ver finanzas</Link>
            </Button>
          </div>
        </section>
      </div>

      <section className="surface-card p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Actividad reciente</h2>
          <Button asChild size="sm" variant="outline">
            <Link to="/admin/actividad">Ver todo</Link>
          </Button>
        </div>
        <div className="mt-4 grid gap-2">
          {(data?.activity ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Todavía no hay movimientos registrados en la auditoría.
            </p>
          ) : (
            (data?.activity ?? []).map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 p-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium capitalize">{item.title}</p>
                  {item.detail ? (
                    <p className="truncate text-xs text-muted-foreground">{item.detail}</p>
                  ) : null}
                </div>
                <span className="text-xs text-muted-foreground">
                  {formatDateTime(item.created_at)}
                </span>
              </div>
            ))
          )}
        </div>
      </section>
    </AdminShell>
  );
}

function TaskCard({
  to,
  label,
  value,
  hint,
  icon,
}: {
  to: "/admin/fondos" | "/admin/retiros" | "/admin/comercio" | "/admin/eventos";
  label: string;
  value: number;
  hint?: string;
  icon?: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      className="surface-card block p-4 transition-colors hover:border-primary/60 hover:bg-accent/40"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        {icon ? <span className="text-primary">{icon}</span> : null}
      </div>
      <p className="mt-2 font-display text-2xl font-bold">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint ?? "Abrir sección"}</p>
    </Link>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}
