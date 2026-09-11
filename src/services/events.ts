import { mockEventSubscriptions, mockEvents } from "@/data/mock/events";
import type { EventSubscription, GameEvent } from "@/types";

export function getEvents(): Promise<GameEvent[]> {
  return Promise.resolve(mockEvents);
}

export function getEvent(id: string): Promise<GameEvent | undefined> {
  return Promise.resolve(mockEvents.find((event) => event.id === id));
}

export function getEventSubscriptions(eventId?: string): Promise<EventSubscription[]> {
  return Promise.resolve(
    eventId
      ? mockEventSubscriptions.filter((item) => item.event_id === eventId)
      : mockEventSubscriptions,
  );
}

/**
 * El nombre de la cuenta se consultará mediante G2Bulk desde el backend seguro
 * en la Fase 2. El navegador nunca llamará al proveedor directamente.
 */
export function lookupGameAccountName(): Promise<string | null> {
  return Promise.resolve(null);
}
