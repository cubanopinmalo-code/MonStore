import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Coins,
  ShoppingBag,
  TrendingUp,
  Users,
} from "lucide-react";
import { AdminShell } from "@/components/layout/AdminShell";
import { StatCard } from "@/components/common/PageHeader";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { useAdminStats } from "@/hooks/useAdmin";
import { formatCUP, formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({
    meta: [
      { title: "Panel administrativo — MONSTORE" },
      { name: "description", content: "Resumen de ventas, pedidos y operaciones de MONSTORE." },
    ],
  }),
  component: AdminDashboard,
});

function AdminDashboard() {
  const { data: stats } = useAdminStats();

  return (
    <AdminShell title="Dashboard" description="Resumen general con datos reales.">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Ventas hoy"
          value={formatCUP(stats?.sales_today ?? 0)}
          icon={<TrendingUp className="size-4" aria-hidden="true" />}
        />
        <StatCard
          label="Ventas del mes"
          value={formatCUP(stats?.sales_month ?? 0)}
          icon={<Coins className="size-4" aria-hidden="true" />}
        />
        <StatCard
          label="Pedidos"
          value={String(stats?.orders_total ?? 0)}
          hint={`${stats?.orders_completed ?? 0} completados · ${stats?.orders_pending ?? 0} pendientes`}
          icon={<ShoppingBag className="size-4" aria-hidden="true" />}
        />
        <StatCard
          label="Usuarios"
          value={String(stats?.users_total ?? 0)}
          icon={<Users className="size-4" aria-hidden="true" />}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Depósitos acreditados"
          value={formatCUP(stats?.deposits_total ?? 0)}
          hint={`${stats?.deposits_pending ?? 0} pendientes`}
          icon={<ArrowDownToLine className="size-4" aria-hidden="true" />}
        />
        <StatCard
          label="Retiros pagados"
          value={formatCUP(stats?.withdrawals_total ?? 0)}
          hint={`${stats?.withdrawals_pending ?? 0} pendientes`}
          icon={<ArrowUpFromLine className="size-4" aria-hidden="true" />}
        />
        <StatCard label="Saldo en wallets" value={formatCUP(stats?.wallets_total ?? 0)} />
        <StatCard label="Ofertas en catálogo" value={String(stats?.products_total ?? 0)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="surface-card p-5 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Últimos pedidos</h2>
            <Button asChild variant="outline" size="sm">
              <Link to="/admin/pedidos">Ver todos</Link>
            </Button>
          </div>
          <div className="mt-4 grid gap-2">
            {(stats?.recent_orders ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Todavía no hay pedidos.</p>
            ) : (
              (stats?.recent_orders ?? []).map((order) => (
                <div
                  key={order.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border/70 p-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">#{order.code}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(order.created_at)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-sm">{formatCUP(order.total_amount)}</span>
                    <StatusBadge status={order.status} />
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="surface-card space-y-3 p-5">
          <h2 className="text-base font-semibold">Operaciones pendientes</h2>
          <Row label="Depósitos por revisar" value={String(stats?.deposits_pending ?? 0)} />
          <Row label="Retiros por revisar" value={String(stats?.withdrawals_pending ?? 0)} />
          <Row label="Pedidos pendientes" value={String(stats?.orders_pending ?? 0)} />
          <Button asChild variant="outline" size="sm" className="w-full">
            <Link to="/admin/actividad">Ver actividad global</Link>
          </Button>
        </section>
      </div>
    </AdminShell>
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
