import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarDays, Trophy, Users } from "lucide-react";
import { UserShell } from "@/components/layout/UserShell";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusBadge } from "@/components/common/StatusBadge";
import { EmptyState } from "@/components/common/states";
import { Progress } from "@/components/ui/progress";
import { mockEvents } from "@/data/mock/events";
import { mockGames } from "@/data/mock/games";
import { EVENT_STATUS_LABEL, formatEventDate, goalProgress } from "@/lib/events";
import { formatCUP } from "@/lib/format";

export const Route = createFileRoute("/app/eventos/")({
  head: () => ({
    meta: [
      { title: "Eventos actuales — MONSTORE" },
      {
        name: "description",
        content:
          "Salas personalizadas con premios: suscríbete antes de que comiencen y entra cuando la sala esté activa.",
      },
      { property: "og:title", content: "Eventos actuales — MONSTORE" },
      {
        property: "og:description",
        content: "Torneos y salas personalizadas con premios en MONSTORE.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: EventsPage,
});

function EventsPage() {
  const events = mockEvents.filter((event) => event.status !== "finalizado");

  return (
    <UserShell>
      <div className="space-y-6">
        <PageHeader
          title="Eventos actuales"
          description="Salas personalizadas con premios. El pago se realiza solo al entrar a la sala."
        />

        {events.length === 0 ? (
          <EmptyState
            title="Todavía no hay eventos"
            description="Cuando el equipo publique un evento aparecerá aquí."
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {events.map((event) => (
              <EventCard key={event.id} eventId={event.id} />
            ))}
          </div>
        )}
      </div>
    </UserShell>
  );
}

export function EventCard({ eventId }: { eventId: string }) {
  const event = mockEvents.find((item) => item.id === eventId);
  if (!event) return null;
  const game = mockGames.find((item) => item.id === event.game_id);

  return (
    <Link
      to="/app/eventos/$id"
      params={{ id: event.id }}
      className="surface-card flex flex-col overflow-hidden transition-transform hover:-translate-y-1"
    >
      {game ? (
        <img
          src={game.image_url}
          alt={`Banner del evento ${event.name}`}
          loading="lazy"
          width={768}
          height={432}
          className="aspect-video w-full object-cover"
        />
      ) : null}
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="font-semibold leading-tight">{event.name}</p>
          <StatusBadge status={EVENT_STATUS_LABEL[event.status]} />
        </div>
        <p className="text-xs text-muted-foreground">
          {game?.name} · {event.region}
        </p>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Trophy className="size-3.5 text-primary" aria-hidden="true" />
          {event.prize}
        </p>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <CalendarDays className="size-3.5" aria-hidden="true" />
          {formatEventDate(event.event_date)} · {event.event_time}
        </p>
        <div className="mt-auto space-y-1.5 pt-2">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Users className="size-3.5" aria-hidden="true" />
              Participantes: {event.participants_count}/{event.min_participants}
            </span>
            <span className="font-semibold text-primary">{formatCUP(event.entry_price)}</span>
          </div>
          <Progress value={goalProgress(event)} />
        </div>
      </div>
    </Link>
  );
}
