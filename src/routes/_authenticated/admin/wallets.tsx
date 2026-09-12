import { createFileRoute } from "@tanstack/react-router";
import { AdminShell } from "@/components/layout/AdminShell";
import { StatCard } from "@/components/common/PageHeader";
import { StatusBadge } from "@/components/common/StatusBadge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAdminStats, useAdminTransactions, useAdminUsers } from "@/hooks/useAdmin";
import { formatCUP, formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/wallets")({
  head: () => ({
    meta: [
      { title: "Wallets — Panel MONSTORE" },
      { name: "description", content: "Saldos de usuarios y movimientos recientes." },
    ],
  }),
  component: AdminWalletsPage,
});

function AdminWalletsPage() {
  const { data: users } = useAdminUsers();
  const { data: stats } = useAdminStats();
  const { data: transactions } = useAdminTransactions();

  return (
    <AdminShell title="Wallets" description="Saldos y movimientos de la plataforma.">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Saldo total en wallets" value={formatCUP(stats?.wallets_total ?? 0)} />
        <StatCard label="Wallets activas" value={String(stats?.wallets_count ?? 0)} />
        <StatCard label="Movimientos recientes" value={String((transactions ?? []).length)} />
      </div>

      <section className="surface-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Usuario</TableHead>
              <TableHead>Saldo</TableHead>
              <TableHead>Moneda</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(users ?? []).map((user) => (
              <TableRow key={user.id}>
                <TableCell className="font-medium">{user.name || user.phone}</TableCell>
                <TableCell>{formatCUP(user.balance)}</TableCell>
                <TableCell>{user.currency}</TableCell>
                <TableCell>
                  <StatusBadge status={user.wallet_status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Movimientos recientes</h2>
        <div className="surface-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Usuario</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Importe</TableHead>
                <TableHead>Saldo final</TableHead>
                <TableHead>Fecha</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(transactions ?? []).map((tx) => (
                <TableRow key={tx.id}>
                  <TableCell>{tx.user_name}</TableCell>
                  <TableCell>{tx.description}</TableCell>
                  <TableCell className="capitalize">{tx.type}</TableCell>
                  <TableCell className={tx.amount > 0 ? "text-success" : undefined}>
                    {tx.amount > 0 ? "+" : "−"}
                    {formatCUP(Math.abs(tx.amount))}
                  </TableCell>
                  <TableCell>{formatCUP(tx.balance_after)}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {formatDateTime(tx.created_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
    </AdminShell>
  );
}
