import { createFileRoute } from "@tanstack/react-router";
import { Trophy } from "lucide-react";
import { UserShell } from "@/components/layout/UserShell";
import { PageHeader } from "@/components/common/PageHeader";
import { EventCard } from "@/components/events/EventCard";
import { EmptyState, ErrorState, GridSkeleton } from "@/components/common/states";
import { useEventResults, useEvents, useEventsRealtime } from "@/hooks/useEvents";
import { formatEventDate } from "@/lib/events";

export const Route = createFileRoute("/_authenticated/app/eventos/")({
  head: () => ({
    meta: [
      { title: "Eventos actuales — MONSTORE" },
      {
        name: "description",
        content:
          "Salas personalizadas con premios: inscríbete antes de que comiencen y entra cuando el evento se active.",
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
  const { data: events, isLoading, isError, refetch } = useEvents();
  const { data: results } = useEventResults(10);
  useEventsRealtime();

  return (
    <UserShell>
      <div className="space-y-6">
        <PageHeader
          title="Eventos actuales"
          description="Inscribirte es gratis. El pago se descuenta solo cuando el evento comienza."
        />

        {isLoading ? (
          <GridSkeleton items={3} />
        ) : isError ? (
          <ErrorState onRetry={() => void refetch()} />
        ) : !events || events.length === 0 ? (
          <EmptyState
            title="Todavía no hay eventos"
            description="Cuando el equipo publique un evento aparecerá aquí."
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {events.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        )}

        {results && results.length > 0 ? (
          <section className="space-y-3">
            <h2 className="font-display text-lg font-semibold">Resultados recientes</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {results.map((result) => (
                <div key={result.event_id} className="surface-card space-y-1 p-4">
                  <p className="flex items-center gap-1.5 font-semibold">
                    <Trophy className="size-4 text-primary" aria-hidden="true" />
                    {result.event_name}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Ganador: {result.winner_character_name ?? "Por publicar"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Premio: {result.prize}
                    {result.finished_at
                      ? ` · ${formatEventDate(result.finished_at.slice(0, 10))}`
                      : ""}
                  </p>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </UserShell>
  );
}
