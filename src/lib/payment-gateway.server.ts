/**
 * FASE — GATEWAY DE PAGOS (iPhone + Atajos).
 *
 * Sólo servidor. Aquí vive:
 *  - la verificación de identidad del dispositivo (HMAC-SHA256 + antirreplay);
 *  - los intérpretes de los avisos (Transfermóvil y saldo móvil).
 *
 * El aviso del teléfono NUNCA se toma como verdad financiera: se interpreta y
 * después la base de datos decide, de forma atómica, si coincide con una
 * solicitud pendiente. El secreto compartido sólo se lee de la variable de
 * entorno y jamás se devuelve, registra ni compara en claro.
 */

/** Tolerancia de reloj entre el iPhone y MonStore. */
export const TIMESTAMP_TOLERANCE_SECONDS = 300;

export type GatewayChannel = "transfermovil" | "saldo_movil" | "desconocido";

export interface ParsedPayment {
  channel: GatewayChannel;
  /** Importe en CUP leído del aviso. */
  amount: number | null;
  /** Teléfono del remitente cuando el aviso lo incluye. */
  sender_phone: string | null;
  /** Cuenta/tarjeta o línea receptora. */
  destination: string | null;
  /** Referencia de la operación (Nro. Transacción). */
  reference: string | null;
  /** Fecha declarada en el aviso, tal como llega. */
  operation_date: string | null;
  /** Campos que el aviso no trae y bloquean la aprobación automática. */
  missing: string[];
}

function digits(value: string | null | undefined): string | null {
  const only = String(value ?? "").replace(/\D/g, "");
  return only.length > 0 ? only : null;
}

function amountFrom(text: string): number | null {
  const match = /de\s*([\d.,]+)\s*CUP/i.exec(text) ?? /([\d.,]+)\s*CUP/i.exec(text);
  if (!match?.[1]) return null;
  const normalized = match[1].replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
  const value = Number(normalized);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * Transfermóvil envía dos variantes: con el teléfono del titular y sin él.
 * La segunda no puede aprobarse automáticamente porque no identifica a quién pagó.
 */
export function parseTransfermovil(message: string): ParsedPayment | null {
  const text = message.replace(/\s+/g, " ").trim();
  const isTransfer = /transferencia/i.test(text) && /CUP/i.test(text);
  if (!isTransfer) return null;

  const sender = digits(/tel[eé]fono\s*(\d{6,})/i.exec(text)?.[1]);
  const destination = digits(/cuenta\s*([\d\s]{8,})/i.exec(text)?.[1]);
  const amount = amountFrom(text);
  const reference = /transacci[oó]n[:\s]*([A-Za-z0-9]{5,})/i.exec(text)?.[1]?.toUpperCase() ?? null;
  const operation_date = /fecha[:\s]*(\d{1,2}\/\d{1,2}\/\d{2,4})/i.exec(text)?.[1] ?? null;

  const missing: string[] = [];
  if (!sender) missing.push("sender_phone");
  if (!destination) missing.push("destination");
  if (amount === null) missing.push("amount");
  if (!reference) missing.push("reference");

  return {
    channel: "transfermovil",
    amount,
    sender_phone: sender,
    destination,
    reference,
    operation_date,
    missing,
  };
}

/**
 * Saldo móvil: el aviso indica desde qué número llegó el saldo y a qué línea.
 * Se mantiene tolerante porque el texto exacto lo fija la operadora.
 */
export function parseSaldoMovil(message: string): ParsedPayment | null {
  const text = message.replace(/\s+/g, " ").trim();
  if (!/saldo/i.test(text)) return null;

  const phones = text.match(/\b5\d{7}\b/g) ?? [];
  const amount = amountFrom(text);
  const sender = phones[0] ?? null;
  const destination = phones[1] ?? null;
  const reference = /transacci[oó]n[:\s]*([A-Za-z0-9]{5,})/i.exec(text)?.[1]?.toUpperCase() ?? null;

  const missing: string[] = [];
  if (!sender) missing.push("sender_phone");
  if (amount === null) missing.push("amount");

  return {
    channel: "saldo_movil",
    amount,
    sender_phone: sender,
    destination,
    reference,
    operation_date: /fecha[:\s]*(\d{1,2}\/\d{1,2}\/\d{2,4})/i.exec(text)?.[1] ?? null,
    missing,
  };
}

const UNKNOWN: ParsedPayment = {
  channel: "desconocido",
  amount: null,
  sender_phone: null,
  destination: null,
  reference: null,
  operation_date: null,
  missing: ["formato"],
};

/** Único punto de interpretación: si ningún intérprete reconoce el texto, va a revisión. */
export function parsePaymentMessage(message: string): ParsedPayment {
  return parseTransfermovil(message) ?? parseSaldoMovil(message) ?? UNKNOWN;
}

/* ------------------------------------------------------------------ *
 * Identidad del dispositivo
 * ------------------------------------------------------------------ */

export interface GatewayEventInput {
  event_id: string;
  device_id: string;
  event_type: string;
  received_at: string;
  sender: string;
  message: string;
  source: string;
}

/** Representación canónica firmada por el Atajo. */
export function canonicalString(
  timestamp: string,
  nonce: string,
  eventId: string,
  message: string,
): string {
  return `${timestamp}.${nonce}.${eventId}.${message}`;
}

export async function signCanonical(canonical: string, secret: string): Promise<string> {
  const { createHmac } = await import("node:crypto");
  return createHmac("sha256", secret).update(canonical, "utf8").digest("hex");
}

/** Comparación en tiempo constante de la firma recibida. */
export async function verifySignature(
  canonical: string,
  provided: string,
  secret: string,
): Promise<boolean> {
  const { createHash, timingSafeEqual } = await import("node:crypto");
  const expected = await signCanonical(canonical, secret);
  const hash = (value: string) => createHash("sha256").update(value, "utf8").digest();
  try {
    return timingSafeEqual(hash(provided.trim().toLowerCase()), hash(expected));
  } catch {
    return false;
  }
}

/** El timestamp debe estar dentro de la tolerancia, ni viejo ni futuro. */
export function timestampWithinTolerance(timestamp: string, nowMs = Date.now()): boolean {
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds) || seconds <= 0) return false;
  const diff = Math.abs(nowMs / 1000 - seconds);
  return diff <= TIMESTAMP_TOLERANCE_SECONDS;
}
