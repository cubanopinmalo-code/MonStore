import { createFileRoute } from "@tanstack/react-router";
import { UserShell } from "@/components/layout/UserShell";
import { PageHeader } from "@/components/common/PageHeader";
import { EventCard } from "@/components/events/EventCard";
import { EmptyState, ErrorState, GridSkeleton } from "@/components/common/states";
import { useEvents } from "@/hooks/useEvents";

export const Route = createFileRoute("/_authenticated/app/eventos/")({
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
  const { data: events, isLoading, isError, refetch } = useEvents();

  return (
    <UserShell>
      <div className="space-y-6">
        <PageHeader
          title="Eventos actuales"
          description="Salas personalizadas con premios. El pago se realiza solo al entrar a la sala."
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
      </div>
    </UserShell>
  );
}
