/**
 * FASE 2.6.2 — Sonda temporal de conectividad con zdSMS.
 * No envía ningún SMS y no usa ninguna credencial. Se elimina al terminar.
 */
import { createFileRoute } from "@tanstack/react-router";

async function probe(url: string, method: string) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(url, { method, signal: controller.signal });
    return {
      url,
      method,
      ok: true,
      status: response.status,
      ms: Date.now() - started,
      server: response.headers.get("server"),
    };
  } catch (error) {
    const err = error as Error;
    return {
      url,
      method,
      ok: false,
      ms: Date.now() - started,
      error: `${err.name}: ${err.message}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

export const Route = createFileRoute("/api/public/zdsms-probe")({
  server: {
    handlers: {
      GET: async () => {
        const results = [
          await probe("https://zdsms.cu/api", "GET"),
          await probe("https://zdsms.cu/api/v1/token", "GET"),
          await probe("https://zdsms.cu/", "GET"),
        ];
        return new Response(
          JSON.stringify(
            {
              runtime: typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
              credentialsConfigured: Boolean(
                process.env["ZDSMS_EMAIL"] || process.env["ZDSMS_PASSWORD"],
              ),
              results,
            },
            null,
            2,
          ),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
