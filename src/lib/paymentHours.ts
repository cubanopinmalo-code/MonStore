// Horario en el que el equipo revisa y aprueba los pagos. Se expresa en hora de Cuba
// para que el aviso sea el mismo sin importar desde dónde abra la app el cliente.
export const VERIFICATION_TZ = "America/Havana";
export const VERIFICATION_START_HOUR = 8; // 8:00 a. m.
export const VERIFICATION_END_HOUR = 22; // 10:00 p. m.

export const VERIFICATION_WINDOW_LABEL = "8:00 a. m. a 10:00 p. m.";

export interface VerificationClock {
  hour: number;
  minute: number;
  open: boolean;
  /** Cuándo se revisará una solicitud enviada ahora. */
  nextReview: string;
}

export function getVerificationClock(now: Date = new Date()): VerificationClock {
  const parts = new Intl.DateTimeFormat("es-ES", {
    timeZone: VERIFICATION_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "0");
  // Algunos navegadores devuelven "24" a medianoche: se normaliza a 0.
  const hour = read("hour") % 24;
  const minute = read("minute");
  const open = hour >= VERIFICATION_START_HOUR && hour < VERIFICATION_END_HOUR;
  const nextReview =
    hour >= VERIFICATION_END_HOUR ? "mañana a las 8:00 a. m." : "hoy a las 8:00 a. m.";
  return { hour, minute, open, nextReview };
}

/** Frase lista para mostrar al cliente antes o después de enviar una solicitud. */
export function verificationNotice(clock: VerificationClock = getVerificationClock()): string {
  return clock.open
    ? `Verificamos los pagos de ${VERIFICATION_WINDOW_LABEL} (hora de Cuba). Te avisamos en cuanto se acrediten.`
    : `Verificamos los pagos de ${VERIFICATION_WINDOW_LABEL} (hora de Cuba). Envías fuera de ese horario, se revisa ${clock.nextReview}.`;
}
