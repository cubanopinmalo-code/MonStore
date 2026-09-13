import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useAccount";

export const DEFAULT_LISTING_FEE_PER_DAY = 150;

const LISTING_FIELDS =
  "id, seller_id, seller_name, game_id, title, region, platform, price, currency, images, status, rejection_reason, duration_days, publish_fee, published_at, expires_at, created_at, games(name)";

/** Tarifa diaria de publicación configurada por el administrador. */
export function useListingFee() {
  return useQuery({
    queryKey: ["listing-fee"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_settings")
        .select("listing_fee_per_day")
        .maybeSingle();
      if (error) throw error;
      return Number(data?.listing_fee_per_day ?? DEFAULT_LISTING_FEE_PER_DAY);
    },
  });
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

export function useAdminListings() {
  return useQuery({
    queryKey: ["listings-admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("game_accounts")
        .select(LISTING_FIELDS)
        .order("created_at", { ascending: false })
        .limit(100);
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
