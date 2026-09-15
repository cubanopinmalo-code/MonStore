import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AdminShell } from "@/components/layout/AdminShell";
import { StatusBadge } from "@/components/common/StatusBadge";
import { EmptyState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useAdminWithdrawals } from "@/hooks/useAdmin";
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
  const queryClient = useQueryClient();
  const { data: withdrawals, isLoading } = useAdminWithdrawals();
  const completeFn = useServerFn(completeWithdrawal);
  const rejectFn = useServerFn(rejectWithdrawal);

  const review = useMutation({
    mutationFn: async ({ id, approve }: { id: string; approve: boolean }) => {
      if (approve) {
        await completeFn({ data: { withdrawalId: id } });
        return true;
      }
      const reason = (window.prompt("Motivo del rechazo (se devuelve el dinero al cliente):") ?? "").trim();
      if (reason.length < 3) throw new Error("Escribe el motivo del rechazo.");
      await rejectFn({ data: { withdrawalId: id, reason } });
      return false;
    },
    onSuccess: (approve) => {
      toast.success(approve ? "Retiro completado" : "Retiro rechazado y devuelto");
      void queryClient.invalidateQueries({ queryKey: ["admin-withdrawals"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-funds"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-panel"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });


  return (
    <AdminShell title="Retiros" description="Solicitudes de retiro de saldo.">
      {!isLoading && (withdrawals ?? []).length === 0 ? (
        <EmptyState
          title="No hay solicitudes de retiro"
          description="Aparecerán aquí en cuanto un cliente solicite un retiro."
        />
      ) : (
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
              {(withdrawals ?? []).map((withdrawal) => (
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
                        <Button
                          size="sm"
                          disabled={review.isPending}
                          onClick={() => review.mutate({ id: withdrawal.id, approve: true })}
                        >
                          Aprobar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={review.isPending}
                          onClick={() => review.mutate({ id: withdrawal.id, approve: false })}
                        >
                          Rechazar
                        </Button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {withdrawal.rejection_reason ?? "Revisado"}
                      </span>
                    )}
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
