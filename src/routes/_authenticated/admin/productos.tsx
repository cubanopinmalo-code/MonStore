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
import { mockProducts } from "@/data/mock/products";
import { mockGames } from "@/data/mock/games";
import { formatCUP, marginPct } from "@/lib/format";

export const Route = createFileRoute("/admin/productos")({
  head: () => ({
    meta: [
      { title: "Productos — Panel MONSTORE" },
      { name: "description", content: "Ofertas, costos del proveedor, precios y márgenes." },
    ],
  }),
  component: AdminProductsPage,
});

function AdminProductsPage() {
  return (
    <AdminShell title="Productos" description="Costos, precios de venta y margen por oferta.">
      <div className="surface-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Producto</TableHead>
              <TableHead>Juego</TableHead>
              <TableHead>Entrega</TableHead>
              <TableHead>Costo</TableHead>
              <TableHead>Venta</TableHead>
              <TableHead>Margen</TableHead>
              <TableHead>Disponibilidad</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {mockProducts.map((product) => {
              const game = mockGames.find((item) => item.id === product.game_id);
              return (
                <TableRow key={product.id}>
                  <TableCell className="font-medium">
                    {product.name}
                    <span className="block text-xs text-muted-foreground">
                      {product.g2bulk_product_id}
                    </span>
                  </TableCell>
                  <TableCell>{game?.name ?? "—"}</TableCell>
                  <TableCell className="text-xs">
                    {product.delivery_method === "via_id" ? "Vía ID" : "Vía cuenta"}
                  </TableCell>
                  <TableCell>{formatCUP(product.g2bulk_cost)}</TableCell>
                  <TableCell>{formatCUP(product.sale_price)}</TableCell>
                  <TableCell className="text-primary">
                    {marginPct(product.g2bulk_cost, product.sale_price)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={product.available ? "disponible" : "no disponible"} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" disabled>
                      Editar precio
                    </Button>
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
