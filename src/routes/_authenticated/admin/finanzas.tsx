import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AdminShell } from "@/components/layout/AdminShell";
import { StatCard } from "@/components/common/PageHeader";
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
import { formatCUP } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/finanzas")({
  head: () => ({
    meta: [
      { title: "Finanzas — Panel MONSTORE" },
      {
        name: "description",
        content: "Ganancias del día y del mes, USD vendidos y fondos recibidos por método de pago.",
      },
      { property: "og:title", content: "Finanzas — Panel MONSTORE" },
      { property: "og:description", content: "Ganancias, USD vendidos y cobros por método." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminFinancePage,
});

const PERIODS = [
  { id: "hoy", label: "Hoy", days: 0 },
  { id: "semana", label: "7 días", days: 7 },
  { id: "mes", label: "Mes", days: 30 },
  { id: "trimestre", label: "90 días", days: 90 },
] as const;

const METHOD_LABELS: Record<string, string> = {
  saldo_movil: "Saldo móvil",
  tarjeta_cup: "Tarjeta CUP",
  wallet: "Monedero",
  usdt: "USDT",
  zelle: "Zelle",
};

function since(days: number) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  if (days > 0) date.setDate(date.getDate() - days);
  return date.toISOString();
}

function useFinance(days: number) {
  return useQuery({
    queryKey: ["admin-finance", days],
    queryFn: async () => {
      const from = since(days);
      const [orders, deposits, withdrawals, lines, settings] = await Promise.all([
        supabase
          .from("orders")
          .select("id, total_amount, quantity, status, created_at, products(g2bulk_cost)")
          .gte("created_at", from),
        supabase
          .from("deposits")
          .select("amount, credited_amount, status, payment_method, line_number, created_at")
          .gte("created_at", from),
        supabase
          .from("withdrawals")
          .select("amount, net_amount, fee, status, payment_method, created_at")
          .gte("created_at", from),
        supabase
          .from("payment_lines")
          .select("id, line_number, label, phone_number, active, payment_method")
          .order("line_number"),
        supabase.from("platform_settings").select("usd_to_cup, usd_margin_cup").maybeSingle(),
      ]);

      const usdToCup = Number(settings.data?.usd_to_cup ?? 0);
      const billable = (orders.data ?? []).filter(
        (row) => row.status !== "reembolsado" && row.status !== "cancelado",
      );
      const cost = (row: (typeof billable)[number]) =>
        Number(row.products?.g2bulk_cost ?? 0) * Number(row.quantity ?? 1);

      const sales = billable.reduce((total, row) => total + Number(row.total_amount ?? 0), 0);
      const usdSold = billable.reduce((total, row) => total + cost(row), 0);
      const profit = sales - usdSold * usdToCup;

      const approvedDeposits = (deposits.data ?? []).filter((row) => row.status === "aprobado");
      const byMethod = Object.keys(METHOD_LABELS).map((method) => {
        const rows = approvedDeposits.filter((row) => row.payment_method === method);
        return {
          method,
          label: METHOD_LABELS[method] ?? method,
          count: rows.length,
          received: rows.reduce((total, row) => total + Number(row.amount ?? 0), 0),
          credited: rows.reduce((total, row) => total + Number(row.credited_amount ?? 0), 0),
        };
      });

      const saldoLines = [1, 2, 3].map((lineNumber) => {
        const config = (lines.data ?? []).find(
          (row) => row.line_number === lineNumber && row.payment_method === "saldo_movil",
        );
        const rows = approvedDeposits.filter(
          (row) => row.payment_method === "saldo_movil" && row.line_number === lineNumber,
        );
        const pending = (deposits.data ?? []).filter(
          (row) =>
            row.payment_method === "saldo_movil" &&
            row.line_number === lineNumber &&
            row.status === "pendiente",
        ).length;
        return {
          lineNumber,
          label: config?.label ?? `Línea ${lineNumber}`,
          phone: config?.phone_number ?? "Sin configurar",
          active: config?.active ?? false,
          count: rows.length,
          received: rows.reduce((total, row) => total + Number(row.amount ?? 0), 0),
          pending,
        };
      });

      const paidWithdrawals = (withdrawals.data ?? []).filter((row) => row.status === "aprobado");

      return {
        usdToCup,
        usdMargin: Number(settings.data?.usd_margin_cup ?? 0),
        sales,
        profit,
        usdSold,
        orders: billable.length,
        depositsCredited: approvedDeposits.reduce(
          (total, row) => total + Number(row.credited_amount ?? 0),
          0,
        ),
        withdrawalsPaid: paidWithdrawals.reduce((total, row) => total + Number(row.amount ?? 0), 0),
        withdrawalFees: paidWithdrawals.reduce((total, row) => total + Number(row.fee ?? 0), 0),
        byMethod,
        saldoLines,
      };
    },
  });
}

function AdminFinancePage() {
  const [period, setPeriod] = useState<(typeof PERIODS)[number]["id"]>("hoy");
  const days = useMemo(() => PERIODS.find((item) => item.id === period)?.days ?? 0, [period]);
  const { data, isLoading } = useFinance(days);
  useAdminRealtime(["admin-finance", "admin-panel"]);

  return (
    <AdminShell
      title="Finanzas"
      description="Ganancias, USD vendidos y cobros por método, con las tres líneas de saldo separadas."
      actions={PERIODS.map((item) => (
        <Button
          key={item.id}
          size="sm"
          variant={period === item.id ? "default" : "outline"}
          onClick={() => setPeriod(item.id)}
        >
          {item.label}
        </Button>
      ))}
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Ventas del período" value={formatCUP(data?.sales ?? 0)} />
        <StatCard
          label="Ganancia del período"
          value={formatCUP(data?.profit ?? 0)}
          hint={`${data?.orders ?? 0} pedidos`}
        />
        <StatCard
          label="USD vendidos"
          value={`${(data?.usd_sold ?? data?.usdSold ?? 0).toFixed(2)} USD`}
          hint={data?.usdToCup ? `1 USD = ${formatCUP(data.usdToCup)}` : "Falta el valor del USD"}
        />
        <StatCard
          label="Comisiones de retiro"
          value={formatCUP(data?.withdrawalFees ?? 0)}
          hint={`Retirado: ${formatCUP(data?.withdrawalsPaid ?? 0)}`}
        />
      </div>

      <section className="surface-card overflow-x-auto">
        <div className="p-5 pb-0">
          <h2 className="text-base font-semibold">Fondos recibidos por método</h2>
          <p className="text-sm text-muted-foreground">
            Solo solicitudes aprobadas dentro del período elegido.
          </p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Método</TableHead>
              <TableHead>Solicitudes</TableHead>
              <TableHead>Recibido</TableHead>
              <TableHead>Acreditado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data?.byMethod ?? []).map((row) => (
              <TableRow key={row.method}>
                <TableCell className="font-medium">{row.label}</TableCell>
                <TableCell>{row.count}</TableCell>
                <TableCell>{formatCUP(row.received)}</TableCell>
                <TableCell>{formatCUP(row.credited)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <section className="surface-card overflow-x-auto">
        <div className="p-5 pb-0">
          <h2 className="text-base font-semibold">Saldo móvil por línea</h2>
          <p className="text-sm text-muted-foreground">
            Cada línea se contabiliza por separado; nunca se mezclan.
          </p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Línea</TableHead>
              <TableHead>Número</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Aprobadas</TableHead>
              <TableHead>Recibido</TableHead>
              <TableHead>En revisión</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data?.saldoLines ?? []).map((line) => (
              <TableRow key={line.lineNumber}>
                <TableCell className="font-medium">Línea {line.lineNumber}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{line.phone}</TableCell>
                <TableCell className="text-xs">{line.active ? "Activa" : "Inactiva"}</TableCell>
                <TableCell>{line.count}</TableCell>
                <TableCell>{formatCUP(line.received)}</TableCell>
                <TableCell>{line.pending}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      {!isLoading && (data?.orders ?? 0) === 0 ? (
        <EmptyState
          title="Sin ventas en este período"
          description="Cambia el período para ver otro rango de fechas."
        />
      ) : null}
    </AdminShell>
  );
}
