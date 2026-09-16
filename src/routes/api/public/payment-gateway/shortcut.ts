/**
 * Entrada del gateway de pagos: el iPhone (Atajos) envía aquí cada aviso.
 *
 * Seguridad: firma HMAC-SHA256 sobre `timestamp.nonce.event_id.message`,
 * ventana de tiempo, nonce y event_id de un solo uso (unicidad en la base de
 * datos). El contenido financiero del mensaje se interpreta en el servidor y la
 * decisión (aprobar / revisar) la toma la base de datos en una sola operación.
 */
import { createFileRoute } from "@tanstack/react-router";

interface Body {
  event_id?: unknown;
  device_id?: unknown;
  event_type?: unknown;
  received_at?: unknown;
  sender?: unknown;
  message?: unknown;
  source?: unknown;
}

function bad(reason: string, status = 400) {
  return Response.json({ accepted: false, reason }, { status });
}

export const Route = createFileRoute("/api/public/payment-gateway/shortcut")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["PAYMENT_GATEWAY_SECRET"];
        const allowedDevices = String(process.env["PAYMENT_GATEWAY_DEVICES"] ?? "")
          .split(/[,\s]+/)
          .filter(Boolean);
        if (!secret) {
          return Response.json(
            { accepted: false, reason: "El gateway todavía no está configurado." },
            { status: 503 },
          );
        }

        const raw = await request.text();
        let body: Body;
        try {
          body = JSON.parse(raw) as Body;
        } catch {
          return bad("Cuerpo inválido.");
        }

        const eventId = String(body.event_id ?? "").trim();
        const deviceId = String(body.device_id ?? "").trim();
        const message = String(body.message ?? "");
        const timestamp = (request.headers.get("x-monstore-timestamp") ?? "").trim();
        const nonce = (request.headers.get("x-monstore-nonce") ?? "").trim();
        const signature = (request.headers.get("x-monstore-signature") ?? "").trim();

        if (!eventId || !deviceId || !message) return bad("Faltan datos del evento.");
        if (!timestamp || !nonce || !signature) return bad("Falta la firma del dispositivo.", 401);
        if (allowedDevices.length > 0 && !allowedDevices.includes(deviceId)) {
          return bad("Dispositivo no autorizado.", 401);
        }

        const gateway = await import("@/lib/payment-gateway.server");
        if (!gateway.timestampWithinTolerance(timestamp)) {
          return bad("La marca de tiempo está fuera de la ventana permitida.", 401);
        }
        const canonical = gateway.canonicalString(timestamp, nonce, eventId, message);
        if (!(await gateway.verifySignature(canonical, signature, secret))) {
          return bad("Firma inválida.", 401);
        }

        const parsed = gateway.parsePaymentMessage(message);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.rpc("gateway_process_event" as never, {
          p_payload: {
            event_id: eventId,
            device_id: deviceId,
            event_type: String(body.event_type ?? "sms"),
            source: String(body.source ?? "shortcuts"),
            nonce,
            received_at: String(body.received_at ?? new Date().toISOString()),
            sender: String(body.sender ?? ""),
            message,
            channel: parsed.channel,
            parsed,
          },
        } as never);

        if (error) {
          // No se filtran detalles internos al dispositivo.
          console.error("[gateway] proceso fallido", error.message);
          return Response.json({ accepted: false, reason: "No se pudo procesar." }, { status: 500 });
        }

        const result = (data ?? {}) as Record<string, unknown>;
        return Response.json({
          accepted: true,
          duplicate: Boolean(result["duplicate"]),
          status: String(result["status"] ?? ""),
          outcome: String(result["outcome"] ?? ""),
          reason: String(result["reason"] ?? ""),
          mode: String(result["mode"] ?? ""),
        });
      },
    },
  },
});
