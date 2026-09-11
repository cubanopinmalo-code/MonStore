import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/layout/AdminShell";
import { StatCard } from "@/components/common/PageHeader";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { mockEvents, mockEventSubscriptions } from "@/data/mock/events";
import { mockGames } from "@/data/mock/games";
import {
  EVENT_STATUS_LABEL,
  PAYMENT_STATUS_LABEL,
  formatEventDate,
} from "@/lib/events";
import { formatCUP } from "@/lib/format";

export const Route = createFileRoute("/admin/eventos")({
  head: () => ({
    meta: [
      { title: "Eventos — Panel MONSTORE" },
      {
        name: "description",
        content: "Crea eventos, controla la meta de participantes y activa las salas.",
      },
    ],
  }),
  component: AdminEventsPage,
});

function AdminEventsPage() {
  const [selectedId, setSelectedId] = useState(mockEvents[0]?.id ?? "");
  const selected = mockEvents.find((event) => event.id === selectedId);
  const subscriptions = mockEventSubscriptions.filter(
    (item) => item.event_id === selectedId,
  );

  const active = mockEvents.filter((event) => event.status !== "finalizado").length;
  const goalReached = mockEvents.filter(
    (event) => event.participants_count >= event.min_participants,
  ).length;

  return (
    <AdminShell
      title="Eventos"
      description="Salas personalizadas: meta de participantes, inscripciones y activación de sala."
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Eventos activos" value={String(active)} />
        <StatCard label="Meta alcanzada" value={String(goalReached)} />
        <StatCard label="Inscripciones" value={String(mockEventSubscriptions.length)} />
        <StatCard
          label="Entradas pagadas"
          value={String(
            mockEventSubscriptions.filter((item) => item.payment_status === "paid").length,
          )}
        />
      </div>

      <section className="surface-card space-y-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Listado de eventos</h2>
          <Button
            size="sm"
            onClick={() => toast.info("La creación real de eventos llega en la Fase 2.")}
          >
            <Plus className="size-4" aria-hidden="true" />
            Crear evento
          </Button>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Evento</TableHead>
                <TableHead>Juego</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Participantes</TableHead>
                <TableHead>Inscripción</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mockEvents.map((event) => {
                const game = mockGames.find((item) => item.id === event.game_id);
                return (
                  <TableRow key={event.id}>
                    <TableCell className="font-medium">{event.name}</TableCell>
                    <TableCell>{game?.name ?? "—"}</TableCell>
                    <TableCell>
                      {formatEventDate(event.event_date)} · {event.event_time}
                    </TableCell>
                    <TableCell>
                      {event.participants_count}/{event.min_participants}
                      <span className="text-xs text-muted-foreground">
                        {" "}
                        (máx {event.max_participants})
                      </span>
                    </TableCell>
                    <TableCell>{formatCUP(event.entry_price)}</TableCell>
                    <TableCell>
                      <StatusBadge status={EVENT_STATUS_LABEL[event.status]} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedId(event.id)}
                      >
                        Gestionar
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </section>

      {selected ? (
        <section className="surface-card space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold">Sala de «{selected.name}»</h2>
            <StatusBadge status={EVENT_STATUS_LABEL[selected.status]} />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="room-id">ID de la sala</Label>
              <Input id="room-id" defaultValue={selected.room_id ?? ""} placeholder="FF-12345" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="room-pass">Contraseña</Label>
              <Input
                id="room-pass"
                defaultValue={selected.room_password ?? ""}
                placeholder="monstore25"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="room-time">Hora de activación</Label>
              <Input id="room-time" type="time" defaultValue={selected.event_time} />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => toast.success("Sala activada (simulado). Los inscritos serían notificados.")}>
              Activar sala
            </Button>
            <Button
              variant="outline"
              onClick={() => toast.info("Evento finalizado (simulado).")}
            >
              Finalizar evento
            </Button>
            <Button
              variant="outline"
              onClick={() => toast.info("Evento cancelado (simulado). Nadie fue cobrado.")}
            >
              Cancelar evento
            </Button>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Teléfono</TableHead>
                  <TableHead>ID de juego</TableHead>
                  <TableHead>Nombre G2Bulk</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Pago</TableHead>
                  <TableHead>Entrada</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subscriptions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-sm text-muted-foreground">
                      Todavía no hay inscripciones en este evento.
                    </TableCell>
                  </TableRow>
                ) : (
                  subscriptions.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.user_name}</TableCell>
                      <TableCell>{item.user_phone}</TableCell>
                      <TableCell className="font-mono text-xs">{item.game_account_id}</TableCell>
                      <TableCell>
                        {item.g2bulk_account_name ?? (
                          <span className="text-xs text-muted-foreground">Sin verificar</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          status={item.status === "no_asistio" ? "no asistió" : item.status}
                        />
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={PAYMENT_STATUS_LABEL[item.payment_status]} />
                      </TableCell>
                      <TableCell>{item.entered_at ? "Sí" : "No"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <p className="text-xs text-muted-foreground">
            El nombre de la cuenta se consultará a G2Bulk desde el servidor en la Fase 2; la
            clave del proveedor nunca llega al navegador.
          </p>
        </section>
      ) : null}
    </AdminShell>
  );
}
