import type { EventStatus, GameEvent, SubscriptionPaymentStatus } from "@/types";

export const EVENT_STATUS_LABEL: Record<EventStatus, string> = {
  proximamente: "Próximamente",
  inscripciones_abiertas: "Inscripciones abiertas",
  meta_alcanzada: "Meta alcanzada",
  sala_activa: "Sala activa",
  finalizado: "Finalizado",
  cancelado: "Cancelado",
  meta_no_alcanzada: "Meta no alcanzada",
};

export const PAYMENT_STATUS_LABEL: Record<SubscriptionPaymentStatus, string> = {
  pending: "Pendiente",
  paid: "Pagado",
  refunded: "Reembolsado",
  cancelled: "Cancelado",
};

export function isSubscriptionOpen(event: GameEvent): boolean {
  return (
    (event.status === "inscripciones_abiertas" || event.status === "meta_alcanzada") &&
    event.participants_count < event.max_participants
  );
}

export function isFull(event: GameEvent): boolean {
  return event.participants_count >= event.max_participants;
}

export function goalProgress(event: GameEvent): number {
  return Math.min(100, Math.round((event.participants_count / event.min_participants) * 100));
}

/** Segundos restantes de la ventana de entrada a una sala activa. */
export function entrySecondsLeft(event: GameEvent, now: number = Date.now()): number {
  if (event.status !== "sala_activa" || !event.room_activated_at) return 0;
  const end =
    new Date(event.room_activated_at).getTime() + event.entry_window_minutes * 60 * 1000;
  return Math.max(0, Math.floor((end - now) / 1000));
}

export function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function formatEventDate(date: string): string {
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}

/** Enlace de invitación a un evento: lleva al registro y luego al evento. */
export function buildEventShareUrl(eventId: string, referralCode?: string): string {
  const params = new URLSearchParams({ evento: eventId });
  if (referralCode) params.set("ref", referralCode);
  return `https://monstore.cu/?${params.toString()}`;
}
