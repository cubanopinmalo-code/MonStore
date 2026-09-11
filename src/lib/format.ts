export function formatCUP(amount: number): string {
  return `${new Intl.NumberFormat("es-CU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)} CUP`;
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
