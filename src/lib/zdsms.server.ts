/**
 * FASE 2.6.1 — Cliente de zdSMS. SOLO SERVIDOR.
 *
 * Credenciales: ZDSMS_EMAIL y ZDSMS_PASSWORD, leídas SIEMPRE dentro del
 * manejador. Nunca viajan al navegador, nunca se registran, nunca aparecen en
 * respuestas. Este archivo termina en `.server.ts`, por lo que el empaquetador
 * impide que llegue al navegador.
 *
 * API oficial (confirmada, no se inventa ningún endpoint): base https://zdsms.cu/api
 *   POST /v1/token                { email, password } -> token
 *   POST /v1/message/send         { recipient, mstext } -> { id, ... }
 *   GET  /v1/message/{id}/status
 * No existe endpoint de generación ni de verificación de OTP: la validación
 * del código es responsabilidad exclusiva del backend de MonStore.
 */

const ZDSMS_BASE = "https://zdsms.cu/api";
const REQUEST_TIMEOUT_MS = 15_000;

export type SmsErrorCode =
  | "sin_credenciales"
  | "auth_fallida"
  | "sin_saldo"
  | "numero_rechazado"
  | "rate_limit_proveedor"
  | "timeout"
  | "proveedor_no_disponible"
  | "envio_fallido";

export interface SmsSendResult {
  /** true si el mensaje fue aceptado por el proveedor (o simulado). */
  ok: boolean;
  /** Identificador del mensaje del proveedor, si lo devuelve. */
  messageId: string | null;
  /** "real" cuando se usó la API; "mock" cuando no hay credenciales configuradas. */
  mode: "real" | "mock";
  /** Motivo del fallo, apto para registrar. Nunca contiene el código ni las credenciales. */
  error?: SmsErrorCode;
  /** Código HTTP devuelto por el proveedor, para diagnóstico interno. */
  status?: number;
}

function credentials(): { email: string; password: string } | null {
  const email = process.env["ZDSMS_EMAIL"];
  const password = process.env["ZDSMS_PASSWORD"];
  if (!email || !password) return null;
  return { email, password };
}

async function withTimeout(input: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Token en memoria del proceso; nunca se persiste ni se devuelve al navegador. */
let cachedToken: { value: string; expiresAt: number } | null = null;

async function getToken(): Promise<{ token: string } | { error: SmsErrorCode; status?: number }> {
  const creds = credentials();
  if (!creds) return { error: "sin_credenciales" };
  if (cachedToken && cachedToken.expiresAt > Date.now()) return { token: cachedToken.value };

  try {
    const response = await withTimeout(`${ZDSMS_BASE}/v1/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ email: creds.email, password: creds.password }),
    });
    if (!response.ok) {
      return { error: response.status === 401 ? "auth_fallida" : "proveedor_no_disponible", status: response.status };
    }
    const payload = (await response.json()) as { token?: string; access_token?: string };
    const token = payload.token ?? payload.access_token;
    if (!token) return { error: "auth_fallida" };
    cachedToken = { value: token, expiresAt: Date.now() + 30 * 60_000 };
    return { token };
  } catch (error) {
    return { error: (error as Error)?.name === "AbortError" ? "timeout" : "proveedor_no_disponible" };
  }
}

function mapSendError(status: number, body: string): SmsErrorCode {
  if (status === 401 || status === 403) return "auth_fallida";
  if (status === 429) return "rate_limit_proveedor";
  if (status === 422 || status === 400) {
    return /saldo|balance|credit/i.test(body) ? "sin_saldo" : "numero_rechazado";
  }
  if (status === 402) return "sin_saldo";
  if (status >= 500) return "proveedor_no_disponible";
  return "envio_fallido";
}

async function postMessage(
  token: string,
  recipientE164: string,
  text: string,
): Promise<SmsSendResult> {
  try {
    const response = await withTimeout(`${ZDSMS_BASE}/v1/message/send`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ recipient: recipientE164, mstext: text }),
    });

    if (!response.ok) {
      if (response.status === 401) cachedToken = null;
      const body = await response.text().catch(() => "");
      return {
        ok: false,
        messageId: null,
        mode: "real",
        error: mapSendError(response.status, body),
        status: response.status,
      };
    }

    // Respuesta inválida (no JSON o sin cuerpo esperado) se trata como fallo.
    const payload = (await response.json().catch(() => null)) as { id?: string | number } | null;
    if (payload == null || typeof payload !== "object") {
      return { ok: false, messageId: null, mode: "real", error: "envio_fallido", status: response.status };
    }
    return { ok: true, messageId: payload.id != null ? String(payload.id) : null, mode: "real" };
  } catch (error) {
    return {
      ok: false,
      messageId: null,
      mode: "real",
      error: (error as Error)?.name === "AbortError" ? "timeout" : "proveedor_no_disponible",
    };
  }
}

/** Envía un SMS. Sin credenciales configuradas, simula el envío (no hay llamada externa). */
export async function sendSms(recipientE164: string, text: string): Promise<SmsSendResult> {
  const auth = await getToken();

  if ("error" in auth) {
    if (auth.error === "sin_credenciales") {
      return { ok: true, messageId: `mock-${crypto.randomUUID()}`, mode: "mock" };
    }
    return { ok: false, messageId: null, mode: "real", error: auth.error, ...(auth.status ? { status: auth.status } : {}) };
  }

  const first = await postMessage(auth.token, recipientE164, text);
  if (first.ok || first.error !== "auth_fallida") return first;

  // Token caducado: se renueva UNA vez y se reintenta. El token nunca sale del servidor.
  const renewed = await getToken();
  if ("error" in renewed) {
    return { ok: false, messageId: null, mode: "real", error: renewed.error };
  }
  return postMessage(renewed.token, recipientE164, text);
}

/** Consulta el estado de un envío. Solo servidor. */
export async function getSmsStatus(messageId: string): Promise<unknown> {
  const auth = await getToken();
  if ("error" in auth) return { mode: "mock", id: messageId, status: "simulated" };
  const response = await withTimeout(`${ZDSMS_BASE}/v1/message/${messageId}/status`, {
    method: "GET",
    headers: { Authorization: `Bearer ${auth.token}`, Accept: "application/json" },
  });
  return response.json();
}

/** Comprobación de alcance de red al proveedor. No envía ningún mensaje. */
export async function probeZdsms(): Promise<{ reachable: boolean; detail: string }> {
  try {
    const response = await withTimeout(`${ZDSMS_BASE}/v1/token`, { method: "OPTIONS" });
    return { reachable: true, detail: `http_${response.status}` };
  } catch (error) {
    const name = (error as Error)?.name;
    return { reachable: false, detail: name === "AbortError" ? "timeout" : "inalcanzable" };
  }
}
