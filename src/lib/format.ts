export type DisplayCurrency = "CUP" | "SALDO";

export const DEFAULT_SALDO_RATE = 2.8;

/**
 * Estado global de visualización. El CUP siempre es la moneda base: los importes
 * guardados en la base de datos están en CUP y solo se convierten al mostrarlos.
 */
let displayCurrency: DisplayCurrency = "CUP";
let saldoRate = DEFAULT_SALDO_RATE;

export function setMoneyDisplay(currency: DisplayCurrency, rate: number) {
  displayCurrency = currency;
  saldoRate = rate > 0 ? rate : DEFAULT_SALDO_RATE;
}

export function getMoneyDisplay() {
  return { currency: displayCurrency, rate: saldoRate };
}

function formatNumber(amount: number): string {
  return new Intl.NumberFormat("es-CU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/** Importe siempre en CUP (paneles internos, cálculos base). */
export function formatBaseCUP(amount: number): string {
  return `${formatNumber(amount)} CUP`;
}

/** Importe expresado en saldo móvil, sin depender de la moneda elegida. */
export function formatSaldo(amount: number): string {
  return `${formatNumber(amount)} saldo`;
}

/** CUP → saldo móvil: se divide entre la base de conversión actual. */
export function cupToSaldo(amountCup: number, rate = saldoRate): number {
  return rate > 0 ? amountCup / rate : amountCup;
}

/** Saldo móvil → CUP: se multiplica por la base de conversión actual. */
export function saldoToCup(amountSaldo: number, rate = saldoRate): number {
  return amountSaldo * (rate > 0 ? rate : DEFAULT_SALDO_RATE);
}

/** Importe mostrado al cliente en la moneda que eligió. */
export function formatCUP(amount: number): string {
  if (displayCurrency === "SALDO") {
    return `${formatNumber(cupToSaldo(amount))} saldo`;
  }
  return formatBaseCUP(amount);
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function marginPct(cost: number, price: number): string {
  if (cost <= 0) return "—";
  return `${(((price - cost) / cost) * 100).toFixed(0)}%`;
}
