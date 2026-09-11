import { createFileRoute } from "@tanstack/react-router";
import { AdminShell } from "@/components/layout/AdminShell";
import { StatusBadge } from "@/components/common/StatusBadge";
import { EmptyState } from "@/components/common/states";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAdminDeposits } from "@/hooks/useAdmin";
import { formatCUP, formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/pagos")({
  head: () => ({
    meta: [
      { title: "Pagos — Panel MONSTORE" },
      { name: "description", content: "Registro de pagos recibidos y su estado." },
    ],
  }),
  component: AdminPaymentsPage,
});

const METHOD_LABEL: Record<string, string> = {
  wallet: "Wallet",
  saldo_movil: "Saldo móvil",
  tarjeta_cup: "Tarjeta CUP",
  usdt: "USDT",
  zelle: "Zelle",
};

function AdminPaymentsPage() {
  const { data: deposits, isLoading } = useAdminDeposits();
  const rows = deposits ?? [];

  return (
    <AdminShell title="Pagos" description="Pagos recibidos de los clientes.">
      {!isLoading && rows.length === 0 ? (
        <EmptyState title="Todavía no hay pagos registrados" />
      ) : (
        <div className="surface-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Referencia</TableHead>
                <TableHead>Usuario</TableHead>
                <TableHead>Método</TableHead>
                <TableHead>Importe</TableHead>
                <TableHead>Acreditado</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Fecha</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="max-w-[220px] truncate font-medium">
                    {row.payment_reference}
                  </TableCell>
                  <TableCell>{row.user_name}</TableCell>
                  <TableCell>
                    {METHOD_LABEL[String(row.payment_method)] ?? String(row.payment_method)}
                  </TableCell>
                  <TableCell>{formatCUP(row.amount)}</TableCell>
                  <TableCell>{formatCUP(row.credited_amount)}</TableCell>
                  <TableCell>
                    <StatusBadge status={row.status} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {formatDateTime(row.created_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </AdminShell>
  );
}
