import { createFileRoute } from "@tanstack/react-router";
import { AdminShell } from "@/components/layout/AdminShell";
import { StatusBadge } from "@/components/common/StatusBadge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { mockPayments } from "@/data/mock/admin";
import { formatBaseCUP, formatDateTime } from "@/lib/format";

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
};

function AdminPaymentsPage() {
  return (
    <AdminShell title="Pagos" description="Movimientos de pago registrados.">
      <div className="surface-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Referencia</TableHead>
              <TableHead>Usuario</TableHead>
              <TableHead>Método</TableHead>
              <TableHead>Importe</TableHead>
              <TableHead>Pedido</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Fecha</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {mockPayments.map((payment) => (
              <TableRow key={payment.id}>
                <TableCell className="font-medium">{payment.reference}</TableCell>
                <TableCell>{payment.user_name}</TableCell>
                <TableCell>{METHOD_LABEL[payment.method] ?? payment.method}</TableCell>
                <TableCell>{formatBaseCUP(payment.amount)}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {payment.order_id ?? "—"}
                </TableCell>
                <TableCell>
                  <StatusBadge status={payment.status} />
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                  {formatDateTime(payment.created_at)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </AdminShell>
  );
}
