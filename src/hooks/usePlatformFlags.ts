import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PlatformFlags {
  maintenance: boolean;
  registrationOpen: boolean;
  marketplaceEnabled: boolean;
}

const DEFAULTS: PlatformFlags = {
  maintenance: false,
  registrationOpen: true,
  marketplaceEnabled: true,
};

/**
 * Interruptores globales que el administrador controla en Configuración.
 * La aplicación los usa para la presentación; el bloqueo real de operaciones
 * nuevas lo garantiza la base de datos, no esta lectura.
 */
export function usePlatformFlags() {
  return useQuery<PlatformFlags>({
    queryKey: ["platform-flags"],
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_settings")
        .select("maintenance_mode, registration_open, marketplace_enabled")
        .maybeSingle();
      if (error) return DEFAULTS;
      return {
        maintenance: Boolean(data?.maintenance_mode),
        registrationOpen: data?.registration_open !== false,
        marketplaceEnabled: data?.marketplace_enabled !== false,
      };
    },
  });
}
