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
import { mockDeposits } from "@/data/mock/admin";
import { formatCUP, formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/admin/depositos")({
  head: () => ({
    meta: [
      { title: "Depósitos — Panel MONSTORE" },
      { name: "description", content: "Solicitudes de depósito pendientes de verificación." },
    ],
  }),
  component: AdminDepositsPage,
});

function AdminDepositsPage() {
  return (
    <AdminShell title="Depósitos" description="Solicitudes de recarga de wallet.">
      <div className="surface-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Usuario</TableHead>
              <TableHead>Importe</TableHead>
              <TableHead>Método</TableHead>
              <TableHead>Referencia</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {mockDeposits.map((deposit) => (
              <TableRow key={deposit.id}>
                <TableCell className="font-medium">{deposit.user_name}</TableCell>
                <TableCell>{formatCUP(deposit.amount)}</TableCell>
                <TableCell className="text-xs">
                  {deposit.payment_method === "saldo_movil" ? "Saldo móvil" : "Tarjeta CUP"}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {deposit.payment_reference}
                </TableCell>
                <TableCell>
                  <StatusBadge status={deposit.status} />
                  {deposit.rejection_reason ? (
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {deposit.rejection_reason}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                  {formatDateTime(deposit.created_at)}
                </TableCell>
                <TableCell className="text-right">
                  {deposit.status === "pendiente" ? (
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        onClick={() => toast.success("Depósito aprobado (simulado)")}
                      >
                        Aprobar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => toast.error("Depósito rechazado (simulado)")}
                      >
                        Rechazar
                      </Button>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {deposit.reviewed_by ?? "—"}
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
