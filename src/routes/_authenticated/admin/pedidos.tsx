import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AdminShell } from "@/components/layout/AdminShell";
import { StatusBadge } from "@/components/common/StatusBadge";
import { EmptyState } from "@/components/common/states";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { mockOrders } from "@/data/mock/orders";
import { mockProducts } from "@/data/mock/products";
import { mockUsers } from "@/data/mock/account";
import { formatCUP, formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/admin/pedidos")({
  head: () => ({
    meta: [
      { title: "Pedidos — Panel MONSTORE" },
      { name: "description", content: "Gestión y seguimiento de todos los pedidos." },
    ],
  }),
  component: AdminOrdersPage,
});

const FILTERS = ["todos", "pendiente", "procesando", "completado", "error", "reembolsado"] as const;

function AdminOrdersPage() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("todos");
  const [query, setQuery] = useState("");

  const orders = mockOrders.filter((order) => {
    const matchStatus = filter === "todos" || order.status === filter;
    const matchQuery =
      query.trim() === "" ||
      order.code.toLowerCase().includes(query.toLowerCase()) ||
      (order.player_id ?? "").includes(query);
    return matchStatus && matchQuery;
  });

  return (
    <AdminShell title="Pedidos" description="Todos los pedidos de la plataforma.">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar por código o ID de jugador"
          className="max-w-xs"
          aria-label="Buscar pedidos"
        />
        {FILTERS.map((item) => (
          <Button
            key={item}
            size="sm"
            variant={filter === item ? "default" : "outline"}
            className="capitalize"
            onClick={() => setFilter(item)}
          >
            {item}
          </Button>
        ))}
      </div>

      {orders.length === 0 ? (
        <EmptyState title="Sin pedidos" description="Ajusta los filtros de búsqueda." />
      ) : (
        <div className="surface-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Usuario</TableHead>
                <TableHead>Producto</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Transacción</TableHead>
                <TableHead>Fecha</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((order) => {
                const product = mockProducts.find((item) => item.id === order.product_id);
                const user = mockUsers.find((item) => item.id === order.user_id);
                return (
                  <TableRow key={order.id}>
                    <TableCell className="font-medium">#{order.code}</TableCell>
                    <TableCell>{user?.name ?? "—"}</TableCell>
                    <TableCell>{product?.name ?? "—"}</TableCell>
                    <TableCell>{formatCUP(order.total_amount)}</TableCell>
                    <TableCell>
                      <StatusBadge status={order.status} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {order.g2bulk_transaction_id ?? "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {formatDateTime(order.created_at)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </AdminShell>
  );
}
