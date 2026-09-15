import { useEffect, useMemo, useState } from "react";
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
import {
  useEvents,
  useEventSmsLog,
  useEventSubscriptions,
  useEventsRealtime,
} from "@/hooks/useEvents";
import { startEvent } from "@/lib/events.functions";
import {
  SUBSCRIPTION_PAYMENT_LABEL,
  SUBSCRIPTION_STATUS_LABEL,
  eventStage,
  eventStageLabel,
  formatEventDate,
} from "@/lib/events";
import { formatCUP } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/eventos")({
  head: () => ({
    meta: [
      { title: "Eventos — Panel MONSTORE" },
      {
        name: "description",
        content:
          "Crea eventos, guarda los datos de sala, controla inscritos y registra al ganador.",
      },
    ],
  }),
  component: AdminEventsPage,
});

const STAGE_FILTERS = [
  { key: "todos", label: "Todos" },
  { key: "inscripciones", label: "Inscripciones activas" },
  { key: "activo", label: "Evento activo" },
  { key: "iniciado", label: "Evento iniciado" },
  { key: "finalizado", label: "Evento finalizado" },
  { key: "cancelado", label: "Evento cancelado" },
] as const;

function AdminEventsPage() {
  const queryClient = useQueryClient();
  useEventsRealtime();
  const { data: events } = useEvents(true, true);
  const [selectedId, setSelectedId] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [filter, setFilter] = useState<(typeof STAGE_FILTERS)[number]["key"]>("todos");

  useEffect(() => {
    if (!selectedId && events && events[0]) setSelectedId(events[0].id);
  }, [events, selectedId]);

  const selected = (events ?? []).find((event) => event.id === selectedId) ?? null;
  const { data: subscriptions } = useEventSubscriptions(selectedId || null);
  const { data: smsLog } = useEventSmsLog(selectedId || null);

  const [roomId, setRoomId] = useState("");
  const [roomPassword, setRoomPassword] = useState("");
  const [winnerId, setWinnerId] = useState("");
  const [rewardNote, setRewardNote] = useState("");
  const [rewardAmount, setRewardAmount] = useState("");
  const [cancelReason, setCancelReason] = useState("");

  useEffect(() => {
    setRoomId(selected?.room_id ?? "");
    setRoomPassword(selected?.room_password ?? "");
    setWinnerId("");
    setRewardNote("");
    setRewardAmount("");
    setCancelReason("");
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
    void queryClient.invalidateQueries({ queryKey: ["event-sms-log"] });
    void queryClient.invalidateQueries({ queryKey: ["event-results"] });
  };

  const saveRoom = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("admin_set_event_room", {
        p_event: selectedId,
        p_room_id: roomId.trim(),
        p_room_password: roomPassword.trim(),
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Datos de sala guardados");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const start = useMutation({
    mutationFn: async () => startEvent({ data: { eventId: selectedId } }),
    onSuccess: (result) => {
      if (result.already) toast.success("El evento ya estaba iniciado; no se reenvió nada.");
      else
        toast.success(
          `Evento iniciado. Mensajes enviados: ${result.sms_sent}` +
            (result.sms_failed ? ` · fallidos: ${result.sms_failed}` : ""),
        );
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const finish = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("finish_event", {
        p_event: selectedId,
        p_game_account_id: winnerId.trim(),
        p_character_name: "",
        p_reward_note: rewardNote.trim(),
        p_reward_amount: rewardAmount ? Number(rewardAmount) : 0,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Evento finalizado y resultado publicado");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deliverPrize = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("deliver_event_prize", { p_event: selectedId });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Premio registrado como entregado");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const cancel = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("cancel_event", {
        p_event: selectedId,
        p_reason: cancelReason.trim(),
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Evento cancelado y devoluciones aplicadas");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rows = events ?? [];
  const visible = useMemo(
    () => (filter === "todos" ? rows : rows.filter((event) => eventStage(event.status) === filter)),
    [rows, filter],
  );
  const subs = subscriptions ?? [];
  const confirmed = subs.filter((item) => item.payment_status === "pagado").length;
  const stage = selected ? eventStage(selected.status) : null;

  return (
    <AdminShell
      title="Eventos"
      description="Los eventos se activan y cobran solos a la hora exacta. Aquí preparas la sala, sigues a los inscritos y registras al ganador."
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Eventos" value={String(rows.length)} />
        <StatCard
          label="Con inscripciones activas"
          value={String(rows.filter((event) => eventStage(event.status) === "inscripciones").length)}
        />
        <StatCard
          label="En curso"
          value={String(
            rows.filter((event) => ["activo", "iniciado"].includes(eventStage(event.status))).length,
          )}
        />
        <StatCard label="Confirmados del evento" value={`${confirmed}/${subs.length}`} />
      </div>

      <section className="surface-card space-y-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Listado de eventos</h2>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" aria-hidden="true" />
            Crear evento
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {STAGE_FILTERS.map((item) => (
            <Button
              key={item.key}
              size="sm"
              variant={filter === item.key ? "default" : "outline"}
              onClick={() => setFilter(item.key)}
            >
              {item.label}
            </Button>
          ))}
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
              {visible.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-sm text-muted-foreground">
                    No hay eventos en esta categoría.
                  </TableCell>
                </TableRow>
              ) : (
                visible.map((event) => (
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
                      <StatusBadge status={eventStageLabel(event.status)} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" onClick={() => setSelectedId(event.id)}>
                        Gestionar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      {selected ? (
        <section className="surface-card space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold">«{selected.name}»</h2>
            <StatusBadge status={eventStageLabel(selected.status)} />
          </div>

          <p className="text-sm text-muted-foreground">
            {stage === "inscripciones"
              ? "El evento se activará y cobrará automáticamente a la hora exacta, si se cumple la meta y la sala está lista."
              : stage === "activo"
                ? "Ya se cobró a los confirmados y la sala está abierta. Puedes marcar el evento como iniciado."
                : stage === "iniciado"
                  ? "El evento está en marcha. Cuando termine, registra al ganador."
                  : stage === "finalizado"
                    ? "Evento finalizado. El resultado ya es visible para todos."
                    : "Evento cancelado; las devoluciones se aplicaron automáticamente."}
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="room-id">ID de la sala</Label>
              <Input
                id="room-id"
                value={roomId}
                onChange={(event) => setRoomId(event.target.value)}
                placeholder="FF-12345"
                disabled={Boolean(selected.room_locked_at)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="room-pass">Contraseña</Label>
              <Input
                id="room-pass"
                value={roomPassword}
                onChange={(event) => setRoomPassword(event.target.value)}
                placeholder="monstore25"
                disabled={Boolean(selected.room_locked_at)}
              />
            </div>
          </div>
          {selected.room_locked_at ? (
            <p className="text-xs text-muted-foreground">
              Los datos de sala quedaron bloqueados al activarse el evento.
            </p>
          ) : (
            <Button
              disabled={saveRoom.isPending}
              onClick={() => {
                if (!roomId.trim() || !roomPassword.trim()) {
                  toast.error("Escribe el ID y la contraseña de la sala.");
                  return;
                }
                saveRoom.mutate();
              }}
            >
              Guardar datos de sala
            </Button>
          )}

          <div className="flex flex-wrap gap-2 border-t border-border pt-3">
            <Button disabled={stage !== "activo" || start.isPending} onClick={() => start.mutate()}>
              Marcar evento iniciado
            </Button>
            <Button
              variant="outline"
              disabled={stage !== "finalizado" || deliverPrize.isPending}
              onClick={() => deliverPrize.mutate()}
            >
              Registrar premio entregado
            </Button>
          </div>

          {stage === "iniciado" ? (
            <div className="space-y-3 rounded-lg border border-border p-4">
              <h3 className="text-sm font-semibold">Finalizar y registrar ganador</h3>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="winner">ID del personaje ganador</Label>
                  <Input
                    id="winner"
                    value={winnerId}
                    onChange={(event) => setWinnerId(event.target.value)}
                    placeholder="123456789"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="reward-note">Detalle del premio</Label>
                  <Input
                    id="reward-note"
                    value={rewardNote}
                    onChange={(event) => setRewardNote(event.target.value)}
                    placeholder="Diamantes entregados"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="reward-amount">Premio en saldo (opcional)</Label>
                  <Input
                    id="reward-amount"
                    inputMode="numeric"
                    value={rewardAmount}
                    onChange={(event) =>
                      setRewardAmount(event.target.value.replace(/[^\d.]/g, ""))
                    }
                    placeholder="0"
                  />
                </div>
              </div>
              <Button
                disabled={finish.isPending}
                onClick={() => {
                  if (!winnerId.trim()) {
                    toast.error("Escribe el ID del personaje ganador.");
                    return;
                  }
                  finish.mutate();
                }}
              >
                Finalizar evento
              </Button>
            </div>
          ) : null}

          {stage === "inscripciones" || stage === "activo" ? (
            <div className="space-y-2 rounded-lg border border-destructive/40 p-4">
              <Label htmlFor="cancel-reason">Motivo de la cancelación</Label>
              <Textarea
                id="cancel-reason"
                value={cancelReason}
                onChange={(event) => setCancelReason(event.target.value)}
                placeholder="Explica por qué se cancela el evento"
              />
              <Button
                variant="outline"
                disabled={cancel.isPending}
                onClick={() => {
                  if (!cancelReason.trim()) {
                    toast.error("Escribe el motivo de la cancelación.");
                    return;
                  }
                  cancel.mutate();
                }}
              >
                Cancelar evento y devolver el dinero
              </Button>
            </div>
          ) : null}

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Participante</TableHead>
                  <TableHead>Teléfono</TableHead>
                  <TableHead>ID de personaje</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Pago</TableHead>
                  <TableHead>Entró</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-sm text-muted-foreground">
                      Todavía no hay inscripciones en este evento.
                    </TableCell>
                  </TableRow>
                ) : (
                  subs.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.profiles?.name ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {item.profiles?.phone ?? "—"}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{item.game_account_id}</TableCell>
                      <TableCell>
                        <StatusBadge
                          status={SUBSCRIPTION_STATUS_LABEL[item.status] ?? item.status}
                        />
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          status={
                            SUBSCRIPTION_PAYMENT_LABEL[item.payment_status] ?? item.payment_status
                          }
                        />
                      </TableCell>
                      <TableCell>{item.entered_at ? "Sí" : "No"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {smsLog && smsLog.length > 0 ? (
            <div className="space-y-1 rounded-lg border border-border p-4 text-xs text-muted-foreground">
              <p className="text-sm font-semibold text-foreground">Mensajes de inicio</p>
              {smsLog.map((item) => (
                <p key={item.id}>
                  {item.phone} · {item.status}
                  {item.error_message ? ` · ${item.error_message}` : ""}
                </p>
              ))}
            </div>
          ) : null}
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
      const { error } = await supabase.rpc("admin_create_event", {
        p_payload: {
          name: form.name.trim(),
          game_id: form.game_id || null,
          prize: form.prize.trim(),
          region: form.region.trim(),
          min_participants: Number(form.min_participants) || 1,
          max_participants: Number(form.max_participants) || 1,
          event_date: form.event_date || null,
          event_time: form.event_time,
          entry_price: Number(form.entry_price) || 0,
          description: form.description.trim(),
        },
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
              if (!form.event_date) {
                toast.error("Elige la fecha del evento.");
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
