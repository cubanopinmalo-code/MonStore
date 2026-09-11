import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { UserShell } from "@/components/layout/UserShell";
import { PageHeader } from "@/components/common/PageHeader";
import { EventCard } from "@/components/events/EventCard";
import { EmptyState } from "@/components/common/states";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { mockEvents } from "@/data/mock/events";
import type { EventStatus } from "@/types";

const TABS: { value: string; label: string; statuses: EventStatus[] }[] = [
  {
    value: "todos",
    label: "Todos",
    statuses: ["inscripciones_abiertas", "meta_alcanzada", "sala_activa", "proximamente"],
  },
  {
    value: "abiertas",
    label: "Inscripciones abiertas",
    statuses: ["inscripciones_abiertas", "meta_alcanzada"],
  },
  { value: "sala", label: "Sala activa", statuses: ["sala_activa"] },
  { value: "proximamente", label: "Próximamente", statuses: ["proximamente"] },
];

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
  const [tab, setTab] = useState("todos");
  const active = TABS.find((item) => item.value === tab) ?? TABS[0];
  const events = mockEvents.filter((event) => active.statuses.includes(event.status));

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
