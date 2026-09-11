import { createFileRoute } from "@tanstack/react-router";
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
import { mockUsers } from "@/data/mock/account";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/admin/usuarios")({
  head: () => ({
    meta: [
      { title: "Usuarios — Panel MONSTORE" },
      { name: "description", content: "Listado de usuarios registrados en la plataforma." },
    ],
  }),
  component: AdminUsersPage,
});

function AdminUsersPage() {
  return (
    <AdminShell title="Usuarios" description="Perfiles registrados y su estado.">
      <div className="surface-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Contacto</TableHead>
              <TableHead>Ubicación</TableHead>
              <TableHead>Código</TableHead>
              <TableHead>Rol</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Alta</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {mockUsers.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="font-medium">{user.name}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {user.email}
                  <span className="block">{user.phone}</span>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {user.municipality}, {user.province}
                </TableCell>
                <TableCell className="text-xs">{user.referral_code}</TableCell>
                <TableCell className="capitalize">{user.role}</TableCell>
                <TableCell>
                  <StatusBadge status={user.status} />
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                  {formatDate(user.created_at)}
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="outline" size="sm" disabled>
                    Gestionar
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">
        Las acciones se activarán cuando exista autenticación real.
      </p>
    </AdminShell>
  );
}
