import type { EventStatus, GameEvent, SubscriptionPaymentStatus } from "@/types";

export const EVENT_STATUS_LABEL: Record<EventStatus, string> = {
  proximamente: "Inscripciones activas",
  inscripciones_abiertas: "Inscripciones activas",
  meta_alcanzada: "Inscripciones activas · meta alcanzada",
  sala_activa: "Evento activo",
  evento_iniciado: "Evento iniciado",
  finalizado: "Evento finalizado",
  cancelado: "Evento cancelado",
  meta_no_alcanzada: "Evento cancelado",
};

/** Las cinco etapas operativas visibles del módulo de Eventos. */
export type EventStage = "inscripciones" | "activo" | "iniciado" | "finalizado" | "cancelado";

export const EVENT_STAGE_LABEL: Record<EventStage, string> = {
  inscripciones: "Inscripciones activas",
  activo: "Evento activo",
  iniciado: "Evento iniciado",
  finalizado: "Evento finalizado",
  cancelado: "Evento cancelado",
};

/** Color de cada etapa, igual en cliente y administración. */
export const EVENT_STAGE_CLASS: Record<EventStage, string> = {
  inscripciones: "bg-primary/15 text-primary",
  activo: "bg-success/15 text-success",
  iniciado: "bg-warning/15 text-warning",
  finalizado: "bg-muted text-muted-foreground",
  cancelado: "bg-destructive/15 text-destructive",
};

export function eventStage(status: string): EventStage {
  switch (status) {
    case "sala_activa":
      return "activo";
    case "evento_iniciado":
      return "iniciado";
    case "finalizado":
      return "finalizado";
    case "cancelado":
    case "meta_no_alcanzada":
      return "cancelado";
    default:
      return "inscripciones";
  }
}

export function eventStageLabel(status: string): string {
  return EVENT_STAGE_LABEL[eventStage(status)];
}

export const PAYMENT_STATUS_LABEL: Record<SubscriptionPaymentStatus, string> = {
  pending: "Pendiente",
  paid: "Pagado",
  refunded: "Reembolsado",
  cancelled: "Cancelado",
};

export const SUBSCRIPTION_STATUS_LABEL: Record<string, string> = {
  inscrito: "Inscrito",
  confirmado: "Confirmado",
  no_confirmado: "No confirmado",
  en_sala: "En la sala",
  cancelado: "Cancelado",
};

export const SUBSCRIPTION_PAYMENT_LABEL: Record<string, string> = {
  pending: "Pendiente",
  pagado: "Cobrado",
  reembolsado: "Devuelto",
  cancelado: "Cancelado",
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

/** Segundos que faltan para un momento dado (0 cuando ya pasó). */
export function secondsUntil(iso: string | null | undefined, now: number = Date.now()): number {
  if (!iso) return 0;
  return Math.max(0, Math.floor((new Date(iso).getTime() - now) / 1000));
}

export function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Cuenta atrás larga: días y horas cuando faltan más de 60 minutos. */
export function formatLongCountdown(seconds: number): string {
  if (seconds <= 0) return "00:00";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days} d ${hours} h`;
  if (hours > 0) return `${hours} h ${String(minutes).padStart(2, "0")} min`;
  return formatCountdown(seconds);
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
