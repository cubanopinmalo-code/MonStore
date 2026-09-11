import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { AdminShell } from "@/components/layout/AdminShell";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { mockWithdrawals } from "@/data/mock/admin";
import { formatCUP, formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/retiros")({
  head: () => ({
    meta: [
      { title: "Retiros — Panel MONSTORE" },
      { name: "description", content: "Solicitudes de retiro y su revisión." },
    ],
  }),
  component: AdminWithdrawalsPage,
});

function AdminWithdrawalsPage() {
  return (
    <AdminShell title="Retiros" description="Solicitudes de retiro de saldo.">
      <div className="surface-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Usuario</TableHead>
              <TableHead>Importe</TableHead>
              <TableHead>Comisión</TableHead>
              <TableHead>Neto</TableHead>
              <TableHead>Destino</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {mockWithdrawals.map((withdrawal) => (
              <TableRow key={withdrawal.id}>
                <TableCell className="font-medium">{withdrawal.user_name}</TableCell>
                <TableCell>{formatCUP(withdrawal.amount)}</TableCell>
                <TableCell className="text-muted-foreground">
                  {formatCUP(withdrawal.fee)}
                </TableCell>
                <TableCell>{formatCUP(withdrawal.net_amount)}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {withdrawal.payment_destination}
                </TableCell>
                <TableCell>
                  <StatusBadge status={withdrawal.status} />
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                  {formatDateTime(withdrawal.created_at)}
                </TableCell>
                <TableCell className="text-right">
                  {withdrawal.status === "pendiente" ? (
                    <div className="flex justify-end gap-2">
                      <Button size="sm" onClick={() => toast.success("Retiro aprobado (simulado)")}>
                        Aprobar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => toast.error("Retiro rechazado (simulado)")}
                      >
                        Rechazar
                      </Button>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {withdrawal.reviewed_by ?? "—"}
                    </span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </AdminShell>
  );
}
