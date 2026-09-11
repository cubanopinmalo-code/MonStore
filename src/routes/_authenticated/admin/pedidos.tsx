import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
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
import { supabase } from "@/integrations/supabase/client";
import { formatBaseCUP, formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/pedidos")({
  head: () => ({
    meta: [
      { title: "Pedidos — Panel MONSTORE" },
      { name: "description", content: "Gestión y seguimiento de todos los pedidos." },
      { property: "og:title", content: "Pedidos — Panel MONSTORE" },
      {
        property: "og:description",
        content: "Seguimiento de todos los pedidos de los clientes de MONSTORE.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminOrdersPage,
});

const FILTERS = [
  "todos",
  "pendiente",
  "procesando",
  "completado",
  "error",
  "reembolsado",
] as const;

function useAdminOrders() {
  return useQuery({
    queryKey: ["admin-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*, products(name), games(name)")
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
      return rows.map((row) => ({ ...row, user_name: names.get(row.user_id) ?? "Cliente" }));
    },
  });
}

function AdminOrdersPage() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("todos");
  const [query, setQuery] = useState("");
  const { data, isLoading } = useAdminOrders();

  const orders = (data ?? []).filter((order) => {
    const matchStatus = filter === "todos" || order.status === filter;
    const matchQuery =
      query.trim() === "" ||
      order.code.toLowerCase().includes(query.toLowerCase()) ||
      (order.player_id ?? "").includes(query) ||
      order.user_name.toLowerCase().includes(query.toLowerCase());
    return matchStatus && matchQuery;
  });

  return (
    <AdminShell title="Pedidos" description="Todos los pedidos de la plataforma.">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar por código, cliente o ID de jugador"
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

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando pedidos…</p>
      ) : orders.length === 0 ? (
        <EmptyState title="Sin pedidos" description="Ajusta los filtros de búsqueda." />
      ) : (
        <div className="surface-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Producto</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Transacción</TableHead>
                <TableHead>Fecha</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="font-medium">#{order.code}</TableCell>
                  <TableCell>{order.user_name}</TableCell>
                  <TableCell>{order.products?.name ?? order.games?.name ?? "—"}</TableCell>
                  <TableCell>{formatBaseCUP(Number(order.total_amount))}</TableCell>
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
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </AdminShell>
  );
}
