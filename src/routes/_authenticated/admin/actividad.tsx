import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AdminShell } from "@/components/layout/AdminShell";
import { StatusBadge } from "@/components/common/StatusBadge";
import { EmptyState } from "@/components/common/states";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

export const Route = createFileRoute("/_authenticated/admin/actividad")({
  head: () => ({
    meta: [
      { title: "Actividad global — Panel MONSTORE" },
      {
        name: "description",
        content:
          "Historial de compras, solicitudes de fondos y referidos de todos los clientes de MONSTORE.",
      },
      { property: "og:title", content: "Actividad global — Panel MONSTORE" },
      {
        property: "og:description",
        content: "Compras, fondos y referidos de todos los clientes en un solo lugar.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminActivityPage,
});

async function loadProfileNames(ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))];
  const names = new Map<string, string>();
  if (unique.length === 0) return names;
  const { data } = await supabase.from("profiles").select("id, name, phone").in("id", unique);
  for (const profile of data ?? []) {
    names.set(profile.id, profile.name || profile.phone || "Cliente");
  }
  return names;
}

function useAllOrders() {
  return useQuery({
    queryKey: ["admin-all-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*, products(name), games(name)")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      const rows = data ?? [];
      const names = await loadProfileNames(rows.map((row) => row.user_id));
      return rows.map((row) => ({ ...row, user_name: names.get(row.user_id) ?? "Cliente" }));
    },
  });
}

function useAllFundRequests() {
  return useQuery({
    queryKey: ["admin-all-fund-requests"],
    queryFn: async () => {
      const [deposits, withdrawals] = await Promise.all([
        supabase.from("deposits").select("*").order("created_at", { ascending: false }).limit(200),
        supabase
          .from("withdrawals")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(200),
      ]);
      if (deposits.error) throw deposits.error;
      if (withdrawals.error) throw withdrawals.error;

      const rows = [
        ...(deposits.data ?? []).map((row) => ({
          id: row.id,
          kind: "Depósito" as const,
          user_id: row.user_id,
          amount: Number(row.amount),
          net: Number(row.credited_amount),
          method: row.payment_method,
          status: row.status,
          note: row.proof_image_url ? "Con captura" : "Sin captura de pantalla",
          created_at: row.created_at,
        })),
        ...(withdrawals.data ?? []).map((row) => ({
          id: row.id,
          kind: "Retiro" as const,
          user_id: row.user_id,
          amount: Number(row.amount),
          net: Number(row.net_amount),
          method: row.payment_method,
          status: row.status,
          note: row.payment_destination,
          created_at: row.created_at,
        })),
      ].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

      const names = await loadProfileNames(rows.map((row) => row.user_id));
      return rows.map((row) => ({ ...row, user_name: names.get(row.user_id) ?? "Cliente" }));
    },
  });
}

function useAllReferrals() {
  return useQuery({
    queryKey: ["admin-all-referrals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("referrals")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      const rows = data ?? [];
      const names = await loadProfileNames(
        rows.flatMap((row) => [row.referrer_user_id, row.referred_user_id]),
      );
      return rows.map((row) => ({
        ...row,
        referrer_name: names.get(row.referrer_user_id) ?? "Cliente",
        referred_name: names.get(row.referred_user_id) ?? "Cliente",
      }));
    },
  });
}

function AdminActivityPage() {
  const orders = useAllOrders();
  const funds = useAllFundRequests();
  const referrals = useAllReferrals();

  return (
    <AdminShell
      title="Actividad global"
      description="Compras, solicitudes de fondos y referidos de todos los clientes."
    >
      <Tabs defaultValue="compras">
        <TabsList>
          <TabsTrigger value="compras">Compras</TabsTrigger>
          <TabsTrigger value="fondos">Fondos</TabsTrigger>
          <TabsTrigger value="referidos">Referidos</TabsTrigger>
        </TabsList>

        <TabsContent value="compras" className="mt-4">
          {orders.isLoading ? (
            <p className="text-sm text-muted-foreground">Cargando compras…</p>
          ) : (orders.data ?? []).length === 0 ? (
            <EmptyState title="Sin compras" description="Todavía no hay compras registradas." />
          ) : (
            <div className="surface-card overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Producto</TableHead>
                    <TableHead>Juego</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Fecha</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(orders.data ?? []).map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="font-medium">#{order.code}</TableCell>
                      <TableCell>{order.user_name}</TableCell>
                      <TableCell>{order.products?.name ?? "—"}</TableCell>
                      <TableCell>{order.games?.name ?? "—"}</TableCell>
                      <TableCell>{formatBaseCUP(Number(order.total_amount))}</TableCell>
                      <TableCell>
                        <StatusBadge status={order.status} />
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
        </TabsContent>

        <TabsContent value="fondos" className="mt-4">
          {funds.isLoading ? (
            <p className="text-sm text-muted-foreground">Cargando solicitudes…</p>
          ) : (funds.data ?? []).length === 0 ? (
            <EmptyState
              title="Sin solicitudes"
              description="Todavía no hay solicitudes de fondos."
            />
          ) : (
            <div className="surface-card overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Método</TableHead>
                    <TableHead>Importe</TableHead>
                    <TableHead>Neto</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Detalle</TableHead>
                    <TableHead>Fecha</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(funds.data ?? []).map((row) => (
                    <TableRow key={`${row.kind}-${row.id}`}>
                      <TableCell className="font-medium">{row.kind}</TableCell>
                      <TableCell>{row.user_name}</TableCell>
                      <TableCell className="capitalize">
                        {row.method.replace("_", " ")}
                      </TableCell>
                      <TableCell>{formatBaseCUP(row.amount)}</TableCell>
                      <TableCell>{formatBaseCUP(row.net)}</TableCell>
                      <TableCell>
                        <StatusBadge status={row.status} />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{row.note}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {formatDateTime(row.created_at)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="referidos" className="mt-4">
          {referrals.isLoading ? (
            <p className="text-sm text-muted-foreground">Cargando referidos…</p>
          ) : (referrals.data ?? []).length === 0 ? (
            <EmptyState title="Sin referidos" description="Todavía no hay invitaciones." />
          ) : (
            <div className="surface-card overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invitó</TableHead>
                    <TableHead>Invitado</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Recompensa</TableHead>
                    <TableHead>Fecha</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(referrals.data ?? []).map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{row.referrer_name}</TableCell>
                      <TableCell>{row.referred_name}</TableCell>
                      <TableCell>
                        <StatusBadge status={row.status} />
                      </TableCell>
                      <TableCell>{formatBaseCUP(Number(row.reward_amount))}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {formatDateTime(row.created_at)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </AdminShell>
  );
}
