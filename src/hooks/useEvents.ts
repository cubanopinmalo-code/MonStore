import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useAccount";

/** Campos visibles para cualquier participante: nunca incluyen las credenciales de sala. */
const EVENT_FIELDS =
  "id, name, game_id, event_type, prize, region, min_participants, max_participants, event_date, event_time, entry_price, currency, status, room_activated_at, entry_window_minutes, description, banner_url, created_at, finished_at, starts_at, entry_opens_at, entry_closes_at, goal_reached_at, activated_at, entry_closed_at, started_at, cancelled_at, cancel_reason, reward_note, winner_character_name, result_published_at, games(name, image_url)";

/** Solo administración: añade las credenciales de sala y el detalle interno. */
const EVENT_ADMIN_FIELDS = `${EVENT_FIELDS}, room_id, room_password, room_locked_at, room_updated_at, entry_revenue, prize_delivery_status, prize_delivery_error, prize_delivered_at, reward_amount, winner_user_id, winner_game_account_id, result_note`;

export interface EventRow {
  id: string;
  name: string;
  game_id: string | null;
  prize: string;
  region: string;
  min_participants: number;
  max_participants: number;
  event_date: string | null;
  event_time: string;
  entry_price: number;
  currency: string;
  status: string;
  room_id?: string | null;
  room_password?: string | null;
  room_locked_at?: string | null;
  room_activated_at: string | null;
  entry_window_minutes: number;
  description: string;
  banner_url: string | null;
  starts_at: string | null;
  entry_opens_at: string | null;
  entry_closes_at: string | null;
  goal_reached_at: string | null;
  activated_at: string | null;
  entry_closed_at: string | null;
  started_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  reward_note: string | null;
  reward_amount?: number | null;
  winner_character_name: string | null;
  winner_user_id?: string | null;
  winner_game_account_id?: string | null;
  result_note?: string | null;
  result_published_at: string | null;
  prize_delivery_status?: string | null;
  prize_delivery_error?: string | null;
  prize_delivered_at?: string | null;
  entry_revenue?: number | null;
  finished_at: string | null;
  games: { name: string; image_url: string } | null;
  participants: number;
}

async function fetchCounts(): Promise<Record<string, number>> {
  const { data, error } = await supabase.rpc("event_participant_counts");
  if (error) return {};
  const map: Record<string, number> = {};
  (data ?? []).forEach((row) => {
    map[row.event_id] = Number(row.participants ?? 0);
  });
  return map;
}

/** Eventos reales de la base, con el número de inscritos de cada uno. */
export function useEvents(includeFinished = false, admin = false) {
  return useQuery({
    queryKey: ["events", includeFinished, admin],
    staleTime: 30 * 1000,
    queryFn: async (): Promise<EventRow[]> => {
      const query = admin
        ? supabase
            .from("events")
            .select(EVENT_ADMIN_FIELDS)
            .order("starts_at", { ascending: true, nullsFirst: false })
        : supabase
            .from("events_public")
            .select(EVENT_FIELDS)
            .order("starts_at", { ascending: true, nullsFirst: false });
      const { data, error } = includeFinished
        ? await query
        : await query.not("status", "in", "(finalizado,cancelado,meta_no_alcanzada)");
      if (error) throw error;
      const counts = await fetchCounts();
      return (data ?? []).map((row) => ({
        ...(row as unknown as Omit<EventRow, "participants">),
        participants: counts[(row as { id: string }).id] ?? 0,
      }));
    },
  });
}

export function useEvent(id: string) {
  return useQuery({
    queryKey: ["event", id],
    enabled: Boolean(id),
    staleTime: 15 * 1000,
    queryFn: async (): Promise<EventRow | null> => {
      const { data, error } = await supabase
        .from("events_public")
        .select(EVENT_FIELDS)
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const counts = await fetchCounts();
      return {
        ...(data as unknown as Omit<EventRow, "participants">),
        participants: counts[(data as { id: string }).id] ?? 0,
      };
    },
  });
}

