import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownToLine, ArrowUpFromLine, Lock, Wallet } from "lucide-react";
import { AdminShell } from "@/components/layout/AdminShell";
import { StatCard } from "@/components/common/PageHeader";
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
import { useAdminRealtime } from "@/hooks/useAdminPanel";
import { formatCUP, formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/fondos")({
  head: () => ({
    meta: [
      { title: "Fondos — Panel MONSTORE" },
      {
        name: "description",
        content: "Solicitudes de fondos y retiros pendientes, dinero retenido y estado de las líneas.",
      },
      { property: "og:title", content: "Fondos — Panel MONSTORE" },
      { property: "og:description", content: "Solicitudes, retiros, retenciones y líneas de pago." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminFundsPage,
});

function useFunds() {
  return useQuery({
    queryKey: ["admin-funds"],
    queryFn: async () => {
      const [deposits, withdrawals, wallets, lines] = await Promise.all([
        supabase
          .from("deposits")
          .select("id, user_id, amount, credited_amount, status, payment_method, line_number, created_at")
          .order("created_at", { ascending: false })
          .limit(100),
        supabase
          .from("withdrawals")
          .select("id, user_id, amount, net_amount, fee, status, payment_method, line_number, created_at")
          .order("created_at", { ascending: false })
          .limit(100),
        supabase.from("wallets").select("user_id, balance, held_balance"),
        supabase
          .from("payment_lines")
          .select("id, line_number, label, phone_number, active, payment_method, max_pending_amount")
          .order("line_number"),
      ]);

      const ids = [
        ...new Set([
          ...(deposits.data ?? []).map((row) => row.user_id),
          ...(withdrawals.data ?? []).map((row) => row.user_id),
        ]),
      ];
      const names = new Map<string, string>();
      if (ids.length > 0) {
        const { data } = await supabase.from("profiles").select("id, name, phone").in("id", ids);
        for (const profile of data ?? []) {
          names.set(profile.id, profile.name || profile.phone || "Cliente");
        }
      }

      const pendingDeposits = (deposits.data ?? []).filter((row) => row.status === "pendiente");
      const pendingWithdrawals = (withdrawals.data ?? []).filter(
        (row) => row.status === "pendiente",
      );

      const saldoLines = [1, 2, 3].map((lineNumber) => {
        const config = (lines.data ?? []).find(
          (row) => row.line_number === lineNumber && row.payment_method === "saldo_movil",
        );
        return {
          lineNumber,
          label: config?.label ?? `Línea ${lineNumber}`,
          phone: config?.phone_number ?? "Sin configurar",
          active: config?.active ?? false,
          pendingDeposits: pendingDeposits.filter(
            (row) => row.payment_method === "saldo_movil" && row.line_number === lineNumber,
          ).length,
          pendingWithdrawals: pendingWithdrawals.filter((row) => row.line_number === lineNumber)
            .length,
        };
      });

      return {
        pending: [
          ...pendingDeposits.map((row) => ({
            id: row.id,
            kind: "Agregar fondos" as const,
            user: names.get(row.user_id) ?? "Cliente",
            amount: Number(row.amount ?? 0),
            net: Number(row.credited_amount ?? 0),
            method: row.payment_method,
            line: row.line_number,
            status: row.status,
            created_at: row.created_at,
            to: "/admin/depositos" as const,
          })),
          ...pendingWithdrawals.map((row) => ({
            id: row.id,
            kind: "Retiro" as const,
            user: names.get(row.user_id) ?? "Cliente",
            amount: Number(row.amount ?? 0),
            net: Number(row.net_amount ?? 0),
            method: row.payment_method,
            line: row.line_number,
            status: row.status,
            created_at: row.created_at,
            to: "/admin/retiros" as const,
          })),
        ].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)),
        depositsPending: pendingDeposits.length,
        withdrawalsPending: pendingWithdrawals.length,
        held: (wallets.data ?? []).reduce((total, row) => total + Number(row.held_balance ?? 0), 0),
        balances: (wallets.data ?? []).reduce(
          (total, row) => total + Number(row.balance ?? 0),
          0,
        ),
        saldoLines,
      };
    },
  });
}

function AdminFundsPage() {
  const { data, isLoading } = useFunds();
  useAdminRealtime(["admin-funds", "admin-panel"]);

  return (
    <AdminShell
      title="Fondos"
      description="Solicitudes por revisar, dinero retenido y estado de las tres líneas de saldo."
      actions={
        <>
          <Button asChild size="sm">
            <Link to="/admin/depositos">Revisar solicitudes de fondos</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to="/admin/retiros">Revisar retiros</Link>
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Solicitudes de fondos"
          value={String(data?.depositsPending ?? 0)}
          hint="Pendientes de revisión"
          icon={<ArrowDownToLine className="size-4" aria-hidden="true" />}
        />
        <StatCard
          label="Retiros pendientes"
          value={String(data?.withdrawalsPending ?? 0)}
          icon={<ArrowUpFromLine className="size-4" aria-hidden="true" />}
        />
        <StatCard
          label="Fondos retenidos"
          value={formatCUP(data?.held ?? 0)}
          icon={<Lock className="size-4" aria-hidden="true" />}
        />
        <StatCard
          label="Saldo total de clientes"
          value={formatCUP(data?.balances ?? 0)}
          icon={<Wallet className="size-4" aria-hidden="true" />}
        />
      </div>

      <section className="surface-card overflow-x-auto">
        <div className="p-5 pb-0">
          <h2 className="text-base font-semibold">Líneas de saldo móvil</h2>
          <p className="text-sm text-muted-foreground">Cada línea se controla por separado.</p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Línea</TableHead>
              <TableHead>Número</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Fondos en revisión</TableHead>
              <TableHead>Retiros en revisión</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data?.saldoLines ?? []).map((line) => (
              <TableRow key={line.lineNumber}>
                <TableCell className="font-medium">Línea {line.lineNumber}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{line.phone}</TableCell>
                <TableCell className="text-xs">{line.active ? "Activa" : "Inactiva"}</TableCell>
                <TableCell>{line.pendingDeposits}</TableCell>
                <TableCell>{line.pendingWithdrawals}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      {!isLoading && (data?.pending ?? []).length === 0 ? (
        <EmptyState
          title="No hay solicitudes por revisar"
          description="Aparecerán aquí en cuanto un cliente pida fondos o un retiro."
        />
      ) : (
        <section className="surface-card overflow-x-auto">
          <div className="p-5 pb-0">
            <h2 className="text-base font-semibold">Cola de trabajo</h2>
            <p className="text-sm text-muted-foreground">
              Lo más antiguo primero al final de la lista.
            </p>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Método</TableHead>
                <TableHead>Línea</TableHead>
                <TableHead>Importe</TableHead>
                <TableHead>Neto</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead className="text-right">Acción</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.pending ?? []).map((row) => (
                <TableRow key={`${row.kind}-${row.id}`}>
                  <TableCell className="font-medium">{row.kind}</TableCell>
                  <TableCell>{row.user}</TableCell>
                  <TableCell className="capitalize">{row.method.replace("_", " ")}</TableCell>
                  <TableCell>{row.line ?? "—"}</TableCell>
                  <TableCell>{formatCUP(row.amount)}</TableCell>
                  <TableCell>{formatCUP(row.net)}</TableCell>
                  <TableCell>
                    <StatusBadge status={row.status} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {formatDateTime(row.created_at)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild size="sm" variant="outline">
                      <Link to={row.to}>Abrir</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      )}
    </AdminShell>
  );
}
