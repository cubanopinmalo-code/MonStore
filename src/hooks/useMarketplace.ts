import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useAccount";

export const DEFAULT_LISTING_FEE_PER_DAY = 150;

const LISTING_FIELDS =
  "id, seller_id, seller_name, game_id, title, description, region, platform, price, currency, images, status, rejection_reason, duration_days, publish_fee, published_at, expires_at, created_at, buyer_id, sold_at, sale_amount, funds_status, credentials_delivered_at, secure_started_at, secure_deadline, expired_at, seller_data_released_at, withdrawn_at, withdrawn_reason, republished_from, games(name)";

/** Tarifa diaria de publicación configurada por el administrador. */
export function useListingFee() {
  return useQuery({
    queryKey: ["listing-fee"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_settings")
        .select("listing_fee_per_day, listing_fee_days")
        .maybeSingle();
      if (error) throw error;
      const byDays = (data?.listing_fee_days ?? {}) as Record<string, number>;
      return {
        perDay: Number(data?.listing_fee_per_day ?? DEFAULT_LISTING_FEE_PER_DAY),
        byDays,
      };
    },
  });
}

/** Comisión total de una duración: usa la tarifa por duración si está configurada. */
export function feeForDays(
  fees: { perDay: number; byDays: Record<string, number> } | undefined,
  days: number,
) {
  const perDay = fees?.perDay ?? DEFAULT_LISTING_FEE_PER_DAY;
  const override = Number(fees?.byDays?.[String(days)]);
  if (Number.isFinite(override) && override >= 0) return override;
  return perDay * days;
}

export function useActiveGames() {
  return useQuery({
    queryKey: ["active-games"],
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("games")
        .select("id, name")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Anuncios visibles en el comercio: aprobados y con tiempo contratado vigente. */
export function usePublicListings() {
  return useQuery({
    queryKey: ["listings-public"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("game_accounts")
        .select(LISTING_FIELDS)
        .eq("status", "aprobada")
        .is("buyer_id", null)
        .order("published_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function usePublicListing(id: string) {
  return useQuery({
    queryKey: ["listing-public", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("game_accounts")
        .select(LISTING_FIELDS)
        .eq("id", id)
        .eq("status", "aprobada")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useMyListings() {
  const { data: user } = useCurrentUser();
  return useQuery({
    queryKey: ["listings-mine", user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("game_accounts")
        .select(LISTING_FIELDS)
        .eq("seller_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Cuentas que el usuario compró: solo él las ve. */
export function useMyPurchases() {
  const { data: user } = useCurrentUser();
  return useQuery({
    queryKey: ["listings-bought", user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("game_accounts")
        .select(LISTING_FIELDS)
        .eq("buyer_id", user!.id)
        .order("sold_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAdminListings() {
  return useQuery({
    queryKey: ["listings-admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("game_accounts")
        .select(LISTING_FIELDS)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Ventas de cuentas con su estado de pago (retenido, liberado, pendiente). */
export function useAccountSales() {
  return useQuery({
    queryKey: ["account-sales"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("game_account_sales")
        .select(
          "id, listing_id, buyer_id, seller_id, amount, currency, purchased_at, release_at, released_at, status, release_error, release_attempts",
        )
        .order("purchased_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Historial de una publicación (creada, aprobada, vendida, entregada, expirada…). */
export function useListingHistory(id: string | null) {
  return useQuery({
    queryKey: ["listing-history", id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("game_account_events")
        .select("id, action, status_before, status_after, note, created_at")
        .eq("account_id", id!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Convierte rutas del almacén privado en URLs firmadas para mostrarlas. */
export function useSignedImages(paths: string[] | undefined) {
  const key = (paths ?? []).join("|");
  const [urls, setUrls] = useState<string[]>([]);

  useEffect(() => {
    const list = key ? key.split("|") : [];
    if (list.length === 0) {
      setUrls([]);
      return;
    }
    let cancelled = false;
    const remote = list.filter((path) => path.startsWith("http"));
    const stored = list.filter((path) => !path.startsWith("http"));
    if (stored.length === 0) {
      setUrls(remote);
      return;
    }
    void supabase.storage
      .from("listings")
      .createSignedUrls(stored, 3600)
      .then(({ data }) => {
        if (cancelled) return;
        const signed = (data ?? []).map((item) => item.signedUrl).filter(Boolean) as string[];
        setUrls([...signed, ...remote]);
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  return urls;
}

export function remainingLabel(expiresAt: string | null) {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "Publicación vencida";
  const hours = Math.ceil(ms / 3_600_000);
  if (hours < 24) return `Quedan ${hours} h de publicación`;
  return `Quedan ${Math.ceil(hours / 24)} día(s) de publicación`;
}

/** Cuenta atrás en horas y minutos hasta una fecha (24 h del comprador, 8 h del pago). */
export function useCountdown(target: string | null) {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!target) {
      setLabel(null);
      return;
    }
    function tick() {
      const ms = new Date(target!).getTime() - Date.now();
      if (ms <= 0) {
        setLabel("00:00:00");
        return;
      }
      const total = Math.floor(ms / 1000);
      const hours = String(Math.floor(total / 3600)).padStart(2, "0");
      const minutes = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
      const seconds = String(total % 60).padStart(2, "0");
      setLabel(`${hours}:${minutes}:${seconds}`);
    }
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [target]);

  return label;
}
