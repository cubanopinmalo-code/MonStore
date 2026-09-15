import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Datos del panel administrativo. Todo sale de las tablas que ya existen en
 * Lovable Cloud: no hay datos inventados ni tablas nuevas.
 */

const ACTIVE_EVENT_STATES = [
  "proximamente",
  "inscripciones_abiertas",
  "meta_alcanzada",
  "sala_activa",
  "evento_iniciado",
] as const;

export interface AdminAlert {
  id: string;
  level: "critica" | "atencion" | "info";
  title: string;
  detail: string;
  to: string;
}

export interface AdminActivityItem {
  id: string;
  title: string;
  detail: string;
  created_at: string;
}

function startOfDay() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function startOfMonth() {
  const date = startOfDay();
  date.setDate(1);
  return date;
}

export interface AdminPanelData {
  deposits_pending: number;
  deposits_stale: number;
  withdrawals_pending: number;
  accounts_pending: number;
  events_active: number;
  events_upcoming: number;
  events_goal_reached: number;
  prizes_pending: number;
  users_total: number;
  users_blocked: number;
  sales_today: number;
  profit_today: number;
  profit_month: number;
  usd_sold_month: number;
  held_funds: number;
  wallets_total: number;
  alerts: AdminAlert[];
}

async function loadPanel(): Promise<AdminPanelData> {
  const dayStart = startOfDay();
  const monthStart = startOfMonth();
  const staleLimit = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [
    ordersRes,
    depositsRes,
    withdrawalsRes,
    accountsRes,
    eventsRes,
    profilesRes,
    walletsRes,
    settingsRes,
  ] = await Promise.all([
    supabase
      .from("orders")
      .select("id, code, total_amount, quantity, status, created_at, products(g2bulk_cost)")
      .gte("created_at", monthStart.toISOString()),
    supabase.from("deposits").select("id, status, created_at, credited_amount"),
    supabase.from("withdrawals").select("id, status, created_at, amount"),
    supabase.from("game_accounts").select("id, status, created_at, title"),
    supabase
      .from("events")
      .select("id, name, status, event_date, winner_user_id, prize_delivered_at, result_published_at"),
    supabase.from("profiles").select("id, status"),
    supabase.from("wallets").select("balance, held_balance"),
    supabase.from("platform_settings").select("usd_to_cup, usd_margin_cup").maybeSingle(),
  ]);

  const orders = ordersRes.data ?? [];
  const deposits = depositsRes.data ?? [];
  const withdrawals = withdrawalsRes.data ?? [];
  const accounts = accountsRes.data ?? [];
  const events = eventsRes.data ?? [];
  const profiles = profilesRes.data ?? [];
  const wallets = walletsRes.data ?? [];
  const usdToCup = Number(settingsRes.data?.usd_to_cup ?? 0);

  const billable = orders.filter(
    (row) => row.status !== "reembolsado" && row.status !== "cancelado",
  );
  const costOf = (row: (typeof orders)[number]) =>
    Number(row.products?.g2bulk_cost ?? 0) * Number(row.quantity ?? 1);
  const profitOf = (row: (typeof orders)[number]) =>
    Number(row.total_amount ?? 0) - costOf(row) * usdToCup;

  const todayOrders = billable.filter((row) => new Date(row.created_at) >= dayStart);

  const depositsPending = deposits.filter((row) => row.status === "pendiente");
  const depositsStale = depositsPending.filter((row) => new Date(row.created_at) < staleLimit);
  const withdrawalsPending = withdrawals.filter((row) => row.status === "pendiente");
  const accountsPending = accounts.filter((row) => row.status === "pendiente");
  const eventsActive = events.filter((row) =>
    (ACTIVE_EVENT_STATES as readonly string[]).includes(row.status),
  );
  const eventsUpcoming = events.filter((row) => row.status === "proximamente");
  const eventsGoal = events.filter((row) => row.status === "meta_alcanzada");
  const prizesPending = events.filter(
    (row) => row.status === "finalizado" && row.winner_user_id && !row.prize_delivered_at,
  );
  const blocked = profiles.filter((row) => row.status && row.status !== "activo");

  const alerts: AdminAlert[] = [];
  if (depositsStale.length > 0)
    alerts.push({
      id: "deposits-stale",
      level: "critica",
      title: `${depositsStale.length} solicitud(es) de fondos sin revisar hace más de 24 h`,
      detail: "Revisa y aprueba o rechaza para liberar la línea de pago.",
      to: "/admin/depositos",
    });
  if (withdrawalsPending.length > 0)
    alerts.push({
      id: "withdrawals-pending",
      level: "atencion",
      title: `${withdrawalsPending.length} retiro(s) pendiente(s)`,
      detail: "El dinero del cliente queda retenido hasta que decidas.",
      to: "/admin/retiros",
    });
  if (accountsPending.length > 0)
    alerts.push({
      id: "accounts-pending",
      level: "atencion",
      title: `${accountsPending.length} solicitud(es) de cuentas por revisar`,
      detail: "Verifica fotos, juego y región antes de publicar.",
      to: "/admin/comercio",
    });
  if (eventsGoal.length > 0)
    alerts.push({
      id: "events-goal",
      level: "atencion",
      title: `${eventsGoal.length} evento(s) alcanzaron la meta`,
      detail: "Activa la sala y comparte el acceso a los participantes.",
      to: "/admin/eventos",
    });
  if (prizesPending.length > 0)
    alerts.push({
      id: "prizes-pending",
      level: "critica",
      title: `${prizesPending.length} premio(s) pendiente(s) de entrega`,
      detail: "Hay ganador registrado sin premio entregado.",
      to: "/admin/eventos",
    });
  if (blocked.length > 0)
    alerts.push({
      id: "users-blocked",
      level: "info",
      title: `${blocked.length} usuario(s) con la cuenta restringida`,
      detail: "Revisa el motivo y decide si mantener la restricción.",
      to: "/admin/usuarios",
    });
  if (usdToCup <= 0)
    alerts.push({
      id: "settings-usd",
      level: "critica",
      title: "Falta el valor del USD en configuración",
      detail: "Sin ese valor las ganancias no se pueden calcular.",
      to: "/admin/configuracion",
    });

  return {
    deposits_pending: depositsPending.length,
    deposits_stale: depositsStale.length,
    withdrawals_pending: withdrawalsPending.length,
    accounts_pending: accountsPending.length,
    events_active: eventsActive.length,
    events_upcoming: eventsUpcoming.length,
    events_goal_reached: eventsGoal.length,
    prizes_pending: prizesPending.length,
    users_total: profiles.length,
    users_blocked: blocked.length,
    sales_today: todayOrders.reduce((total, row) => total + Number(row.total_amount ?? 0), 0),
    profit_today: todayOrders.reduce((total, row) => total + profitOf(row), 0),
    profit_month: billable.reduce((total, row) => total + profitOf(row), 0),
    usd_sold_month: billable.reduce((total, row) => total + costOf(row), 0),
    held_funds: wallets.reduce((total, row) => total + Number(row.held_balance ?? 0), 0),
    wallets_total: wallets.reduce((total, row) => total + Number(row.balance ?? 0), 0),
    alerts,
  };
}

