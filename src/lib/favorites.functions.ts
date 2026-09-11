import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** IDs de los juegos marcados como favoritos por el cliente actual. */
export const listFavoriteGameIds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<string[]> => {
    const { data, error } = await context.supabase
      .from("user_favorite_games")
      .select("game_id");
    if (error) throw new Error("No se pudieron cargar tus favoritos.");
    return (data ?? []).map((row) => row.game_id);
  });

/** Marca o desmarca un juego como favorito. Devuelve el estado final. */
export const toggleFavoriteGame = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { gameId: string }) => {
    if (typeof data?.gameId !== "string" || data.gameId.length === 0) {
      throw new Error("No se indicó el juego.");
    }
    return { gameId: data.gameId };
  })
  .handler(async ({ data, context }): Promise<{ favorite: boolean }> => {
    const { data: existing } = await context.supabase
      .from("user_favorite_games")
      .select("id")
      .eq("game_id", data.gameId)
      .eq("user_id", context.userId)
      .maybeSingle();

    if (existing) {
      const { error } = await context.supabase
        .from("user_favorite_games")
        .delete()
        .eq("id", existing.id);
      if (error) throw new Error("No se pudo quitar de favoritos.");
      return { favorite: false };
    }

    const { error } = await context.supabase
      .from("user_favorite_games")
      .insert({ game_id: data.gameId, user_id: context.userId });
    if (error) throw new Error("No se pudo agregar a favoritos.");
    return { favorite: true };
  });

/** IDs de los juegos más recargados por los clientes (populares). */
export const listPopularGameIds = createServerFn({ method: "GET" }).handler(
  async (): Promise<string[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("top_recharged_games", { _limit: 3 });
    if (error) return [];
    return (data ?? []).map((row: { game_id: string }) => row.game_id);
  },
);
