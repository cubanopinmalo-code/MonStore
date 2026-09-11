import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export const CATALOG_BUCKET = "catalog";
const SIGN_TTL_SECONDS = 60 * 60;

let cachedClient: SupabaseClient<Database> | null = null;

/**
 * Servidor local: cliente con la clave publicable (nunca la de servicio).
 * Respeta las reglas de acceso de la base de datos como rol anónimo.
 */
export function publishableClient(): SupabaseClient<Database> {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) {
    throw new Error("El backend todavía no tiene configurada la conexión de datos.");
  }
  if (cachedClient) return cachedClient;

  cachedClient = createClient<Database>(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });

  return cachedClient;
}

function isObjectPath(value: string): boolean {
  return value.length > 0 && !value.startsWith("http://") && !value.startsWith("https://");
}

/**
 * Las imágenes del catálogo viven en un espacio privado: se generan
 * direcciones temporales válidas una hora, y las URLs externas se dejan tal cual.
 */
export async function signCatalogImages(
  paths: Array<string | null | undefined>,
): Promise<Record<string, string>> {
  const unique = Array.from(
    new Set(
      paths.filter(
        (path): path is string => typeof path === "string" && path.length > 0 && isObjectPath(path),
      ),
    ),
  );
  const signed: Record<string, string> = {};
  if (unique.length === 0) return signed;

  const supabase = publishableClient();
  const { data, error } = await supabase.storage
    .from(CATALOG_BUCKET)
    .createSignedUrls(unique, SIGN_TTL_SECONDS);
  if (error || !data) return signed;

  data.forEach((entry, index) => {
    const path = unique[index];
    if (path && !entry.error && entry.signedUrl) signed[path] = entry.signedUrl;
  });
  return signed;
}

export function coverFor(
  path: string | null | undefined,
  signed: Record<string, string>,
  fallback = "",
): string {
  if (!path) return fallback;
  if (!isObjectPath(path)) return path;
  return signed[path] ?? fallback;
}
