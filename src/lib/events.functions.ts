import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

type Ctx = { supabase: SupabaseClient<Database>; userId: string };

async function requireAdmin({ supabase, userId }: Ctx): Promise<void> {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error) throw new Error("No se pudo verificar tu permiso de administración.");
  if (!data) throw new Error("Solo el administrador puede usar esta función.");
}

export type StartEventResult = {
  ok: boolean;
  already: boolean;
  sms_sent: number;
  sms_failed: number;
};

/**
 * Marca un evento como INICIADO y avisa por mensaje de texto SOLO a los
 * inscritos confirmados. El envío usa el relay propio de MonStore (nunca el
 * proveedor directo, nunca desde el navegador) y es idempotente: la base de
 * datos registra un envío por participante y repetir la acción no reenvía nada.
 */
export const startEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { eventId: string }) => {
    const eventId = String(data?.eventId ?? "");
    if (!eventId) throw new Error("Falta el evento.");
    return { eventId };
  })
  .handler(async ({ data, context }): Promise<StartEventResult> => {
    await requireAdmin(context);

    const { data: row, error } = await context.supabase.rpc("admin_start_event", {
      p_event: data.eventId,
    });
    if (error) throw new Error(error.message || "No pudimos iniciar el evento.");

    const payload = (row ?? {}) as Record<string, unknown>;
    const already = payload["already"] === true;
    const eventName = String(payload["event_name"] ?? "");
    const messages = Array.isArray(payload["messages"])
      ? (payload["messages"] as Array<{ id: string; user_id: string; phone: string }>)
      : [];

    const { sendOtpSms } = await import("./sms-relay.server");
    const text = `El evento ${eventName} ya comenzó. Entra a MonStore para continuar.`;

    let sent = 0;
    let failed = 0;
    for (const message of messages) {
      const phone = String(message.phone ?? "").trim();
      if (!phone) {
        await context.supabase.rpc("mark_event_sms", {
          p_id: message.id,
          p_status: "error",
          p_provider_id: "",
          p_error: "sin_telefono",
        });
        failed += 1;
        continue;
      }
      const result = await sendOtpSms(phone, text, message.id);
      await context.supabase.rpc("mark_event_sms", {
        p_id: message.id,
        p_status: result.ok ? "enviado" : "error",
        p_provider_id: result.ok ? (result.messageId ?? "") : "",
        p_error: result.ok ? "" : String(result.error ?? "envio_fallido"),
      });
      if (result.ok) sent += 1;
      else failed += 1;
    }

    return { ok: true, already, sms_sent: sent, sms_failed: failed };
  });
