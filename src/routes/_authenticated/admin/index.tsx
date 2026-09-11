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
import { mockAdminStats, mockDeposits, mockSyncStatus, mockWithdrawals } from "@/data/mock/admin";
import { mockOrders } from "@/data/mock/orders";
import { formatCUP, formatDateTime, marginPct } from "@/lib/format";

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
  const stats = mockAdminStats;
  const pendingDeposits = mockDeposits.filter((d) => d.status === "pendiente").length;
  const pendingWithdrawals = mockWithdrawals.filter((w) => w.status === "pendiente").length;

  return (
    <AdminShell title="Dashboard" description="Resumen general con datos simulados.">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Ventas hoy"
          value={formatCUP(stats.sales_today)}
          icon={<TrendingUp className="size-4" aria-hidden="true" />}
        />
        <StatCard
          label="Ventas del mes"
          value={formatCUP(stats.sales_month)}
          hint={`Margen ${marginPct(stats.provider_cost_month, stats.sales_month)}`}
          icon={<Coins className="size-4" aria-hidden="true" />}
        />
        <StatCard
          label="Pedidos"
          value={String(stats.orders_total)}
          hint={`${stats.orders_completed} completados · ${stats.orders_pending} pendientes`}
          icon={<ShoppingBag className="size-4" aria-hidden="true" />}
        />
        <StatCard
          label="Usuarios"
          value={String(stats.users_total)}
          icon={<Users className="size-4" aria-hidden="true" />}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Depósitos acumulados"
          value={formatCUP(stats.deposits_total)}
          hint={`${pendingDeposits} pendientes`}
          icon={<ArrowDownToLine className="size-4" aria-hidden="true" />}
        />
        <StatCard
          label="Retiros acumulados"
          value={formatCUP(stats.withdrawals_total)}
          hint={`${pendingWithdrawals} pendientes`}
          icon={<ArrowUpFromLine className="size-4" aria-hidden="true" />}
        />
        <StatCard label="Costo proveedor (mes)" value={formatCUP(stats.provider_cost_month)} />
        <StatCard label="Ganancia (mes)" value={formatCUP(stats.margin_month)} />
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
            {mockOrders.slice(0, 5).map((order) => (
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
            ))}
          </div>
        </section>

        <section className="surface-card space-y-3 p-5">
          <h2 className="text-base font-semibold">Estado G2Bulk</h2>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Conexión</span>
            <StatusBadge status={mockSyncStatus.connected ? "activo" : "pendiente"} />
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Última sincronización</span>
            <span>{formatDateTime(mockSyncStatus.last_sync_at)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Productos</span>
            <span>{mockSyncStatus.products_count}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            La conexión real y su clave se configurarán en el backend en la siguiente fase.
          </p>
          <Button asChild variant="outline" size="sm" className="w-full">
            <Link to="/admin/g2bulk">Ir a G2Bulk</Link>
          </Button>
        </section>
      </div>
    </AdminShell>
  );
}
