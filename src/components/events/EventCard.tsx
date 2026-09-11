import { Link } from "@tanstack/react-router";
import { CalendarDays, Trophy, Users } from "lucide-react";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Progress } from "@/components/ui/progress";
import { mockEvents } from "@/data/mock/events";
import { mockGames } from "@/data/mock/games";
import { EVENT_STATUS_LABEL, formatEventDate, goalProgress } from "@/lib/events";
import { formatCUP } from "@/lib/format";

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
