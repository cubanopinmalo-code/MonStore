import type { DeliveryMethod } from "@/types";

/**
 * Etiquetas del tipo de entrega.
 *
 * via_id: recarga automática con el ID del jugador.
 * codigo: producto automático que entrega un código o tarjeta.
 * via_cuenta: reservado al comercio de cuentas entre usuarios.
 */
export function deliveryLabel(method: DeliveryMethod | string | null | undefined): string {
  if (method === "via_id") return "Por ID";
  if (method === "via_cuenta") return "Por cuenta";
  return "Por código";
}

export function deliveryLongLabel(method: DeliveryMethod | string | null | undefined): string {
  if (method === "via_id") return "Entrega por ID del jugador";
  if (method === "via_cuenta") return "Entrega accediendo a la cuenta";
  return "Entrega de código o tarjeta";
}
