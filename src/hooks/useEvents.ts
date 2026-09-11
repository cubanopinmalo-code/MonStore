import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useAccount";

const EVENT_FIELDS =
  "id, name, game_id, event_type, prize, region, min_participants, max_participants, event_date, event_time, entry_price, currency, status, room_id, room_password, room_activated_at, entry_window_minutes, description, banner_url, created_at, finished_at, games(name, image_url)";

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
  status: string;
  room_id: string | null;
  room_password: string | null;
  room_activated_at: string | null;
  entry_window_minutes: number;
  description: string;
  banner_url: string | null;
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
export function useEvents(includeFinished = false) {
  return useQuery({
    queryKey: ["events", includeFinished],
    staleTime: 30 * 1000,
    queryFn: async (): Promise<EventRow[]> => {
      const query = supabase.from("events").select(EVENT_FIELDS).order("event_date", {
        ascending: true,
        nullsFirst: false,
      });
      const { data, error } = includeFinished
        ? await query
        : await query.not("status", "in", "(finalizado,cancelado)");
      if (error) throw error;
      const counts = await fetchCounts();
      return (data ?? []).map((row) => ({
        ...(row as unknown as Omit<EventRow, "participants">),
        participants: counts[row.id] ?? 0,
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
        .from("events")
        .select(EVENT_FIELDS)
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const counts = await fetchCounts();
      return {
        ...(data as unknown as Omit<EventRow, "participants">),
        participants: counts[data.id] ?? 0,
      };
    },
  });
}

export interface SubscriptionRow {
  id: string;
  event_id: string;
  game_account_id: string;
  status: string;
  payment_status: string;
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
        .select("id, event_id, game_account_id, status, payment_status, entered_at")
        .eq("event_id", eventId)
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/** Todas las inscripciones de un evento (solo administración). */
export function useEventSubscriptions(eventId: string | null) {
  return useQuery({
    queryKey: ["event-subscriptions-admin", eventId],
    enabled: Boolean(eventId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_subscriptions")
        .select("id, user_id, game_account_id, status, payment_status, entered_at, created_at")
        .eq("event_id", eventId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}
