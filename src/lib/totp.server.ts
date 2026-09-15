import { createHmac, randomBytes } from "node:crypto";

/**
 * Doble factor de la CUENTA DEL JUEGO que se vende.
 * No tiene ninguna relación con el acceso a MonStore ni con el código por SMS.
 * Los códigos de 6 dígitos nunca se almacenan: se calculan aquí, en el servidor.
 */

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const TOTP_PERIOD = 30;

/** Genera una clave nueva en el formato que aceptan Google Authenticator y similares. */
export function generateTotpSecret(length = 32): string {
  const bytes = randomBytes(length);
  let out = "";
  for (const byte of bytes) out += ALPHABET[byte % 32];
  return out;
}

export function normalizeSecret(secret: string): string {
  return secret.replace(/[\s-]/g, "").replace(/=+$/, "").toUpperCase();
}

function base32Decode(secret: string): Buffer {
  const clean = normalizeSecret(secret);
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const index = ALPHABET.indexOf(char);
    if (index === -1) continue;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((value >>> bits) & 0xff);
    }
  }
  return Buffer.from(out);
}

/** Código actual de 6 dígitos y segundos que le quedan de vida. */
export function totpNow(secret: string, at: number = Date.now()) {
  const key = base32Decode(secret);
  if (key.length === 0) return null;
  const counter = Math.floor(at / 1000 / TOTP_PERIOD);
  const buffer = Buffer.alloc(8);
  buffer.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  buffer.writeUInt32BE(counter % 2 ** 32, 4);
  const digest = createHmac("sha1", key).update(buffer).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    ((digest[offset + 1]! & 0xff) << 16) |
    ((digest[offset + 2]! & 0xff) << 8) |
    (digest[offset + 3]! & 0xff);
  const code = String(binary % 1_000_000).padStart(6, "0");
  const secondsLeft = TOTP_PERIOD - Math.floor((at / 1000) % TOTP_PERIOD);
  return { code, secondsLeft, period: TOTP_PERIOD };
}

/** Enlace estándar para configurar la app de autenticación (QR). */
export function totpUri(secret: string, label: string, issuer = "MONSTORE"): string {
  const account = encodeURIComponent(label || "Cuenta del juego");
  return `otpauth://totp/${encodeURIComponent(issuer)}:${account}?secret=${normalizeSecret(
    secret,
  )}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${TOTP_PERIOD}`;
}
