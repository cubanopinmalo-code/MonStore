/**
 * FASE 2.17 — Cliente del RELAY de SMS. SOLO SERVIDOR.
 *
 * Este módulo NO cambia el sistema OTP: no genera, no guarda y no valida
 * códigos. Su única responsabilidad es pedir a un relay externo (situado en una
 * infraestructura con conectividad hacia zdsms.cu) que entregue un SMS.
 *
 * Estado: PREPARADO PERO INACTIVO. Mientras `RELAY_URL` y `RELAY_SHARED_SECRET`
 * no estén configurados, `sendOtpSms()` delega en el envío directo actual
 * (`sendSms`), de modo que el comportamiento de producción no cambia.
 *
 * Las credenciales ZDSMS_EMAIL / ZDSMS_PASSWORD no se usan aquí y no deben
 * viajar nunca al relay: el relay las tiene en su propio entorno.
 */

import { sendSms, type SmsSendResult, type SmsErrorCode } from "./zdsms.server";

const RELAY_TIMEOUT_MS = 20_000;
/** Ventana temporal aceptada por el relay para la firma (segundos). */
export const RELAY_TIMESTAMP_WINDOW_SECONDS = 120;

/** Configuración leída SIEMPRE dentro del manejador, nunca en el módulo. */
function relayConfig(): { url: string; secret: string } | null {
  const url = process.env["RELAY_URL"];
  const secret = process.env["RELAY_SHARED_SECRET"];
  if (!url || !secret) return null;
  return { url: url.replace(/\/+$/, ""), secret };
}

/** true cuando el relay está configurado y se usará en lugar del envío directo. */
export function relayEnabled(): boolean {
  return relayConfig() != null;
}

interface RelayPayload {
  recipient: string;
  message: string;
  request_id: string;
  timestamp: string;
  nonce: string;
}

interface RelayResponse {
  success?: boolean;
  request_id?: string;
  provider_message_id?: string | number | null;
  error_code?: string;
  timestamp?: string;
}

/** Códigos del relay -> vocabulario interno ya existente de MonStore. */
function mapRelayError(code: string | undefined): SmsErrorCode {
  switch ((code ?? "").toUpperCase()) {
    case "AUTH_FAILED":
    case "PROVIDER_AUTH_FAILED":
      return "auth_fallida";
    case "NO_BALANCE":
      return "sin_saldo";
    case "RECIPIENT_REJECTED":
      return "numero_rechazado";
    case "RATE_LIMITED":
    case "PROVIDER_RATE_LIMITED":
      return "rate_limit_proveedor";
    case "TIMEOUT":
      return "timeout";
    case "PROVIDER_UNAVAILABLE":
    case "RELAY_UNAVAILABLE":
      return "proveedor_no_disponible";
    default:
      return "envio_fallido";
  }
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** HMAC_SHA256(secret, `${timestamp}.${nonce}.${body}`) en hexadecimal. */
async function signRequest(
  secret: string,
  timestamp: string,
  nonce: string,
  body: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${nonce}.${body}`),
  );
  return toHex(signature);
}

async function postToRelay(
  config: { url: string; secret: string },
  payload: RelayPayload,
): Promise<SmsSendResult> {
  const body = JSON.stringify(payload);
  const signature = await signRequest(config.secret, payload.timestamp, payload.nonce, body);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RELAY_TIMEOUT_MS);
  try {
    const response = await fetch(`${config.url}/sms/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Monstore-Signature": `v1=${signature}`,
        "X-Monstore-Timestamp": payload.timestamp,
        "X-Monstore-Nonce": payload.nonce,
        "X-Monstore-Request-Id": payload.request_id,
      },
      body,
      signal: controller.signal,
    });

    // 409 = mismo request_id/nonce ya procesado: NO se reintenta, no se duplica SMS.
    const parsed = (await response.json().catch(() => null)) as RelayResponse | null;

    if (!response.ok || parsed == null || typeof parsed !== "object") {
      return {
        ok: false,
        messageId: null,
        mode: "real",
        error: parsed?.error_code ? mapRelayError(parsed.error_code) : "proveedor_no_disponible",
        status: response.status,
      };
    }

    if (parsed.success !== true) {
      return {
        ok: false,
        messageId: null,
        mode: "real",
        error: mapRelayError(parsed.error_code),
        status: response.status,
      };
    }

    return {
      ok: true,
      messageId: parsed.provider_message_id != null ? String(parsed.provider_message_id) : null,
      mode: "real",
    };
  } catch (error) {
    return {
      ok: false,
      messageId: null,
      mode: "real",
      error: (error as Error)?.name === "AbortError" ? "timeout" : "proveedor_no_disponible",
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Única entrada de envío de SMS de OTP.
 *
 * - Relay configurado: firma la petición y la envía al relay. Un solo reintento,
 *   con el MISMO `request_id`, y solo cuando no hubo respuesta del relay
 *   (timeout o 5xx); la idempotencia del relay evita el SMS duplicado.
 * - Relay no configurado: comportamiento actual sin cambios (envío directo).
 */
export async function sendOtpSms(
  recipientE164: string,
  message: string,
  requestId: string = crypto.randomUUID(),
): Promise<SmsSendResult> {
  const config = relayConfig();
  if (!config) return sendSms(recipientE164, message);

  const payload: RelayPayload = {
    recipient: recipientE164,
    message,
    request_id: requestId,
    timestamp: new Date().toISOString(),
    nonce: toHex(crypto.getRandomValues(new Uint8Array(16)).buffer),
  };

  const first = await postToRelay(config, payload);
  if (first.ok) return first;

  const retryable =
    first.error === "timeout" ||
    (first.error === "proveedor_no_disponible" && (first.status ?? 500) >= 500);
  if (!retryable) return first;

  await new Promise((resolve) => setTimeout(resolve, 2_000));
  // Mismo request_id: si el primer intento llegó a enviarse, el relay devuelve
  // el resultado anterior en lugar de mandar un segundo SMS.
  return postToRelay(config, {
    ...payload,
    timestamp: new Date().toISOString(),
    nonce: toHex(crypto.getRandomValues(new Uint8Array(16)).buffer),
  });
}
