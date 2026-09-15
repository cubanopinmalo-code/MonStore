import { Link } from "@tanstack/react-router";
import { CalendarDays, Trophy, Users } from "lucide-react";
import { StatusBadge } from "@/components/common/StatusBadge";
import { GameCover } from "@/components/common/GameCover";
import { Progress } from "@/components/ui/progress";
import { eventStageLabel, formatEventDate } from "@/lib/events";
import { formatCUP } from "@/lib/format";
import type { EventRow } from "@/hooks/useEvents";

export function EventCard({ event }: { event: EventRow }) {
  const progress = Math.min(
    100,
    Math.round((event.participants / Math.max(event.min_participants, 1)) * 100),
  );

  return (
    <Link
      to="/app/eventos/$id"
      params={{ id: event.id }}
      className="surface-card flex flex-col overflow-hidden transition-transform hover:-translate-y-1"
    >
      <GameCover
        src={event.banner_url ?? event.games?.image_url ?? null}
        name={event.games?.name ?? event.name}
        className="aspect-video w-full"
      />
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="font-semibold leading-tight">{event.name}</p>
          <StatusBadge status={eventStageLabel(event.status)} />
        </div>
        <p className="text-xs text-muted-foreground">
          {event.games?.name ?? "Evento"} · {event.region}
        </p>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Trophy className="size-3.5 text-primary" aria-hidden="true" />
          {event.prize}
        </p>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <CalendarDays className="size-3.5" aria-hidden="true" />
          {event.event_date ? formatEventDate(event.event_date) : "Por confirmar"} ·{" "}
          {event.event_time}
        </p>
        <div className="mt-auto space-y-1.5 pt-2">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Users className="size-3.5" aria-hidden="true" />
              Participantes: {event.participants}/{event.min_participants}
            </span>
            <span className="font-semibold text-primary">{formatCUP(event.entry_price)}</span>
          </div>
          <Progress value={progress} />
        </div>
      </div>
    </Link>
  );
}
