import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDownToLine, ArrowUpFromLine, Clock, Lock, MessageCircle, Wallet } from "lucide-react";
import { AdminShell } from "@/components/layout/AdminShell";
import { StatCard } from "@/components/common/PageHeader";
import { StatusBadge } from "@/components/common/StatusBadge";
import { EmptyState } from "@/components/common/states";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAdminRealtime } from "@/hooks/useAdminPanel";
import { formatCUP, formatDateTime } from "@/lib/format";
import {
  completeWithdrawal,
  getFundsHistory,
  getFundsOverview,
  rejectWithdrawal,
  type DepositRequestRow,
  type FundsHistoryFilters,
  type WithdrawalRequestRow,
} from "@/lib/funds.functions";
import { getDepositProofUrl, reviewDeposit } from "@/lib/payments.functions";

export const Route = createFileRoute("/_authenticated/admin/fondos")({
  head: () => ({
    meta: [
      { title: "Fondos — Panel MONSTORE" },
      {
        name: "description",
        content:
          "Solicitudes de fondos y retiros, dinero retenido, control de las tres líneas e historial.",
      },
      { property: "og:title", content: "Fondos — Panel MONSTORE" },
      {
        property: "og:description",
        content: "Centro de operaciones de fondos: solicitudes, retiros, retenciones y líneas.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminFundsPage,
});

const METHOD_LABELS: Record<string, string> = {
  saldo_movil: "Saldo móvil",
  tarjeta_cup: "Tarjeta CUP",
  usdt: "USDT",
  zelle: "Zelle",
  wallet: "Wallet",
};

function methodLabel(method: string) {
  return METHOD_LABELS[method] ?? method.replace(/_/g, " ");
}

/** Tiempo transcurrido desde que el cliente envió la solicitud. */
function waitingSince(created: string, now: number) {
  const minutes = Math.max(0, Math.floor((now - new Date(created).getTime()) / 60000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ${minutes % 60} min`;
  return `${Math.floor(hours / 24)} d ${hours % 24} h`;
}

function whatsappLink(phone: string) {
  const digits = phone.replace(/\D/g, "");
  const full = digits.startsWith("53") ? digits : `53${digits}`;
  return `https://wa.me/${full}`;
}

function ClientCell({ name, phone, avatar }: { name: string; phone: string; avatar: string | null }) {
  return (
    <div className="flex items-center gap-2">
      <Avatar className="size-8">
        {avatar ? <AvatarImage src={avatar} alt="" /> : null}
        <AvatarFallback>{name.slice(0, 1).toUpperCase()}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <span className="block truncate text-sm font-medium">{name}</span>
        <span className="block text-xs text-muted-foreground">{phone || "Sin teléfono"}</span>
      </div>
    </div>
  );
}

function AdminFundsPage() {
  const queryClient = useQueryClient();
  const overviewFn = useServerFn(getFundsOverview);
  const [now, setNow] = useState(() => Date.now());
  const [openDeposit, setOpenDeposit] = useState<DepositRequestRow | null>(null);
  const [openWithdrawal, setOpenWithdrawal] = useState<WithdrawalRequestRow | null>(null);

  useAdminRealtime(["admin-funds", "admin-funds-history", "admin-panel"]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-funds"],
    queryFn: () => overviewFn(),
  });

  const totals = data?.totals;

  return (
    <AdminShell
      title="Fondos"
      description="Solicitudes por revisar, retiros, dinero retenido y control de las tres líneas."
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Solicitudes de fondos"
          value={String(totals?.deposits_pending ?? 0)}
          hint={`${formatCUP(totals?.deposits_amount ?? 0)} pendientes`}
          icon={<ArrowDownToLine className="size-4" aria-hidden="true" />}
        />
        <StatCard
          label="Esperando más de 24 h"
          value={String(totals?.deposits_late ?? 0)}
          hint="Atrasadas"
          icon={<Clock className="size-4" aria-hidden="true" />}
        />
        <StatCard
          label="Retiros pendientes"
          value={String(totals?.withdrawals_pending ?? 0)}
          hint={`${formatCUP(totals?.withdrawals_net ?? 0)} a pagar`}
          icon={<ArrowUpFromLine className="size-4" aria-hidden="true" />}
        />
        <StatCard
          label="Dinero retenido"
          value={formatCUP(totals?.held_funds ?? 0)}
          hint={`Saldo de clientes ${formatCUP(totals?.client_balances ?? 0)}`}
          icon={<Lock className="size-4" aria-hidden="true" />}
        />
      </div>

      <Tabs defaultValue="solicitudes" className="space-y-4">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="solicitudes">Solicitudes de fondos</TabsTrigger>
          <TabsTrigger value="retiros">Retiros</TabsTrigger>
          <TabsTrigger value="lineas">Líneas</TabsTrigger>
          <TabsTrigger value="historial">Historial</TabsTrigger>
        </TabsList>

        <TabsContent value="solicitudes">
          <DepositsTable
            rows={data?.deposits ?? []}
            loading={isLoading}
            now={now}
            onOpen={setOpenDeposit}
          />
        </TabsContent>

        <TabsContent value="retiros">
          <WithdrawalsTable
            rows={data?.withdrawals ?? []}
            loading={isLoading}
            now={now}
            onOpen={setOpenWithdrawal}
          />
        </TabsContent>

        <TabsContent value="lineas">
          <LinesPanel
            lines={data?.lines ?? []}
            pendingTotal={totals?.lines_pending_amount ?? 0}
            processedTotal={totals?.lines_processed_amount ?? 0}
          />
        </TabsContent>

        <TabsContent value="historial">
          <HistoryPanel />
        </TabsContent>
      </Tabs>

      <DepositDialog
        deposit={openDeposit}
        onClose={() => setOpenDeposit(null)}
        onDone={async () => {
          await queryClient.invalidateQueries({ queryKey: ["admin-funds"] });
          await queryClient.invalidateQueries({ queryKey: ["admin-panel"] });
          await queryClient.invalidateQueries({ queryKey: ["admin-funds-history"] });
        }}
      />
      <WithdrawalDialog
        withdrawal={openWithdrawal}
        onClose={() => setOpenWithdrawal(null)}
        onDone={async () => {
          await queryClient.invalidateQueries({ queryKey: ["admin-funds"] });
          await queryClient.invalidateQueries({ queryKey: ["admin-panel"] });
          await queryClient.invalidateQueries({ queryKey: ["admin-funds-history"] });
        }}
      />
    </AdminShell>
  );
}

function DepositsTable({
  rows,
  loading,
  now,
  onOpen,
}: {
  rows: DepositRequestRow[];
  loading: boolean;
  now: number;
  onOpen: (row: DepositRequestRow) => void;
}) {
  if (!loading && rows.length === 0) {
    return (
      <EmptyState
        title="No hay solicitudes de fondos"
        description="Aparecerán aquí en cuanto un cliente envíe un pago."
      />
    );
  }
  return (
    <section className="surface-card overflow-x-auto">
      <div className="p-5 pb-0">
        <h2 className="text-base font-semibold">Pendientes de revisión</h2>
        <p className="text-sm text-muted-foreground">Primero las más antiguas.</p>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Cliente</TableHead>
            <TableHead>Fecha y hora</TableHead>
            <TableHead>Esperando</TableHead>
            <TableHead>Envía</TableHead>
            <TableHead>Acredita</TableHead>
            <TableHead>Método</TableHead>
            <TableHead>Línea</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="text-right">Acción</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={9} className="text-sm text-muted-foreground">
                Cargando solicitudes…
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <ClientCell name={row.name} phone={row.phone} avatar={row.avatar} />
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                  {formatDateTime(row.created_at)}
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs">
                  {waitingSince(row.created_at, now)}
                </TableCell>
                <TableCell>{formatCUP(row.amount)}</TableCell>
                <TableCell className="text-primary">{formatCUP(row.credited_amount)}</TableCell>
                <TableCell className="text-xs">{methodLabel(row.payment_method)}</TableCell>
                <TableCell className="text-xs">
                  {row.line_number ? `Línea ${row.line_number}` : "—"}
                </TableCell>
                <TableCell>
                  <StatusBadge status={row.status} />
                </TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="outline" onClick={() => onOpen(row)}>
                    Abrir
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </section>
  );
}

function WithdrawalsTable({
  rows,
  loading,
  now,
  onOpen,
}: {
  rows: WithdrawalRequestRow[];
  loading: boolean;
  now: number;
  onOpen: (row: WithdrawalRequestRow) => void;
}) {
  if (!loading && rows.length === 0) {
    return (
      <EmptyState
        title="No hay retiros pendientes"
        description="Aparecerán aquí en cuanto un cliente solicite un retiro."
      />
    );
  }
  return (
    <section className="surface-card overflow-x-auto">
      <div className="p-5 pb-0">
        <h2 className="text-base font-semibold">Retiros pendientes</h2>
        <p className="text-sm text-muted-foreground">
          El dinero ya está retenido; se libera al completar o al rechazar.
        </p>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Cliente</TableHead>
            <TableHead>Fecha y hora</TableHead>
            <TableHead>Esperando</TableHead>
            <TableHead>Solicitado</TableHead>
            <TableHead>Comisión</TableHead>
            <TableHead>Neto</TableHead>
            <TableHead>Retenido</TableHead>
            <TableHead>Destino</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="text-right">Acción</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={10} className="text-sm text-muted-foreground">
                Cargando retiros…
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <ClientCell name={row.name} phone={row.phone} avatar={row.avatar} />
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                  {formatDateTime(row.created_at)}
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs">
                  {waitingSince(row.created_at, now)}
                </TableCell>
                <TableCell>{formatCUP(row.amount)}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {formatCUP(row.fee)}
                  {row.fee_pct ? ` (${row.fee_pct}%)` : ""}
                </TableCell>
                <TableCell className="font-medium">{formatCUP(row.net_amount)}</TableCell>
                <TableCell className="text-xs">{formatCUP(row.held_amount)}</TableCell>
                <TableCell className="max-w-[180px] truncate text-xs text-muted-foreground">
                  {methodLabel(row.payment_method)} · {row.payment_destination}
                </TableCell>
                <TableCell>
                  <StatusBadge status={row.status} />
                </TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="outline" onClick={() => onOpen(row)}>
                    Abrir
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </section>
  );
}

function LinesPanel({
  lines,
  pendingTotal,
  processedTotal,
}: {
  lines: {
    line_number: number;
    label: string;
    phone_number: string;
    active: boolean;
    max_pending_amount: number | null;
    pending_count: number;
    pending_amount: number;
    processed_count: number;
    processed_amount: number;
    future_amount: number;
    capacity_left: number | null;
    progress: number;
  }[];
  pendingTotal: number;
  processedTotal: number;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        {lines.map((line) => (
          <article key={line.line_number} className="surface-card space-y-3 p-5">
            <header className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-base font-semibold">Línea {line.line_number}</h3>
                <p className="text-xs text-muted-foreground">
                  {line.phone_number || "Sin configurar"}
                </p>
              </div>
              <span className="text-xs">{line.active ? "Activa" : "Inactiva"}</span>
            </header>
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Cobrado (30 días)</dt>
                <dd>{formatCUP(line.processed_amount)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">En revisión</dt>
                <dd>{formatCUP(line.pending_amount)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Total futuro</dt>
                <dd>{formatCUP(line.future_amount)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Capacidad libre</dt>
                <dd>
                  {line.capacity_left == null ? "Sin límite" : formatCUP(line.capacity_left)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Operaciones</dt>
                <dd>
                  {line.pending_count} pendientes · {line.processed_count} procesadas
                </dd>
              </div>
            </dl>
            <Progress value={line.progress} aria-label={`Uso de la línea ${line.line_number}`} />
          </article>
        ))}
      </div>
      <div className="surface-card grid gap-3 p-5 sm:grid-cols-2">
        <StatCard
          label="Total general en revisión"
          value={formatCUP(pendingTotal)}
          icon={<Clock className="size-4" aria-hidden="true" />}
        />
        <StatCard
          label="Total general cobrado (30 días)"
          value={formatCUP(processedTotal)}
          icon={<Wallet className="size-4" aria-hidden="true" />}
        />
      </div>
    </div>
  );
}

function DepositDialog({
  deposit,
  onClose,
  onDone,
}: {
  deposit: DepositRequestRow | null;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const reviewFn = useServerFn(reviewDeposit);
  const signUrl = useServerFn(getDepositProofUrl);
  const [reason, setReason] = useState("");

  useEffect(() => setReason(""), [deposit?.id]);

  const review = useMutation({
    mutationFn: async (approve: boolean) => {
      if (!deposit) return;
      if (!approve && reason.trim().length < 3) {
        throw new Error("Escribe el motivo del rechazo.");
      }
      await reviewFn({
        data: { depositId: deposit.id, approve, reason: approve ? "" : reason.trim() },
      });
    },
    onSuccess: async (_result, approve) => {
      toast.success(approve ? "Fondos acreditados al cliente" : "Solicitud rechazada");
      await onDone();
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={deposit !== null} onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        {deposit ? (
          <>
            <DialogHeader>
              <DialogTitle>Solicitud de fondos</DialogTitle>
              <DialogDescription>{formatDateTime(deposit.created_at)}</DialogDescription>
            </DialogHeader>

            <div className="space-y-4 text-sm">
              <div className="flex items-center justify-between gap-3">
                <ClientCell name={deposit.name} phone={deposit.phone} avatar={deposit.avatar} />
                {deposit.phone ? (
                  <Button asChild size="sm" variant="outline">
                    <a href={whatsappLink(deposit.phone)} target="_blank" rel="noreferrer">
                      <MessageCircle className="size-4" aria-hidden="true" /> WhatsApp
                    </a>
                  </Button>
                ) : null}
              </div>

              <dl className="grid grid-cols-2 gap-2">
                <div>
                  <dt className="text-xs text-muted-foreground">Envía</dt>
                  <dd className="font-medium">{formatCUP(deposit.amount)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Se acredita</dt>
                  <dd className="font-medium text-primary">{formatCUP(deposit.credited_amount)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Método</dt>
                  <dd>{methodLabel(deposit.payment_method)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Estado</dt>
                  <dd>
                    <StatusBadge status={deposit.status} />
                  </dd>
                </div>
                {deposit.payment_method === "saldo_movil" ? (
                  <div className="col-span-2 rounded-lg border border-border p-3">
                    <dt className="text-xs text-muted-foreground">Línea asignada</dt>
                    <dd className="font-medium">
                      Línea {deposit.line_number ?? "—"} · {deposit.line_phone ?? "Sin número"}
                    </dd>
                    <dd className="text-xs text-muted-foreground">
                      {deposit.line_assigned_at
                        ? `Asignada ${formatDateTime(deposit.line_assigned_at)}`
                        : "Sin asignar"}
                      {deposit.line_released_at
                        ? ` · Liberada ${formatDateTime(deposit.line_released_at)}`
                        : " · Ocupada"}
                    </dd>
                  </div>
                ) : null}
                {deposit.destination_value ? (
                  <div className="col-span-2">
                    <dt className="text-xs text-muted-foreground">Destino del pago</dt>
                    <dd className="break-all">{deposit.destination_value}</dd>
                  </div>
                ) : null}
                {deposit.transaction_id ? (
                  <div className="col-span-2">
                    <dt className="text-xs text-muted-foreground">Número de transacción</dt>
                    <dd className="break-all">{deposit.transaction_id}</dd>
                  </div>
                ) : null}
                {deposit.sender_phone ? (
                  <div>
                    <dt className="text-xs text-muted-foreground">Envía desde</dt>
                    <dd>{deposit.sender_phone}</dd>
                  </div>
                ) : null}
              </dl>

              {deposit.proof_image_url ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    try {
                      const { url } = await signUrl({ data: { path: deposit.proof_image_url! } });
                      if (url) window.open(url, "_blank", "noopener,noreferrer");
                      else toast.error("No pudimos abrir la captura.");
                    } catch {
                      toast.error("No pudimos abrir la captura.");
                    }
                  }}
                >
                  Ver captura del pago
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground">El cliente no envió captura.</p>
              )}

              <div className="space-y-1">
                <label className="text-xs text-muted-foreground" htmlFor="deposit-reason">
                  Motivo (obligatorio para rechazar)
                </label>
                <Textarea
                  id="deposit-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Ej.: no encontramos el pago en la línea 2."
                />
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                disabled={review.isPending}
                onClick={() => review.mutate(false)}
              >
                Rechazar
              </Button>
              <Button disabled={review.isPending} onClick={() => review.mutate(true)}>
                {review.isPending ? "Procesando…" : "Aprobar y acreditar"}
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function WithdrawalDialog({
  withdrawal,
  onClose,
  onDone,
}: {
  withdrawal: WithdrawalRequestRow | null;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const completeFn = useServerFn(completeWithdrawal);
  const rejectFn = useServerFn(rejectWithdrawal);
  const [transactionId, setTransactionId] = useState("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    setTransactionId("");
    setReason("");
  }, [withdrawal?.id]);

  const complete = useMutation({
    mutationFn: async () => {
      if (!withdrawal) return { changed: true };
      return completeFn({
        data: { withdrawalId: withdrawal.id, transactionId, note: reason.trim() },
      });
    },
    onSuccess: async (result) => {
      toast.success(
        result && result.changed === false
          ? "Ese retiro ya estaba procesado."
          : "Retiro completado y retención liberada",
      );
      await onDone();
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const reject = useMutation({
    mutationFn: async () => {
      if (!withdrawal) return { changed: true };
      if (reason.trim().length < 3) throw new Error("Escribe el motivo del rechazo.");
      return rejectFn({ data: { withdrawalId: withdrawal.id, reason: reason.trim() } });
    },
    onSuccess: async (result) => {
      toast.success(
        result && result.changed === false
          ? "Ese retiro ya estaba procesado."
          : "Retiro rechazado y dinero devuelto",
      );
      await onDone();
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const busy = complete.isPending || reject.isPending;

  return (
    <Dialog open={withdrawal !== null} onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        {withdrawal ? (
          <>
            <DialogHeader>
              <DialogTitle>Retiro</DialogTitle>
              <DialogDescription>{formatDateTime(withdrawal.created_at)}</DialogDescription>
            </DialogHeader>

            <div className="space-y-4 text-sm">
              <div className="flex items-center justify-between gap-3">
                <ClientCell
                  name={withdrawal.name}
                  phone={withdrawal.phone}
                  avatar={withdrawal.avatar}
                />
                {withdrawal.phone ? (
                  <Button asChild size="sm" variant="outline">
                    <a href={whatsappLink(withdrawal.phone)} target="_blank" rel="noreferrer">
                      <MessageCircle className="size-4" aria-hidden="true" /> WhatsApp
                    </a>
                  </Button>
                ) : null}
              </div>

              <dl className="grid grid-cols-2 gap-2">
                <div>
                  <dt className="text-xs text-muted-foreground">Solicitado</dt>
                  <dd className="font-medium">{formatCUP(withdrawal.amount)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">
                    Comisión {withdrawal.fee_pct ? `(${withdrawal.fee_pct}%)` : ""}
                  </dt>
                  <dd>{formatCUP(withdrawal.fee)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">A pagar al cliente</dt>
                  <dd className="font-medium text-primary">{formatCUP(withdrawal.net_amount)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Retenido ahora</dt>
                  <dd>{formatCUP(withdrawal.held_amount)}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-xs text-muted-foreground">Destino</dt>
                  <dd className="break-all">
                    {methodLabel(withdrawal.payment_method)} · {withdrawal.payment_destination}
                  </dd>
                </div>
                {withdrawal.line_number ? (
                  <div>
                    <dt className="text-xs text-muted-foreground">Línea</dt>
                    <dd>Línea {withdrawal.line_number}</dd>
                  </div>
                ) : null}
              </dl>

              <div className="space-y-1">
                <label className="text-xs text-muted-foreground" htmlFor="withdrawal-transaction">
                  Número de la transacción (opcional)
                </label>
                <Input
                  id="withdrawal-transaction"
                  value={transactionId}
                  onChange={(event) => setTransactionId(event.target.value)}
                  placeholder="Ej.: TM123456789"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-muted-foreground" htmlFor="withdrawal-reason">
                  Nota / motivo (obligatorio para rechazar)
                </label>
                <Textarea
                  id="withdrawal-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Ej.: el número de destino no recibe transferencias."
                />
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" disabled={busy} onClick={() => reject.mutate()}>
                Rechazar y devolver
              </Button>
              <Button disabled={busy} onClick={() => complete.mutate()}>
                {complete.isPending ? "Procesando…" : "Retiro completado"}
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

const STATUS_OPTIONS = [
  { value: "todos", label: "Todos los estados" },
  { value: "aprobado", label: "Aprobado / completado" },
  { value: "rechazado", label: "Rechazado" },
];

const METHOD_OPTIONS = [
  { value: "todos", label: "Todos los métodos" },
  { value: "saldo_movil", label: "Saldo móvil" },
  { value: "tarjeta_cup", label: "Tarjeta CUP" },
  { value: "usdt", label: "USDT" },
  { value: "zelle", label: "Zelle" },
];

function HistoryPanel() {
  const historyFn = useServerFn(getFundsHistory);
  const [filters, setFilters] = useState<FundsHistoryFilters>({
    kind: "todos",
    status: "todos",
    method: "todos",
    line: "todas",
    search: "",
    from: "",
    to: "",
  });

  const query = useQuery({
    queryKey: ["admin-funds-history", filters],
    queryFn: () => historyFn({ data: filters }),
  });

  const rows = useMemo(() => query.data ?? [], [query.data]);

  return (
    <div className="space-y-4">
      <div className="surface-card grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
        <Select
          value={filters.kind}
          onValueChange={(value) =>
            setFilters((current) => ({ ...current, kind: value as FundsHistoryFilters["kind"] }))
          }
        >
          <SelectTrigger aria-label="Tipo de operación">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Fondos y retiros</SelectItem>
            <SelectItem value="deposito">Solo fondos</SelectItem>
            <SelectItem value="retiro">Solo retiros</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={filters.status}
          onValueChange={(value) => setFilters((current) => ({ ...current, status: value }))}
        >
          <SelectTrigger aria-label="Estado">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.method}
          onValueChange={(value) => setFilters((current) => ({ ...current, method: value }))}
        >
          <SelectTrigger aria-label="Método">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {METHOD_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.line}
          onValueChange={(value) => setFilters((current) => ({ ...current, line: value }))}
        >
          <SelectTrigger aria-label="Línea">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas las líneas</SelectItem>
            <SelectItem value="1">Línea 1</SelectItem>
            <SelectItem value="2">Línea 2</SelectItem>
            <SelectItem value="3">Línea 3</SelectItem>
          </SelectContent>
        </Select>

        <Input
          type="date"
          value={filters.from}
          aria-label="Desde"
          onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))}
        />
        <Input
          type="date"
          value={filters.to}
          aria-label="Hasta"
          onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))}
        />
        <Input
          className="sm:col-span-2"
          placeholder="Buscar por cliente, teléfono o administrador"
          value={filters.search}
          onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
        />
      </div>

      {!query.isLoading && rows.length === 0 ? (
        <EmptyState
          title="Sin operaciones en el historial"
          description="Cambia los filtros o espera a que se revise una solicitud."
        />
      ) : (
        <section className="surface-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Importe</TableHead>
                <TableHead>Comisión</TableHead>
                <TableHead>Neto</TableHead>
                <TableHead>Método</TableHead>
                <TableHead>Línea</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Revisado</TableHead>
                <TableHead>Administrador</TableHead>
                <TableHead>Nota</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.isLoading ? (
                <TableRow>
                  <TableCell colSpan={11} className="text-sm text-muted-foreground">
                    Cargando historial…
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={`${row.kind}-${row.id}`}>
                    <TableCell className="font-medium">
                      {row.kind === "deposito" ? "Fondos" : "Retiro"}
                    </TableCell>
                    <TableCell>
                      <span className="block text-sm">{row.user_name}</span>
                      <span className="block text-xs text-muted-foreground">{row.user_phone}</span>
                    </TableCell>
                    <TableCell>{formatCUP(row.amount)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {row.fee ? formatCUP(row.fee) : "—"}
                    </TableCell>
                    <TableCell>{formatCUP(row.net_amount)}</TableCell>
                    <TableCell className="text-xs">{methodLabel(row.method)}</TableCell>
                    <TableCell className="text-xs">{row.line_number ?? "—"}</TableCell>
                    <TableCell>
                      <StatusBadge status={row.status} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {row.reviewed_at ? formatDateTime(row.reviewed_at) : "—"}
                    </TableCell>
                    <TableCell className="text-xs">{row.admin_name}</TableCell>
                    <TableCell className="max-w-[200px] text-xs text-muted-foreground">
                      {row.note || "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </section>
      )}
    </div>
  );
}
