import { createFileRoute } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/layout/AdminShell";
import { StatCard } from "@/components/common/PageHeader";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { mockSyncStatus } from "@/data/mock/admin";
import { formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/admin/g2bulk")({
  head: () => ({
    meta: [
      { title: "G2Bulk — Panel MONSTORE" },
      { name: "description", content: "Estado de la integración con el proveedor de productos digitales." },
    ],
  }),
  component: AdminProviderPage,
});

function AdminProviderPage() {
  return (
    <AdminShell
      title="G2Bulk"
      description="Estado de la integración con el proveedor. Aún no está conectada."
    >
      <div className="surface-card flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold">Conexión con el proveedor</h2>
            <StatusBadge status={mockSyncStatus.connected ? "activo" : "pendiente"} />
          </div>
          <p className="text-sm text-muted-foreground">
            Última sincronización: {formatDateTime(mockSyncStatus.last_sync_at)}
          </p>
        </div>
        <Button onClick={() => toast.info("La sincronización real llega en la próxima fase.")}>
          Sincronizar ahora
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Juegos" value={String(mockSyncStatus.games_count)} />
        <StatCard label="Productos" value={String(mockSyncStatus.products_count)} />
        <StatCard label="Nuevos" value={String(mockSyncStatus.new_products)} />
        <StatCard label="Actualizados" value={String(mockSyncStatus.updated_products)} />
      </div>

      <section className="surface-card space-y-3 p-5">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-5 text-primary" aria-hidden="true" />
          <h2 className="text-base font-semibold">Seguridad de la clave</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          La clave del proveedor se guardará únicamente en el servidor. El navegador nunca
          la recibe ni llama al proveedor directamente.
        </p>
        <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Flujo previsto</p>
          <p className="mt-1">
            MONSTORE Web → Backend de MONSTORE → G2Bulk → respuesta guardada y mostrada al
            usuario.
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          Clave configurada: no (se añadirá como secreto del servidor en la Fase 2).
        </p>
      </section>
    </AdminShell>
  );
}
