import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/layout/AdminShell";
import { StatCard } from "@/components/common/PageHeader";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useEvents, useEventSubscriptions } from "@/hooks/useEvents";
import { EVENT_STATUS_LABEL, formatEventDate } from "@/lib/events";
import { formatCUP } from "@/lib/format";
import type { EventStatus } from "@/types";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/admin/eventos")({
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
  const queryClient = useQueryClient();
  const { data: events } = useEvents(true);
  const [selectedId, setSelectedId] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    if (!selectedId && events && events[0]) setSelectedId(events[0].id);
  }, [events, selectedId]);

  const selected = (events ?? []).find((event) => event.id === selectedId) ?? null;
  const { data: subscriptions } = useEventSubscriptions(selectedId || null);

  const [roomId, setRoomId] = useState("");
  const [roomPassword, setRoomPassword] = useState("");

  useEffect(() => {
    setRoomId(selected?.room_id ?? "");
    setRoomPassword(selected?.room_password ?? "");
  }, [selected?.id, selected?.room_id, selected?.room_password]);

  const { data: games } = useQuery({
    queryKey: ["admin-games-select"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("games")
        .select("id, name")
        .eq("active", true)
        .order("name")
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["events"] });
    void queryClient.invalidateQueries({ queryKey: ["event-subscriptions-admin"] });
  };

  const updateEvent = useMutation({
    mutationFn: async (patch: Partial<Database["public"]["Tables"]["events"]["Update"]>) => {
      const { error } = await supabase.from("events").update(patch).eq("id", selectedId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Evento actualizado");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rows = events ?? [];
  const active = rows.filter((event) => event.status !== "finalizado").length;
  const goalReached = rows.filter((event) => event.participants >= event.min_participants).length;
  const subs = subscriptions ?? [];

  return (
    <AdminShell
      title="Eventos"
      description="Salas personalizadas: meta de participantes, inscripciones y activación de sala."
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Eventos" value={String(rows.length)} />
        <StatCard label="Eventos activos" value={String(active)} />
        <StatCard label="Meta alcanzada" value={String(goalReached)} />
        <StatCard label="Inscripciones del evento" value={String(subs.length)} />
      </div>

      <section className="surface-card space-y-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Listado de eventos</h2>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
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
              {rows.map((event) => (
                <TableRow key={event.id}>
                  <TableCell className="font-medium">{event.name}</TableCell>
                  <TableCell>{event.games?.name ?? "—"}</TableCell>
                  <TableCell>
                    {event.event_date ? formatEventDate(event.event_date) : "Por confirmar"} ·{" "}
                    {event.event_time}
                  </TableCell>
                  <TableCell>
                    {event.participants}/{event.min_participants}
                    <span className="text-xs text-muted-foreground">
                      {" "}
                      (máx {event.max_participants})
                    </span>
                  </TableCell>
                  <TableCell>{formatCUP(event.entry_price)}</TableCell>
                  <TableCell>
                    <StatusBadge
                      status={EVENT_STATUS_LABEL[event.status as EventStatus] ?? event.status}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" onClick={() => setSelectedId(event.id)}>
                      Gestionar
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      {selected ? (
        <section className="surface-card space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold">Sala de «{selected.name}»</h2>
            <StatusBadge
              status={EVENT_STATUS_LABEL[selected.status as EventStatus] ?? selected.status}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="room-id">ID de la sala</Label>
              <Input
                id="room-id"
                value={roomId}
                onChange={(event) => setRoomId(event.target.value)}
                placeholder="FF-12345"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="room-pass">Contraseña</Label>
              <Input
                id="room-pass"
                value={roomPassword}
                onChange={(event) => setRoomPassword(event.target.value)}
                placeholder="monstore25"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="estado">Estado</Label>
              <Select
                value={selected.status}
                onValueChange={(value) =>
                  updateEvent.mutate({ status: value as EventStatus })
                }
              >
                <SelectTrigger id="estado">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(EVENT_STATUS_LABEL).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              disabled={updateEvent.isPending}
              onClick={() => {
                if (!roomId.trim() || !roomPassword.trim()) {
                  toast.error("Escribe el ID y la contraseña de la sala.");
                  return;
                }
                updateEvent.mutate({
                  room_id: roomId.trim(),
                  room_password: roomPassword.trim(),
                  room_activated_at: new Date().toISOString(),
                  status: "sala_activa",
                });
              }}
            >
              Activar sala
            </Button>
            <Button
              variant="outline"
              disabled={updateEvent.isPending}
              onClick={() =>
                updateEvent.mutate({
                  status: "finalizado",
                  finished_at: new Date().toISOString(),
                })
              }
            >
              Finalizar evento
            </Button>
            <Button
              variant="outline"
              disabled={updateEvent.isPending}
              onClick={() => updateEvent.mutate({ status: "cancelado" })}
            >
              Cancelar evento
            </Button>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID de juego</TableHead>
                  <TableHead>Cuenta verificada</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Pago</TableHead>
                  <TableHead>Entrada</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-sm text-muted-foreground">
                      Todavía no hay inscripciones en este evento.
                    </TableCell>
                  </TableRow>
                ) : (
                  subs.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-mono text-xs">{item.game_account_id}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {(item as { g2bulk_account_name?: string | null }).g2bulk_account_name ??
                          "Sin verificar"}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={item.status} />
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={item.payment_status} />
                      </TableCell>
                      <TableCell>{item.entered_at ? "Sí" : "No"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </section>
      ) : null}

      <CreateEventDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        games={games ?? []}
        onCreated={refresh}
      />
    </AdminShell>
  );
}

function CreateEventDialog({
  open,
  onOpenChange,
  games,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  games: { id: string; name: string }[];
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    name: "",
    game_id: "",
    prize: "",
    region: "LATAM",
    min_participants: "10",
    max_participants: "48",
    event_date: "",
    event_time: "20:00",
    entry_price: "100",
    description: "",
  });

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("events").insert({
        name: form.name.trim(),
        game_id: form.game_id || null,
        event_type: "sala_personalizada",
        prize: form.prize.trim(),
        region: form.region.trim(),
        min_participants: Number(form.min_participants) || 1,
        max_participants: Number(form.max_participants) || 1,
        event_date: form.event_date || null,
        event_time: form.event_time,
        entry_price: Number(form.entry_price) || 0,
        currency: "CUP",
        status: "inscripciones_abiertas",
        description: form.description.trim(),
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Evento creado");
      onOpenChange(false);
      onCreated();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Crear evento</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nombre" id="ev-name">
            <Input
              id="ev-name"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </Field>
          <Field label="Juego" id="ev-game">
            <Select
              value={form.game_id}
              onValueChange={(value) => setForm({ ...form, game_id: value })}
            >
              <SelectTrigger id="ev-game">
                <SelectValue placeholder="Elige el juego" />
              </SelectTrigger>
              <SelectContent>
                {games.map((game) => (
                  <SelectItem key={game.id} value={game.id}>
                    {game.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Premio" id="ev-prize">
            <Input
              id="ev-prize"
              value={form.prize}
              onChange={(event) => setForm({ ...form, prize: event.target.value })}
            />
          </Field>
          <Field label="Región" id="ev-region">
            <Input
              id="ev-region"
              value={form.region}
              onChange={(event) => setForm({ ...form, region: event.target.value })}
            />
          </Field>
          <Field label="Mínimo de participantes" id="ev-min">
            <Input
              id="ev-min"
              inputMode="numeric"
              value={form.min_participants}
              onChange={(event) =>
                setForm({ ...form, min_participants: event.target.value.replace(/\D/g, "") })
              }
            />
          </Field>
          <Field label="Capacidad máxima" id="ev-max">
            <Input
              id="ev-max"
              inputMode="numeric"
              value={form.max_participants}
              onChange={(event) =>
                setForm({ ...form, max_participants: event.target.value.replace(/\D/g, "") })
              }
            />
          </Field>
          <Field label="Fecha" id="ev-date">
            <Input
              id="ev-date"
              type="date"
              value={form.event_date}
              onChange={(event) => setForm({ ...form, event_date: event.target.value })}
            />
          </Field>
          <Field label="Hora" id="ev-time">
            <Input
              id="ev-time"
              type="time"
              value={form.event_time}
              onChange={(event) => setForm({ ...form, event_time: event.target.value })}
            />
          </Field>
          <Field label="Precio de entrada (CUP)" id="ev-price">
            <Input
              id="ev-price"
              inputMode="numeric"
              value={form.entry_price}
              onChange={(event) =>
                setForm({ ...form, entry_price: event.target.value.replace(/\D/g, "") })
              }
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Descripción" id="ev-desc">
              <Textarea
                id="ev-desc"
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
              />
            </Field>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={create.isPending}
            onClick={() => {
              if (!form.name.trim() || !form.prize.trim()) {
                toast.error("Completa el nombre y el premio del evento.");
                return;
              }
              create.mutate();
            }}
          >
            Crear evento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  id,
  children,
}: {
  label: string;
  id: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
