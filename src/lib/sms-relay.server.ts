/**
 * Cliente del RELAY de SMS. SOLO SERVIDOR.
 *
 * Este módulo NO genera, NO guarda y NO valida códigos OTP: eso sigue siendo
 * responsabilidad exclusiva de MonStore (src/lib/otp.functions.ts). Aquí solo
 * se pide a un relay externo con salida hacia Cuba que entregue un SMS.
 *
 * Contrato del relay:
 *   POST {RELAY_URL}/sms/send
 *   headers: x-monstore-timestamp, x-monstore-nonce, x-monstore-signature
 *   body:    { request_id, recipient, message }
 *   firma:   HMAC_SHA256_HEX(`${timestamp}.${nonce}.${requestId}.${recipient}.${message}`,
 *                            RELAY_SHARED_SECRET)
 *
 * `recipient` va en formato cubano sin símbolos: 535XXXXXXXX.
 *
 * Secretos (leídos SIEMPRE dentro de la función, nunca en el módulo):
 *   RELAY_URL, RELAY_SHARED_SECRET. Nunca viajan al navegador ni a los logs.
 *   Las credenciales de zdSMS NO se usan aquí: viven solo en el relay.
 */

import type { SmsSendResult, SmsErrorCode } from "./zdsms.server";
import { nationalPhone } from "./phone";

const RELAY_TIMEOUT_MS = 20_000;

function relayConfig(): { url: string; secret: string } | null {
  const url = process.env["RELAY_URL"];
  const secret = process.env["RELAY_SHARED_SECRET"];
  if (!url || !secret) return null;
  return { url: url.replace(/\/+$/, ""), secret };
}

/** true cuando el relay está configurado (envío real disponible). */
export function relayEnabled(): boolean {
  return relayConfig() != null;
}

/** Formato exigido por el relay: 535XXXXXXXX (sin +, sin 00, sin espacios). */
export function relayRecipient(phone: string): string {
  return `53${nationalPhone(phone)}`;
}

function mapRelayError(code: string | undefined): SmsErrorCode {
  switch ((code ?? "").toUpperCase()) {
    case "AUTH_FAILED":
    case "PROVIDER_AUTH_FAILED":
    case "INVALID_SIGNATURE":
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

/** HMAC_SHA256 hexadecimal del payload canónico exacto del relay. */
async function signCanonical(secret: string, canonical: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(canonical)));
}

interface RelayResponse {
  success?: boolean;
  ok?: boolean;
  request_id?: string;
  provider_message_id?: string | number | null;
  message_id?: string | number | null;
  error_code?: string;
  error?: string;
}

/**
 * Única entrada de envío de SMS de OTP.
 *
 * Un solo intento por llamada (sin reintentos automáticos) para no producir
 * SMS duplicados; la idempotencia queda garantizada por `request_id`.
 * Sin relay configurado NO se simula: se devuelve fallo controlado.
 */
export async function sendOtpSms(
  phone: string,
  message: string,
  requestId: string = crypto.randomUUID(),
): Promise<SmsSendResult> {
  const config = relayConfig();
  if (!config) {
    return { ok: false, messageId: null, mode: "real", error: "proveedor_no_disponible" };
  }

  const recipient = relayRecipient(phone);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = crypto.randomUUID();
  const signature = await signCanonical(
    config.secret,
    `${timestamp}.${nonce}.${requestId}.${recipient}.${message}`,
  );

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RELAY_TIMEOUT_MS);
  try {
    const response = await fetch(`${config.url}/sms/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "x-monstore-timestamp": timestamp,
        "x-monstore-nonce": nonce,
        "x-monstore-signature": signature,
      },
      body: JSON.stringify({ request_id: requestId, recipient, message }),
      signal: controller.signal,
    });

    const parsed = (await response.json().catch(() => null)) as RelayResponse | null;

    if (!response.ok || parsed == null || typeof parsed !== "object") {
      return {
        ok: false,
        messageId: null,
        mode: "real",
        error: parsed?.error_code
          ? mapRelayError(parsed.error_code)
          : response.status >= 500
            ? "proveedor_no_disponible"
            : "envio_fallido",
        status: response.status,
      };
    }

    const accepted = parsed.success === true || parsed.ok === true;
    if (!accepted) {
      return {
        ok: false,
        messageId: null,
        mode: "real",
        error: mapRelayError(parsed.error_code ?? parsed.error),
        status: response.status,
      };
    }

    const id = parsed.provider_message_id ?? parsed.message_id ?? null;
    return { ok: true, messageId: id != null ? String(id) : requestId, mode: "real" };
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