export function useAdminPanel() {
  return useQuery({ queryKey: ["admin-panel"], queryFn: loadPanel });
}

/**
 * Tablas de datos operativos: un cambio aquí sí obliga a recalcular los
 * indicadores del panel y de la pantalla que las está mirando.
 */
const REALTIME_TABLES = [
  "deposits",
  "withdrawals",
  "game_accounts",
  "events",
  "event_subscriptions",
  "orders",
  "wallets",
  "platform_settings",
  "game_account_sales",
] as const;

/**
 * La auditoría solo alimenta "Actividad reciente": su propio canal evita que
 * un apunte nuevo dispare el recálculo completo del panel.
 */
const ACTIVITY_TABLE = "audit_log";

/** Refresca el panel en cuanto cambia algo relevante, sin recargar la página. */
export function useAdminRealtime(keys: string[] = ["admin-panel"]) {
  const queryClient = useQueryClient();
  const signature = keys.join("|");

  useEffect(() => {
    const channel = supabase.channel("admin-panel-realtime");
    for (const table of REALTIME_TABLES) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, () => {
        for (const key of signature.split("|")) {
          void queryClient.invalidateQueries({ queryKey: [key] });
        }
      });
    }
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: ACTIVITY_TABLE },
      () => {
        void queryClient.invalidateQueries({ queryKey: [ACTIVITY_QUERY_KEY] });
      },
    );
    channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient, signature]);
}
