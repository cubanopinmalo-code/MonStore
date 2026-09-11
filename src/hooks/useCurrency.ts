import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useAccount";
import { DEFAULT_SALDO_RATE, setMoneyDisplay, type DisplayCurrency } from "@/lib/format";

/** Base de conversión configurada por el administrador (CUP por 1 de saldo). */
export function useSaldoRate() {
  return useQuery({
    queryKey: ["saldo-rate"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_settings")
        .select("saldo_conversion_rate")
        .maybeSingle();
      if (error) throw error;
      return Number(data?.saldo_conversion_rate ?? DEFAULT_SALDO_RATE);
    },
  });
}

export function useDisplayCurrency() {
  const { data: user } = useCurrentUser();
  return useQuery({
    queryKey: ["display-currency", user?.id],
    enabled: Boolean(user?.id),
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_currency_prefs")
        .select("currency, updated_at")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return (data?.currency === "SALDO" ? "SALDO" : "CUP") as DisplayCurrency;
    },
  });
}

/** Cambios hechos en las últimas 24 h y en los últimos 7 días. */
export function useCurrencySwitchUsage() {
  const { data: user } = useCurrentUser();
  return useQuery({
    queryKey: ["currency-switches", user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
      const { data, error } = await supabase
        .from("currency_switch_log")
        .select("created_at")
        .eq("user_id", user!.id)
        .gte("created_at", since);
      if (error) throw error;
      const rows = data ?? [];
      const dayAgo = Date.now() - 24 * 3600 * 1000;
      return {
        day: rows.filter((row) => new Date(row.created_at).getTime() > dayAgo).length,
        week: rows.length,
      };
    },
  });
}

export function useSwitchCurrency() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (currency: DisplayCurrency) => {
      const { data, error } = await supabase.rpc("set_display_currency", {
        p_currency: currency,
      });
      if (error) throw error;
      const result = data as { ok?: boolean; error?: string } | null;
      if (!result?.ok) throw new Error(result?.error ?? "unknown");
      return currency;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["display-currency"] });
      await queryClient.invalidateQueries({ queryKey: ["currency-switches"] });
    },
  });
}

/** Aplica la moneda elegida al formateador global y devuelve el estado actual. */
export function useMoneyDisplay() {
  const { data: rate } = useSaldoRate();
  const { data: currency } = useDisplayCurrency();
  const active: DisplayCurrency = currency ?? "CUP";
  const activeRate = rate ?? DEFAULT_SALDO_RATE;
  setMoneyDisplay(active, activeRate);
  return { currency: active, rate: activeRate };
}
