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
import { useEvent, useMySubscription, type EventRow } from "@/hooks/useEvents";
import { useProfile, useWallet } from "@/hooks/useAccount";
import { EVENT_STATUS_LABEL, formatCountdown, formatEventDate, buildEventShareUrl } from "@/lib/events";
import { formatCUP } from "@/lib/format";
import type { EventStatus } from "@/types";

export const Route = createFileRoute("/_authenticated/app/eventos/$id")({
  head: () => ({
    meta: [
      { title: "Detalle del evento — MONSTORE" },
      {
        name: "description",
        content:
          "Consulta premio, participantes y horario del evento, y suscríbete con el ID de tu cuenta de juego.",
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
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [room, setRoom] = useState<{ id: string | null; password: string | null } | null>(null);

  const balance = Number(wallet?.balance ?? 0);
  const paid = subscription?.payment_status === "pagado";
  const enoughBalance = balance >= event.entry_price;
  const full = event.participants >= event.max_participants;
  const open =
    (event.status === "inscripciones_abiertas" || event.status === "meta_alcanzada") && !full;

  useEffect(() => {
    if (event.status !== "sala_activa" || !event.room_activated_at) {
      setSecondsLeft(null);
      return;
    }
    const end =
      new Date(event.room_activated_at).getTime() + event.entry_window_minutes * 60 * 1000;
    const tick = () => setSecondsLeft(Math.max(0, Math.floor((end - Date.now()) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [event.status, event.room_activated_at, event.entry_window_minutes]);

  const subscribe = useMutation({
    mutationFn: async (value: string) => {
      const { data, error } = await supabase.rpc("subscribe_event", {
        p_event: event.id,
        p_game_account_id: value,
      });
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      setDialogOpen(false);
      setAccountId("");
      toast.success("Te inscribiste en el evento.");
      void queryClient.invalidateQueries({ queryKey: ["event", event.id] });
      void queryClient.invalidateQueries({ queryKey: ["event-subscription", event.id] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const enterRoom = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("enter_event_room", { p_event: event.id });
      if (error) throw new Error(error.message);
      return data as { room_id: string | null; room_password: string | null; charged: boolean };
    },
    onSuccess: (data) => {
      setRoom({ id: data.room_id, password: data.room_password });
      toast.success(
        data.charged
          ? `Entrada confirmada. Se descontaron ${formatCUP(event.entry_price)}.`
          : "Ya tenías la entrada pagada.",
      );
      void queryClient.invalidateQueries({ queryKey: ["wallet"] });
      void queryClient.invalidateQueries({ queryKey: ["wallet-transactions"] });
      void queryClient.invalidateQueries({ queryKey: ["event-subscription", event.id] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const windowOpen = secondsLeft === null || secondsLeft > 0;
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
      toast.error("Introduce un ID de cuenta de juego válido (solo números).");
      return;
    }
    subscribe.mutate(value);
  }

  // Las credenciales de sala solo llegan desde enter_event_room().
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
            <StatusBadge
              status={EVENT_STATUS_LABEL[event.status as EventStatus] ?? event.status}
            />
          </div>
          <p className="text-sm text-muted-foreground">{event.description}</p>
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
              Meta mínima: {event.min_participants} participantes.
            </p>
          </div>
        </section>

        {event.status === "sala_activa" ? (
          <section className="surface-card space-y-3 p-5 glow-ring">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold">Sala activa</h2>
              <span className="text-sm font-semibold text-primary">
                ⏱️{" "}
                {secondsLeft === null
                  ? "--:--"
                  : windowOpen
                    ? formatCountdown(secondsLeft)
                    : "Tiempo agotado"}
              </span>
            </div>

            {!subscription ? (
              <p className="text-sm text-muted-foreground">
                Solo las personas inscritas pueden entrar a esta sala.
              </p>
            ) : roomId || roomPassword ? (
              <div className="space-y-2">
                <RoomField label="ID de sala" value={roomId ?? "—"} />
                <RoomField label="Contraseña" value={roomPassword ?? "—"} />
                <p className="text-xs text-muted-foreground">
                  Entrada pagada ({formatCUP(event.entry_price)}).
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  El precio se descuenta solo al confirmar tu entrada. Saldo actual:{" "}
                  {formatCUP(balance)}.
                </p>
                <Button
                  className="w-full"
                  disabled={!windowOpen || enterRoom.isPending || !enoughBalance}
                  onClick={() => enterRoom.mutate()}
                >
                  <Lock className="size-4" aria-hidden="true" />
                  Entrar a la sala — {formatCUP(event.entry_price)}
                </Button>
                {!enoughBalance ? (
                  <p className="text-xs text-destructive">
                    Saldo insuficiente.{" "}
                    <Link to="/app/wallet/depositar" className="underline">
                      Agregar fondos
                    </Link>
                  </p>
                ) : null}
              </div>
            )}
          </section>
        ) : null}

        <section className="surface-card space-y-3 p-5">
          {subscription ? (
            <>
              <p className="text-sm font-semibold text-success">✅ Ya estás inscrito</p>
              <p className="text-sm text-muted-foreground">
                ID de participación:{" "}
                <span className="font-mono">{subscription.game_account_id}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                Solo esta cuenta tendrá derecho al premio. Para cambiarla necesitas autorización
                del administrador.
              </p>
            </>
          ) : full ? (
            <p className="text-sm font-semibold text-destructive">🔴 Evento completo</p>
          ) : open ? (
            <>
              <p className="text-sm text-muted-foreground">
                Inscribirte no descuenta dinero. El pago ocurre solo al entrar a la sala.
              </p>
              <Button className="w-full" onClick={() => setDialogOpen(true)}>
                Suscribirme al evento
              </Button>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Las inscripciones para este evento no están disponibles.
            </p>
          )}
        </section>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>ID de la cuenta de juego</DialogTitle>
              <DialogDescription>
                Introduce el ID con el que entrarás a la sala. Solo ese ID tendrá derecho al
                premio.
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
