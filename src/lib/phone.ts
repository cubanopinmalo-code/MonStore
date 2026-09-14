/**
 * Normalización única de teléfonos de MonStore (Cuba).
 *
 * Reglas:
 *  - Se conservan solo dígitos.
 *  - Se eliminan prefijos internacionales redundantes: 0053, 053, 53.
 *  - El resultado nacional es de 8 dígitos (móviles cubanos empiezan por 5).
 *  - `nationalPhone`  -> clave lógica interna, 8 dígitos, SIN 53.
 *  - `e164Phone`      -> formato de envío de SMS, +53XXXXXXXX.
 *  - `phoneToEmail`   -> identidad interna <telefono>@telefono.monstore.cu (sin 53).
 *
 * Así, +5351234567, 5351234567 y 51234567 producen SIEMPRE la misma identidad.
 */

export const PHONE_EMAIL_DOMAIN = "telefono.monstore.cu";

export function nationalPhone(input: string): string {
  let digits = (input || "").replace(/\D/g, "");
  if (digits.startsWith("0053")) digits = digits.slice(4);
  else if (digits.startsWith("053")) digits = digits.slice(3);
  else if (digits.length > 8 && digits.startsWith("53")) digits = digits.slice(2);
  return digits;
}

export function isValidCubanMobile(input: string): boolean {
  const national = nationalPhone(input);
  return /^5\d{7}$/.test(national);
}

export function e164Phone(input: string): string {
  return `+53${nationalPhone(input)}`;
}

export function phoneToEmailCanonical(input: string): string {
  return `${nationalPhone(input)}@${PHONE_EMAIL_DOMAIN}`;
}