export interface SubscriptionRow {
  id: string;
  event_id: string;
  game_account_id: string;
  character_name: string | null;
  status: string;
  payment_status: string;
  charged_at: string | null;
  charge_amount: number | null;
  refunded_at: string | null;
  entered_at: string | null;
}

/** Inscripción del usuario actual en un evento (si existe). */
export function useMySubscription(eventId: string) {
  const { data: user } = useCurrentUser();
  return useQuery({
    queryKey: ["event-subscription", eventId, user?.id],
    enabled: Boolean(eventId && user?.id),
    queryFn: async (): Promise<SubscriptionRow | null> => {
      const { data, error } = await supabase
        .from("event_subscriptions")
        .select(
          "id, event_id, game_account_id, character_name, status, payment_status, charged_at, charge_amount, refunded_at, entered_at",
        )
        .eq("event_id", eventId)
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/** Todos los eventos en los que participa el usuario actual. */
export function useMyEventSubscriptions() {
  const { data: user } = useCurrentUser();
  return useQuery({
    queryKey: ["my-event-subscriptions", user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_subscriptions")
        .select(
          "id, event_id, game_account_id, status, payment_status, charged_at, charge_amount, refunded_at, created_at, events(name, status, event_date, event_time, prize)",
        )
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export interface AdminSubscriptionRow {
  id: string;
  user_id: string;
  game_account_id: string;
  character_name: string | null;
  status: string;
  payment_status: string;
  charged_at: string | null;
  charge_amount: number | null;
  charge_error: string | null;
  refunded_at: string | null;
  entered_at: string | null;
  created_at: string;
  profiles: { name: string; phone: string } | null;
}

/** Todas las inscripciones de un evento (solo administración: incluye teléfono). */
export function useEventSubscriptions(eventId: string | null) {
  return useQuery({
    queryKey: ["event-subscriptions-admin", eventId],
    enabled: Boolean(eventId),
    queryFn: async (): Promise<AdminSubscriptionRow[]> => {
      const { data, error } = await supabase
        .from("event_subscriptions")
        .select(
          "id, user_id, game_account_id, character_name, status, payment_status, charged_at, charge_amount, charge_error, refunded_at, entered_at, created_at, profiles:user_id(name, phone)",
        )
        .eq("event_id", eventId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as AdminSubscriptionRow[];
    },
  });
}

export interface EventResultRow {
  event_id: string;
  event_name: string;
  game_name: string | null;
  game_image: string | null;
  prize: string;
  reward_note: string | null;
  starts_at: string | null;
  finished_at: string | null;
  result_published_at: string | null;
  winner_character_name: string | null;
  winner_name: string | null;
  winner_avatar: string | null;
}

/** Resultados publicados: solo datos públicos del ganador. */
export function useEventResults(limit = 30) {
  return useQuery({
    queryKey: ["event-results", limit],
    staleTime: 60 * 1000,
    queryFn: async (): Promise<EventResultRow[]> => {
      const { data, error } = await supabase
        .from("event_results_public")
        .select("*")
        .order("finished_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as unknown as EventResultRow[];
    },
  });
}

/** Mensajes de texto enviados por un evento (solo administración). */
export function useEventSmsLog(eventId: string | null) {
  return useQuery({
    queryKey: ["event-sms-log", eventId],
    enabled: Boolean(eventId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_sms_log")
        .select("id, user_id, phone, kind, status, error_message, created_at")
        .eq("event_id", eventId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Mantiene eventos, inscripciones y resultados al día sin recargar la página. */
export function useEventsRealtime(): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    const invalidate = () => {
      void queryClient.invalidateQueries({ queryKey: ["events"] });
      void queryClient.invalidateQueries({ queryKey: ["event"] });
      void queryClient.invalidateQueries({ queryKey: ["event-subscription"] });
      void queryClient.invalidateQueries({ queryKey: ["event-subscriptions-admin"] });
      void queryClient.invalidateQueries({ queryKey: ["event-results"] });
      void queryClient.invalidateQueries({ queryKey: ["wallet"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    };
    const channel = supabase
      .channel("events-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "events" }, invalidate)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "event_subscriptions" },
        invalidate,
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);
}
