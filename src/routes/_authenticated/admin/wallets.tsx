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
import { mockUsers } from "@/data/mock/account";
import { mockWallet, mockWalletTransactions } from "@/data/mock/wallet";
import { formatCUP, formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/admin/wallets")({
  head: () => ({
    meta: [
      { title: "Wallets — Panel MONSTORE" },
      { name: "description", content: "Saldos de usuarios y movimientos recientes." },
    ],
  }),
  component: AdminWalletsPage,
});

const BALANCES = [7450, 15200, 0, 3100];

function AdminWalletsPage() {
  const total = BALANCES.reduce((sum, value) => sum + value, 0);

  return (
    <AdminShell title="Wallets" description="Saldos y movimientos de la plataforma.">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Saldo total en wallets" value={formatCUP(total)} />
        <StatCard label="Wallets activas" value={String(BALANCES.length)} />
        <StatCard label="Movimientos recientes" value={String(mockWalletTransactions.length)} />
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
            {mockUsers.map((user, index) => (
              <TableRow key={user.id}>
                <TableCell className="font-medium">{user.name}</TableCell>
                <TableCell>{formatCUP(BALANCES[index] ?? 0)}</TableCell>
                <TableCell>{mockWallet.currency}</TableCell>
                <TableCell>
                  <StatusBadge status={user.status === "activo" ? "activa" : "suspendido"} />
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
                <TableHead>Descripción</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Importe</TableHead>
                <TableHead>Saldo final</TableHead>
                <TableHead>Fecha</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mockWalletTransactions.map((tx) => (
                <TableRow key={tx.id}>
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
