/**
 * Panel administrativo del gateway de pagos: sólo lectura del registro de
 * eventos y de su resumen. Nunca expone el secreto del dispositivo.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface GatewayEventRow {
  id: string;
  event_id: string;
  device_id: string;
  event_type: string;
  channel: string;
  status: string;
  outcome: string;
  reason: string;
  sender: string;
  message: string;
  amount: number | null;
  reference: string | null;
  mode: string;
  deposit_id: string | null;
  received_at: string;
  created_at: string;
}

export interface GatewayOverview {
  events: GatewayEventRow[];
  stats: {
    total: number;
    approved: number;
    review: number;
    duplicated: number;
    simulated: number;
    errors: number;
  };
  last_event_at: string | null;
  last_device_id: string | null;
}

export const getGatewayOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<GatewayOverview> => {
    const { data, error } = await context.supabase
      .from("payment_gateway_events" as never)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message || "No se pudo leer el registro del gateway.");

    const rows = (data ?? []) as unknown as Record<string, unknown>[];
    const events: GatewayEventRow[] = rows.map((row) => {
      const parsed = (row["parsed"] ?? {}) as Record<string, unknown>;
      const amount = Number(parsed["amount"]);
      return {
        id: String(row["id"]),
        event_id: String(row["event_id"] ?? ""),
        device_id: String(row["device_id"] ?? ""),
        event_type: String(row["event_type"] ?? ""),
        channel: String(row["channel"] ?? ""),
        status: String(row["status"] ?? ""),
        outcome: String(row["outcome"] ?? ""),
        reason: String(row["reason"] ?? ""),
        sender: String(row["sender"] ?? ""),
        message: String(row["message"] ?? ""),
        amount: Number.isFinite(amount) ? amount : null,
        reference: parsed["reference"] ? String(parsed["reference"]) : null,
        mode: String(row["mode"] ?? ""),
        deposit_id: row["deposit_id"] ? String(row["deposit_id"]) : null,
        received_at: String(row["received_at"] ?? ""),
        created_at: String(row["created_at"] ?? ""),
      };
    });

    const stats = {
      total: events.length,
      approved: events.filter((e) => e.outcome === "aprobado_automatico").length,
      review: events.filter((e) => e.status === "revision").length,
      duplicated: events.filter((e) => e.status === "duplicado").length,
      simulated: events.filter((e) => e.status === "simulado").length,
      errors: events.filter((e) => e.status === "rechazado").length,
    };

    return {
      events,
      stats,
      last_event_at: events[0]?.created_at ?? null,
      last_device_id: events[0]?.device_id ?? null,
    };
  });
