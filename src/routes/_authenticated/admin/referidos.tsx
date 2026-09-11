import { createFileRoute } from "@tanstack/react-router";
import { AdminShell } from "@/components/layout/AdminShell";
import { StatCard } from "@/components/common/PageHeader";
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
import { useAdminReferrals } from "@/hooks/useAdmin";
import { formatCUP, formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/referidos")({
  head: () => ({
    meta: [
      { title: "Referidos — Panel MONSTORE" },
      { name: "description", content: "Invitaciones registradas y premios entregados." },
    ],
  }),
  component: AdminReferralsPage,
});

function AdminReferralsPage() {
  const { data: referrals, isLoading } = useAdminReferrals();
  const rows = referrals ?? [];
  const claimed = rows.filter((row) => row.reward_claimed_at);
  const rewarded = claimed.reduce((total, row) => total + Number(row.reward_amount ?? 0), 0);

  return (
    <AdminShell title="Referidos" description="Invitaciones y premios de la plataforma.">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Invitaciones registradas" value={String(rows.length)} />
        <StatCard label="Premios reclamados" value={String(claimed.length)} />
        <StatCard label="Total entregado" value={formatCUP(rewarded)} />
      </div>

      {!isLoading && rows.length === 0 ? (
        <EmptyState
          title="Todavía no hay referidos"
          description="Aparecerán cuando alguien se registre con un enlace de invitación."
        />
      ) : (
        <div className="surface-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invitó</TableHead>
                <TableHead>Invitado</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Premio</TableHead>
                <TableHead>Fecha</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.referrer_name}</TableCell>
                  <TableCell>{row.referred_name}</TableCell>
                  <TableCell>
                    <StatusBadge status={row.reward_claimed_at ? "premiado" : row.status} />
                  </TableCell>
                  <TableCell>{formatCUP(Number(row.reward_amount ?? 0))}</TableCell>
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
