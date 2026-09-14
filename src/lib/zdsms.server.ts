/**
 * FASE 2.6 — Cliente de zdSMS. SOLO SERVIDOR.
 *
 * El token vive exclusivamente en la variable de entorno ZDSMS_TOKEN del servidor.
 * Este archivo termina en `.server.ts`, por lo que el empaquetador impide que
 * llegue nunca al navegador.
 *
 * API oficial (confirmada): base https://zdsms.cu/api/v1
 *   POST /message/send   { recipient, mstext }  -> { id, ... }
 *   GET  /message/{id}/status
 * No existe endpoint de generación ni de verificación de OTP: la validación
 * del código es responsabilidad del backend de MonStore.
 */

const ZDSMS_BASE = "https://zdsms.cu/api/v1";

export interface SmsSendResult {
  /** true si el mensaje fue aceptado por el proveedor (o simulado). */
  ok: boolean;
  /** Identificador del mensaje del proveedor, si lo devuelve. */
  messageId: string | null;
  /** "real" cuando se usó la API; "mock" cuando no hay credencial configurada. */
  mode: "real" | "mock";
  /** Motivo del fallo, apto para registrar. Nunca contiene el código. */
  error?: string;
}

/** Envía un SMS. Si no hay credencial configurada, simula el envío (Fase 2.6). */
export async function sendSms(recipientE164: string, text: string): Promise<SmsSendResult> {
  const token = process.env["ZDSMS_TOKEN"];

  if (!token) {
    // Modo prueba: no se realiza ninguna llamada externa.
    return { ok: true, messageId: `mock-${crypto.randomUUID()}`, mode: "mock" };
  }

  try {
    const response = await fetch(`${ZDSMS_BASE}/message/send`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ recipient: recipientE164, mstext: text }),
    });

    if (!response.ok) {
      return {
        ok: false,
        messageId: null,
        mode: "real",
        error: `zdsms_http_${response.status}`,
      };
    }

    const payload = (await response.json()) as { id?: string | number };
    return {
      ok: true,
      messageId: payload.id != null ? String(payload.id) : null,
      mode: "real",
    };
  } catch {
    return { ok: false, messageId: null, mode: "real", error: "zdsms_unreachable" };
  }
}

/** Consulta el estado de un envío. Solo servidor. */
export async function getSmsStatus(messageId: string): Promise<unknown> {
  const token = process.env["ZDSMS_TOKEN"];
  if (!token) return { mode: "mock", id: messageId, status: "simulated" };
  const response = await fetch(`${ZDSMS_BASE}/message/${messageId}/status`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  return response.json();
}
