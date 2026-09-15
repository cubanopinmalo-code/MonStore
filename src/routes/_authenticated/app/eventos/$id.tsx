import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  Clock,
  Copy,
  Globe2,
  Lock,
  Share2,
  Ticket,
  Trophy,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { UserShell } from "@/components/layout/UserShell";
import { StatusBadge } from "@/components/common/StatusBadge";
import { GameCover } from "@/components/common/GameCover";
import { EmptyState, CardListSkeleton } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import {
  useEvent,
  useEventsRealtime,
  useMySubscription,
  type EventRow,
} from "@/hooks/useEvents";
import { useProfile, useWallet } from "@/hooks/useAccount";
import {
  buildEventShareUrl,
  eventStage,
  eventStageLabel,
  formatCountdown,
  formatEventDate,
  formatLongCountdown,
  secondsUntil,
} from "@/lib/events";
import { formatCUP } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/app/eventos/$id")({
  head: () => ({
    meta: [
      { title: "Detalle del evento — MONSTORE" },
      {
        name: "description",
        content:
          "Consulta premio, participantes y horario del evento, e inscríbete con el ID de tu personaje.",
      },
      { property: "og:title", content: "Detalle del evento — MONSTORE" },
      {
        property: "og:description",
        content: "Premios, participantes y sala personalizada en MONSTORE.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: EventDetailPage,
});

function EventDetailPage() {
  const { id } = Route.useParams();
  const { data: event, isLoading } = useEvent(id);
  useEventsRealtime();

  if (isLoading) {
    return (
      <UserShell>
        <CardListSkeleton items={3} />
      </UserShell>
    );
  }

  if (!event) {
    return (
      <UserShell>
        <EmptyState
          title="Evento no encontrado"
          description="Es posible que el evento haya finalizado o fuera cancelado."
          action={
            <Button asChild variant="outline" size="sm">
              <Link to="/app/eventos">Ver eventos actuales</Link>
            </Button>
          }
        />
      </UserShell>
    );
  }

  return <EventDetail event={event} />;
}

function EventDetail({ event }: { event: EventRow }) {
  const queryClient = useQueryClient();
  const { data: subscription } = useMySubscription(event.id);
  const { data: wallet } = useWallet();
  const { data: profile } = useProfile();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [accountId, setAccountId] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [room, setRoom] = useState<{ id: string | null; password: string | null } | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const stage = eventStage(event.status);
  const balance = Number(wallet?.balance ?? 0);
  const confirmed = subscription?.payment_status === "pagado";
  const refunded = subscription?.payment_status === "reembolsado";
  const enoughBalance = balance >= event.entry_price;
  const full = event.participants >= event.max_participants;
  const open = stage === "inscripciones" && !full;

  const secondsToStart = secondsUntil(event.starts_at, now);
  const entrySecondsLeft = event.entry_closes_at ? secondsUntil(event.entry_closes_at, now) : 0;
  const windowOpen = stage === "activo" && entrySecondsLeft > 0;

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["event", event.id] });
    void queryClient.invalidateQueries({ queryKey: ["event-subscription"] });
    void queryClient.invalidateQueries({ queryKey: ["wallet"] });
    void queryClient.invalidateQueries({ queryKey: ["wallet-transactions"] });
    void queryClient.invalidateQueries({ queryKey: ["notifications"] });
  };

  const subscribe = useMutation({
    mutationFn: async (value: string) => {
      const { error } = await supabase.rpc("subscribe_event", {
        p_event: event.id,
        p_game_account_id: value,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      setDialogOpen(false);
      setAccountId("");
      toast.success("Te inscribiste. El dinero se cobra solo al comenzar el evento.");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const cancelSubscription = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("cancel_event_subscription", { p_event: event.id });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Cancelaste tu inscripción.");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const enterRoom = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("enter_event_room", { p_event: event.id });
      if (error) throw new Error(error.message);
      return data as unknown as { room_id: string | null; room_password: string | null };
    },
    onSuccess: (data) => {
      setRoom({ id: data.room_id, password: data.room_password });
      toast.success("Ya tienes los datos de la sala.");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const progress = Math.min(
    100,
    Math.round((event.participants / Math.max(event.min_participants, 1)) * 100),
  );

  async function handleShare() {
    const url = buildEventShareUrl(event.id, profile?.referral_code ?? "");
    const text = `Participa conmigo en ${event.name} · Premio: ${event.prize}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: event.name, text, url });
        return;
      } catch {
        // El usuario canceló: seguimos con la copia al portapapeles.
      }
    }
    try {
      await navigator.clipboard?.writeText(`${text} ${url}`);
      toast.success("Enlace del evento copiado", { description: url });
    } catch {
      toast.error("No se pudo copiar el enlace.");
    }
  }

  function handleSubscribe() {
    const value = accountId.trim();
    if (!/^\d{6,}$/.test(value)) {
      toast.error("Introduce un ID de personaje válido (solo números).");
      return;
    }
    subscribe.mutate(value);
  }

  const roomId = room?.id ?? null;
  const roomPassword = room?.password ?? null;

  return (
    <UserShell>
      <div className="mx-auto max-w-3xl space-y-5">
        <GameCover
          src={event.banner_url ?? event.games?.image_url ?? null}
          name={event.games?.name ?? event.name}
          className="aspect-video w-full rounded-xl"
        />

        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl font-bold">{event.name}</h1>
            <StatusBadge status={eventStageLabel(event.status)} />
          </div>
          <p className="text-sm text-muted-foreground">{event.description}</p>
          {stage === "inscripciones" && secondsToStart > 0 ? (
            <p className="text-sm font-semibold text-primary">
              Comienza en {formatLongCountdown(secondsToStart)}
            </p>
          ) : null}
          <Button variant="outline" className="w-full sm:w-auto" onClick={handleShare}>
            <Share2 className="size-4" aria-hidden="true" />
            Compartir evento
          </Button>
        </div>

        <section className="surface-card grid gap-3 p-5 sm:grid-cols-2">
          <Detail icon={<Trophy className="size-4" />} label="Premio" value={event.prize} />
          <Detail icon={<Globe2 className="size-4" />} label="Región" value={event.region} />
          <Detail
            icon={<Ticket className="size-4" />}
            label="Inscripción"
            value={formatCUP(event.entry_price)}
          />
          <Detail
            icon={<CalendarDays className="size-4" />}
            label="Fecha y hora"
            value={`${event.event_date ? formatEventDate(event.event_date) : "Por confirmar"} · ${event.event_time}`}
          />
          <Detail
            icon={<Users className="size-4" />}
            label="Participantes"
            value={`${event.participants}/${event.min_participants} (capacidad ${event.max_participants})`}
          />
          <Detail
            icon={<Clock className="size-4" />}
            label="Tipo de evento"
            value="Sala personalizada"
          />
          <div className="sm:col-span-2">
            <Progress value={progress} />
            <p className="mt-1 text-xs text-muted-foreground">
              Meta mínima: {event.min_participants} participantes. Si no se alcanza a la hora del
              evento, se cancela y nadie paga.
            </p>
          </div>
        </section>

        {stage === "activo" ? (
          <section className="surface-card space-y-3 p-5 glow-ring">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold">Evento activo</h2>
              <span className="text-sm font-semibold text-primary">
                ⏱️ {windowOpen ? formatCountdown(entrySecondsLeft) : "Tiempo agotado"}
              </span>
            </div>

            {!confirmed ? (
              <p className="text-sm text-muted-foreground">
                Solo pueden entrar las personas confirmadas al comenzar el evento.
                {refunded ? " Tu inscripción no se confirmó y te devolvimos el dinero." : ""}
              </p>
            ) : roomId || roomPassword ? (
              <div className="space-y-2">
                <RoomField label="ID de sala" value={roomId ?? "—"} />
                <RoomField label="Contraseña" value={roomPassword ?? "—"} />
                <p className="text-xs text-muted-foreground">
                  Entrada pagada ({formatCUP(Number(subscription?.charge_amount ?? event.entry_price))}).
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Tu entrada ya está pagada. Pide los datos de la sala para entrar.
                </p>
                <Button
                  className="w-full"
                  disabled={!windowOpen || enterRoom.isPending}
                  onClick={() => enterRoom.mutate()}
                >
                  <Lock className="size-4" aria-hidden="true" />
                  Ver datos de la sala
                </Button>
              </div>
            )}
          </section>
        ) : null}

        {stage === "finalizado" ? (
          <section className="surface-card space-y-2 p-5">
            <h2 className="text-base font-semibold">Resultado</h2>
            <p className="text-sm text-muted-foreground">
              Ganador: {event.winner_character_name ?? "Por publicar"}
            </p>
            {event.reward_note ? (
              <p className="text-sm text-muted-foreground">{event.reward_note}</p>
            ) : null}
          </section>
        ) : null}

        {stage === "cancelado" ? (
          <section className="surface-card space-y-2 p-5">
            <h2 className="text-base font-semibold">Evento cancelado</h2>
            <p className="text-sm text-muted-foreground">
              {event.cancel_reason || "El evento fue cancelado."} Si te habíamos cobrado, el dinero
              volvió a tu saldo.
            </p>
          </section>
        ) : null}

        <section className="surface-card space-y-3 p-5">
          {subscription && subscription.status !== "cancelado" ? (
            <>
              <p className="text-sm font-semibold text-success">✅ Ya estás inscrito</p>
              <p className="text-sm text-muted-foreground">
                ID de participación:{" "}
                <span className="font-mono">{subscription.game_account_id}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                Solo este ID tendrá derecho al premio. El pago de {formatCUP(event.entry_price)} se
                descuenta automáticamente cuando el evento comience.
              </p>
              {stage === "inscripciones" ? (
                <Button
                  variant="outline"
                  disabled={cancelSubscription.isPending}
                  onClick={() => cancelSubscription.mutate()}
                >
                  Cancelar mi inscripción
                </Button>
              ) : null}
            </>
          ) : full && stage === "inscripciones" ? (
            <p className="text-sm font-semibold text-destructive">🔴 Evento completo</p>
          ) : open ? (
            <>
              <p className="text-sm text-muted-foreground">
                Inscribirte no descuenta dinero ahora. Ten {formatCUP(event.entry_price)} en tu
                saldo cuando comience el evento. Saldo actual: {formatCUP(balance)}.
              </p>
              {!enoughBalance ? (
                <p className="text-xs text-destructive">
                  Saldo insuficiente.{" "}
                  <Link to="/app/wallet/depositar" className="underline">
                    Agregar fondos
                  </Link>
                </p>
              ) : null}
              <Button className="w-full" onClick={() => setDialogOpen(true)}>
                Inscribirme al evento
              </Button>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Las inscripciones para este evento ya están cerradas.
            </p>
          )}
        </section>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>ID del personaje</DialogTitle>
              <DialogDescription>
                Introduce el ID con el que entrarás a la sala. Solo ese ID tendrá derecho al premio.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="account-id">ID de cuenta ({event.games?.name ?? "juego"})</Label>
              <Input
                id="account-id"
                inputMode="numeric"
                placeholder="123456789"
                value={accountId}
                onChange={(fieldEvent) => setAccountId(fieldEvent.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Este identificador queda bloqueado y no puede repetirse en el mismo evento.
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSubscribe} disabled={subscribe.isPending}>
                Confirmar inscripción
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </UserShell>
  );
}

function Detail({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="space-y-1">
      <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
        <span className="text-primary">{icon}</span>
        {label}
      </p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}

function RoomField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate font-mono text-sm">{value}</p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Copiar ${label}`}
        onClick={() => {
          void navigator.clipboard?.writeText(value);
          toast.success(`${label} copiado`);
        }}
      >
        <Copy className="size-4" aria-hidden="true" />
      </Button>
    </div>
  );
}
