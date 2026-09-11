import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { UserShell } from "@/components/layout/UserShell";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { mockNotifications } from "@/data/mock/account";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/notificaciones")({
  head: () => ({
    meta: [
      { title: "Notificaciones — MONSTORE" },
      { name: "description", content: "Avisos de pedidos, depósitos, retiros y publicaciones." },
    ],
  }),
  component: NotificationsPage,
});

const TONE: Record<string, string> = {
  pedido_completado: "bg-success",
  deposito_aprobado: "bg-success",
  retiro_aprobado: "bg-success",
  publicacion_aprobada: "bg-success",
  pedido_error: "bg-destructive",
  deposito_rechazado: "bg-destructive",
  retiro_rechazado: "bg-destructive",
  publicacion_rechazada: "bg-destructive",
};

function NotificationsPage() {
  const [items, setItems] = useState(mockNotifications);
  const unread = items.filter((item) => !item.read).length;

  return (
    <UserShell>
      <div className="space-y-6">
        <PageHeader
          title="Notificaciones"
          description={unread > 0 ? `${unread} sin leer` : "Todo al día"}
          action={
            unread > 0 ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setItems(items.map((item) => ({ ...item, read: true })))}
              >
                Marcar todas como leídas
              </Button>
            ) : null
          }
        />

        {items.length === 0 ? (
          <EmptyState title="No tienes notificaciones" />
        ) : (
          <div className="grid gap-2">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() =>
                  setItems((prev) =>
                    prev.map((n) => (n.id === item.id ? { ...n, read: true } : n)),
                  )
                }
                className={cn(
                  "surface-card flex gap-3 p-4 text-left",
                  !item.read && "border-primary/40",
                )}
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Bell className="size-4" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn("size-1.5 rounded-full", TONE[item.type] ?? "bg-muted-foreground")}
                      aria-hidden="true"
                    />
                    <p className="text-sm font-semibold">{item.title}</p>
                    {!item.read ? (
                      <span className="ml-auto text-[11px] font-medium text-primary">
                        No leída
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{item.message}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatDateTime(item.created_at)}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </UserShell>
  );
}
