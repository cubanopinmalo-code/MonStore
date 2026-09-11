import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
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
import { EmptyState } from "@/components/common/states";
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
import { mockEvents, mockEventSubscriptions } from "@/data/mock/events";
import { mockGames } from "@/data/mock/games";
import { mockProfile } from "@/data/mock/account";
import { mockWallet } from "@/data/mock/wallet";
import {
  EVENT_STATUS_LABEL,
  formatCountdown,
  formatEventDate,
  buildEventShareUrl,
  goalProgress,
  isFull,
  isSubscriptionOpen,
} from "@/lib/events";
import { formatCUP } from "@/lib/format";
import type { GameEvent } from "@/types";

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

const CURRENT_USER_ID = "us_001";

function EventDetailPage() {
  const { id } = Route.useParams();
  const event = mockEvents.find((item) => item.id === id);

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

function EventDetail({ event }: { event: GameEvent }) {
  const game = mockGames.find((item) => item.id === event.game_id);
  const existing = mockEventSubscriptions.find(
    (item) => item.event_id === event.id && item.user_id === CURRENT_USER_ID,
  );

  const [dialogOpen, setDialogOpen] = useState(false);
  const [accountId, setAccountId] = useState("");
  const [subscribedId, setSubscribedId] = useState<string | null>(
    existing?.game_account_id ?? null,
  );
  const [paid, setPaid] = useState(existing?.payment_status === "paid");
  const [processing, setProcessing] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    if (event.status !== "sala_activa") return;
    // Prototipo: la ventana de entrada se cuenta desde que se abre la pantalla.
    const total = event.entry_window_minutes * 60;
    const start = Date.now();
    setSecondsLeft(total);
    const timer = setInterval(() => {
      const left = total - Math.floor((Date.now() - start) / 1000);
      setSecondsLeft(left > 0 ? left : 0);
    }, 1000);
    return () => clearInterval(timer);
  }, [event]);

  const participants = `${event.participants_count}/${event.min_participants}`;
  const balance = mockWallet.balance;
  const enoughBalance = balance >= event.entry_price;
  const windowOpen = secondsLeft === null || secondsLeft > 0;

  async function handleShare() {
    const url = buildEventShareUrl(event.id, mockProfile.referral_code);
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
    setSubscribedId(value);
    setDialogOpen(false);
    setAccountId("");
    toast.success("Te has suscrito correctamente al evento.", {
      description: `${event.name} · ${formatEventDate(event.event_date)} ${event.event_time} · ID ${value}`,
    });
  }

  function handleEnterRoom() {
    if (paid || processing) return;
    if (!enoughBalance) {
      toast.error("Saldo insuficiente para entrar a la sala.");
      return;
    }
    setProcessing(true);
    setTimeout(() => {
      setProcessing(false);
      setPaid(true);
      toast.success(`Entrada confirmada. Se descontarían ${formatCUP(event.entry_price)}.`, {
        description: "Prototipo: el saldo real se descontará en la Fase 2.",
      });
    }, 700);
  }

  return (
    <UserShell>
      <div className="mx-auto max-w-3xl space-y-5">
        {game ? (
          <img
            src={game.image_url}
            alt={`Banner del evento ${event.name}`}
            width={1280}
            height={720}
            className="aspect-video w-full rounded-xl object-cover"
          />
        ) : null}

        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl font-bold">{event.name}</h1>
            <StatusBadge status={EVENT_STATUS_LABEL[event.status]} />
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
            value={`${formatEventDate(event.event_date)} · ${event.event_time}`}
          />
          <Detail
            icon={<Users className="size-4" />}
            label="Participantes"
            value={`${participants} (capacidad ${event.max_participants})`}
          />
          <Detail
            icon={<Clock className="size-4" />}
            label="Tipo de evento"
            value="Sala personalizada"
          />
          <div className="sm:col-span-2">
            <Progress value={goalProgress(event)} />
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
                ⏱️ {secondsLeft === null
                  ? "--:--"
                  : windowOpen
                    ? formatCountdown(secondsLeft)
                    : "Tiempo agotado"}
              </span>
            </div>

            {!subscribedId ? (
              <p className="text-sm text-muted-foreground">
                Solo los usuarios suscritos pueden entrar a esta sala.
              </p>
            ) : paid ? (
              <div className="space-y-2">
                <RoomField label="ID de sala" value={event.room_id ?? "—"} />
                <RoomField label="Contraseña" value={event.room_password ?? "—"} />
                <p className="text-xs text-muted-foreground">
                  Estado: participando · Pago registrado ({formatCUP(event.entry_price)}).
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
                  disabled={!windowOpen || processing || !enoughBalance}
                  onClick={handleEnterRoom}
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
          {subscribedId ? (
            <>
              <p className="text-sm font-semibold text-success">✅ Ya estás inscrito</p>
              <p className="text-sm text-muted-foreground">
                ID de participación: <span className="font-mono">{subscribedId}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                Solo esta cuenta tendrá derecho al premio. Para cambiarla necesitas
                autorización del administrador.
              </p>
            </>
          ) : isFull(event) ? (
            <p className="text-sm font-semibold text-destructive">🔴 Evento completo</p>
          ) : isSubscriptionOpen(event) ? (
            <>
              <p className="text-sm text-muted-foreground">
                Suscribirte no descuenta dinero. El pago ocurre solo al entrar a la sala.
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
              <Label htmlFor="account-id">ID de cuenta ({game?.name})</Label>
              <Input
                id="account-id"
                inputMode="numeric"
                placeholder="123456789"
                value={accountId}
                onChange={(fieldEvent) => setAccountId(fieldEvent.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                El nombre de la cuenta se verificará con el proveedor desde el servidor en la
                Fase 2.
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSubscribe}>Confirmar inscripción</Button>
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
