import { createFileRoute } from "@tanstack/react-router";
import { AdminShell } from "@/components/layout/AdminShell";
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
import { useAdminUsers } from "@/hooks/useAdmin";
import { formatCUP, formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/usuarios")({
  head: () => ({
    meta: [
      { title: "Usuarios — Panel MONSTORE" },
      { name: "description", content: "Listado de usuarios registrados en la plataforma." },
    ],
  }),
  component: AdminUsersPage,
});

function AdminUsersPage() {
  const { data: users, isLoading } = useAdminUsers();

  return (
    <AdminShell title="Usuarios" description="Perfiles registrados y su estado.">
      {!isLoading && (users ?? []).length === 0 ? (
        <EmptyState title="Todavía no hay usuarios registrados" />
      ) : (
        <div className="surface-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead>Ubicación</TableHead>
                <TableHead>Código</TableHead>
                <TableHead>Saldo</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Alta</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(users ?? []).map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.name || "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{user.phone}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {[user.municipality, user.province].filter(Boolean).join(", ") || "—"}
                  </TableCell>
                  <TableCell className="text-xs">{user.referral_code}</TableCell>
                  <TableCell>{formatCUP(user.balance)}</TableCell>
                  <TableCell className="capitalize">{user.role}</TableCell>
                  <TableCell>
                    <StatusBadge status={user.status} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {formatDate(user.created_at)}
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
