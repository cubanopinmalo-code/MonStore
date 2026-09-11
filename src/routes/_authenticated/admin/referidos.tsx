import { createFileRoute } from "@tanstack/react-router";
import { AdminShell } from "@/components/layout/AdminShell";
import { StatCard } from "@/components/common/PageHeader";
import { StatusBadge } from "@/components/common/StatusBadge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { mockReferrals, mockUsers } from "@/data/mock/account";
import { formatCUP, formatDate } from "@/lib/format";

export const Route = createFileRoute("/admin/referidos")({
  head: () => ({
    meta: [
      { title: "Referidos — Panel MONSTORE" },
      { name: "description", content: "Invitaciones registradas y recompensas entregadas." },
    ],
  }),
  component: AdminReferralsPage,
});

function AdminReferralsPage() {
  const rewards = mockReferrals.reduce((total, item) => total + item.reward_amount, 0);

  return (
    <AdminShell title="Referidos" description="Programa de invitaciones.">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Invitaciones" value={String(mockReferrals.length)} />
        <StatCard
          label="Activos"
          value={String(mockReferrals.filter((item) => item.status === "activo").length)}
        />
        <StatCard label="Recompensas pagadas" value={formatCUP(rewards)} />
      </div>

      <div className="surface-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Quien invita</TableHead>
              <TableHead>Invitado</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Recompensa</TableHead>
              <TableHead>Fecha</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {mockReferrals.map((referral) => {
              const referrer = mockUsers.find((user) => user.id === referral.referrer_user_id);
              return (
                <TableRow key={referral.id}>
                  <TableCell className="font-medium">{referrer?.name ?? "—"}</TableCell>
                  <TableCell>{referral.referred_name}</TableCell>
                  <TableCell>
                    <StatusBadge status={referral.status} />
                  </TableCell>
                  <TableCell>{formatCUP(referral.reward_amount)}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {formatDate(referral.created_at)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </AdminShell>
  );
}
