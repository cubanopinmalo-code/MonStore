import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AdminProfile {
  id: string;
  name: string;
  phone: string;
  province: string;
  municipality: string;
  referral_code: string;
  status: string;
  created_at: string;
}

async function profileMap(ids: string[]): Promise<Record<string, AdminProfile>> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) return {};
  const { data } = await supabase
    .from("profiles")
    .select("id, name, phone, province, municipality, referral_code, status, created_at")
    .in("id", unique);
  const map: Record<string, AdminProfile> = {};
  (data ?? []).forEach((row) => {
    map[row.id] = row as AdminProfile;
  });
  return map;
}

/** Todos los perfiles con su rol y su saldo (solo administración). */
export function useAdminUsers() {
  return useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const [{ data: profiles, error }, { data: roles }, { data: wallets }] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, name, phone, province, municipality, referral_code, status, created_at")
          .order("created_at", { ascending: false }),
        supabase.from("user_roles").select("user_id, role"),
        supabase.from("wallets").select("user_id, balance, currency, status"),
      ]);
      if (error) throw error;
      const roleOf = new Map<string, string>();
      (roles ?? []).forEach((row) => {
        if (row.role === "admin" || !roleOf.has(row.user_id)) roleOf.set(row.user_id, row.role);
      });
      const walletOf = new Map(
        (wallets ?? []).map((row) => [row.user_id, row] as const),
      );
      return (profiles ?? []).map((profile) => ({
        ...profile,
        role: roleOf.get(profile.id) ?? "user",
        balance: Number(walletOf.get(profile.id)?.balance ?? 0),
        currency: walletOf.get(profile.id)?.currency ?? "CUP",
        wallet_status: walletOf.get(profile.id)?.status ?? "activa",
      }));
    },
  });
}

/** Movimientos de saldo de toda la plataforma. */
export function useAdminTransactions(limit = 40) {
  return useQuery({
    queryKey: ["admin-transactions", limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wallet_transactions")
        .select("id, user_id, type, amount, balance_after, description, status, created_at")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      const profiles = await profileMap((data ?? []).map((row) => row.user_id));
      return (data ?? []).map((row) => ({
        ...row,
        user_name: profiles[row.user_id]?.name ?? "—",
      }));
    },
  });
}

export function useAdminWithdrawals() {
  return useQuery({
    queryKey: ["admin-withdrawals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("withdrawals")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const profiles = await profileMap((data ?? []).map((row) => row.user_id));
      return (data ?? []).map((row) => ({
        ...row,
        user_name: profiles[row.user_id]?.name ?? "—",
        user_phone: profiles[row.user_id]?.phone ?? "",
      }));
    },
  });
}

export function useAdminDeposits() {
  return useQuery({
    queryKey: ["admin-deposits-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("deposits")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const profiles = await profileMap((data ?? []).map((row) => row.user_id));
      return (data ?? []).map((row) => ({
        ...row,
        user_name: profiles[row.user_id]?.name ?? "—",
      }));
    },
  });
}

export function useAdminReferrals() {
  return useQuery({
    queryKey: ["admin-referrals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("referrals")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const profiles = await profileMap(
        (data ?? []).flatMap((row) => [row.referrer_user_id, row.referred_user_id]),
      );
      return (data ?? []).map((row) => ({
        ...row,
        referrer_name: profiles[row.referrer_user_id]?.name ?? "—",
        referred_name: profiles[row.referred_user_id]?.name ?? "—",
      }));
    },
  });
}

/** Resumen general del panel, calculado sobre datos reales. */
export function useAdminStats() {
  return useQuery({
    queryKey: ["admin-stats"],
    staleTime: 60 * 1000,
    queryFn: async () => {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);

      const [orders, users, deposits, withdrawals, wallets, products] = await Promise.all([
        supabase.from("orders").select("total_amount, status, created_at, code, id"),
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("deposits").select("credited_amount, status"),
        supabase.from("withdrawals").select("amount, status"),
        supabase.from("wallets").select("balance"),
        supabase.from("products").select("id", { count: "exact", head: true }),
      ]);

      const orderRows = orders.data ?? [];
      const sold = orderRows.filter((row) => row.status !== "reembolsado" && row.status !== "cancelado");
      const sum = (rows: { total_amount: number }[]) =>
        rows.reduce((total, row) => total + Number(row.total_amount ?? 0), 0);

      return {
        sales_today: sum(sold.filter((row) => new Date(row.created_at) >= dayStart)),
        sales_month: sum(sold.filter((row) => new Date(row.created_at) >= monthStart)),
        orders_total: orderRows.length,
        orders_completed: orderRows.filter((row) => row.status === "completado").length,
        orders_pending: orderRows.filter((row) => row.status === "pendiente").length,
        users_total: users.count ?? 0,
        products_total: products.count ?? 0,
        deposits_total: (deposits.data ?? [])
          .filter((row) => row.status === "aprobado")
          .reduce((total, row) => total + Number(row.credited_amount ?? 0), 0),
        deposits_pending: (deposits.data ?? []).filter((row) => row.status === "pendiente").length,
        withdrawals_total: (withdrawals.data ?? [])
          .filter((row) => row.status === "aprobado")
          .reduce((total, row) => total + Number(row.amount ?? 0), 0),
        withdrawals_pending: (withdrawals.data ?? []).filter((row) => row.status === "pendiente")
          .length,
        wallets_total: (wallets.data ?? []).reduce(
          (total, row) => total + Number(row.balance ?? 0),
          0,
        ),
        wallets_count: (wallets.data ?? []).length,
        recent_orders: orderRows
          .slice()
          .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
          .slice(0, 5),
      };
    },
  });
}
