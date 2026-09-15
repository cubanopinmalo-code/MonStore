/**
 * FASE 2.6.1 — Mensajes de error del acceso por código SMS.
 *
 * El servidor solo devuelve un motivo corto y neutro; aquí se traduce a un
 * texto para la persona. Nunca se muestra información técnica del proveedor.
 */

export const OTP_MESSAGES: Record<string, string> = {
  // Entrada
  telefono_invalido: "Ese número no parece un móvil cubano válido.",
  datos_invalidos: "Revisa el número y el código de 6 cifras.",

  // Límites
  espera: "Espera unos segundos antes de pedir otro código.",
  limite_telefono: "Has alcanzado el límite de códigos SMS. Espera el tiempo indicado en pantalla.",
  limite_origen: "Demasiadas solicitudes desde esta conexión. Inténtalo más tarde.",
  tope_diario: "El servicio de mensajes alcanzó su límite de hoy. Inténtalo mañana.",

  // Código
  codigo_incorrecto: "El código no es correcto.",
  caducado: "El código ha caducado. Pide uno nuevo.",
  sin_codigo: "No hay ningún código pendiente. Pide uno nuevo.",
  bloqueado: "Demasiados intentos. Pide un código nuevo.",

  // Proveedor
  sms_no_enviado: "No pudimos enviar el código en este momento. Inténtalo nuevamente más tarde.",
  proveedor_sin_saldo:
    "No pudimos enviar el código en este momento. Inténtalo nuevamente más tarde.",
  proveedor_no_disponible:
    "No pudimos enviar el código en este momento. Inténtalo nuevamente más tarde.",
  numero_rechazado: "No pudimos enviar el mensaje a ese número.",

  // Cuenta
  cuenta_bloqueada:
    "Tu cuenta está bloqueada. Escribe a atención al cliente para revisar tu caso.",

  registro_cerrado:
    "El registro de cuentas nuevas no está disponible ahora mismo. Si ya tienes cuenta, puedes entrar con tu número.",

  // Sesión
  alta_fallida: "No pudimos completar el acceso. Inténtalo nuevamente.",
  sesion_no_emitida: "No pudimos completar el acceso. Inténtalo nuevamente.",
};

export function otpMessage(reason: string | undefined): string {
  return (reason && OTP_MESSAGES[reason]) || "Algo no salió bien. Inténtalo nuevamente.";
}
