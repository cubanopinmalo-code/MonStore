import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { supabase } from "@/integrations/supabase/client";
import { formatCUP, formatDateTime } from "@/lib/format";
import {
  listPaymentMethods,
  releaseDepositLine,
  reviewDeposit,
} from "@/lib/payments.functions";

export const Route = createFileRoute("/_authenticated/admin/depositos")({
  head: () => ({
    meta: [
      { title: "Depósitos — Panel MONSTORE" },
      { name: "description", content: "Solicitudes de depósito pendientes de verificación." },
    ],
  }),
  component: AdminDepositsPage,
});

function useDeposits() {
  return useQuery({
    queryKey: ["admin-deposits"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("deposits")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      const rows = data ?? [];
      const ids = [...new Set(rows.map((row) => row.user_id))];
      const names = new Map<string, string>();
      if (ids.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, name, phone")
          .in("id", ids);
        for (const profile of profiles ?? []) {
          names.set(profile.id, profile.name || profile.phone || "Cliente");
        }
      }
      return rows.map((row) => ({
        ...row,
        user_name: names.get(row.user_id) ?? "Cliente",
      }));
    },
  });
}

function AdminDepositsPage() {
  const queryClient = useQueryClient();
  const reviewFn = useServerFn(reviewDeposit);
  const releaseFn = useServerFn(releaseDepositLine);
  const { data, isLoading } = useDeposits();
  const methods = useQuery({
    queryKey: ["payment-methods"],
    queryFn: () => listPaymentMethods(),
    staleTime: 5 * 60 * 1000,
  });
  const deposits = data ?? [];
  const labelFor = (method: string) =>
    methods.data?.find((item) => item.payment_method === method)?.label ?? method;

  const review = useMutation({
    mutationFn: async ({ id, approve }: { id: string; approve: boolean }) => {
      await reviewFn({
        data: {
          depositId: id,
          approve,
          reason: approve ? "" : "No se pudo verificar el pago.",
        },
      });
    },
    onSuccess: async (_result, variables) => {
      toast.success(variables.approve ? "Depósito aprobado" : "Depósito rechazado");
      await queryClient.invalidateQueries({ queryKey: ["admin-deposits"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const release = useMutation({
    mutationFn: async (id: string) => {
      await releaseFn({ data: { depositId: id, reason: "Liberada manualmente." } });
    },
    onSuccess: async () => {
      toast.success("Línea liberada");
      await queryClient.invalidateQueries({ queryKey: ["admin-deposits"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <AdminShell title="Depósitos" description="Solicitudes de recarga de wallet.">
      <div className="surface-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Usuario</TableHead>
              <TableHead>Envía</TableHead>
              <TableHead>Acredita</TableHead>
              <TableHead>Método</TableHead>
              <TableHead>Línea</TableHead>
              <TableHead>Número de origen</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={9} className="text-sm text-muted-foreground">
                  Cargando solicitudes…
                </TableCell>
              </TableRow>
            ) : deposits.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-sm text-muted-foreground">
                  Todavía no hay solicitudes de fondos.
                </TableCell>
              </TableRow>
            ) : (
              deposits.map((deposit) => (
                <TableRow key={deposit.id}>
                  <TableCell className="font-medium">{deposit.user_name}</TableCell>
                  <TableCell>{formatCUP(deposit.amount)}</TableCell>
                  <TableCell className="text-primary">
                    {formatCUP(deposit.credited_amount)}
                  </TableCell>
                  <TableCell className="text-xs">{labelFor(deposit.payment_method)}</TableCell>
                  <TableCell className="text-xs">
                    {deposit.line_number ? (
                      <>
                        <span className="font-medium">Línea {deposit.line_number}</span>
                        <span className="block text-muted-foreground">{deposit.line_phone}</span>
                        <span className="block text-muted-foreground">
                          {deposit.line_assigned_at
                            ? formatDateTime(deposit.line_assigned_at)
                            : "—"}
                        </span>
                        <span className="block text-muted-foreground">
                          {deposit.line_released_at
                            ? `Liberada ${formatDateTime(deposit.line_released_at)}`
                            : "Ocupada"}
                        </span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
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
                          disabled={review.isPending}
                          onClick={() => review.mutate({ id: deposit.id, approve: true })}
                        >
                          Aprobar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={review.isPending}
                          onClick={() => review.mutate({ id: deposit.id, approve: false })}
                        >
                          Rechazar
                        </Button>
                        {deposit.line_id && !deposit.line_released_at ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={release.isPending}
                            onClick={() => release.mutate(deposit.id)}
                          >
                            Liberar línea
                          </Button>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {deposit.reviewed_at ? formatDateTime(deposit.reviewed_at) : "—"}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </AdminShell>
  );
}
