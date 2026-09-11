import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Tone = "success" | "warning" | "danger" | "info" | "neutral";

const TONES: Record<string, Tone> = {
  completado: "success",
  aprobado: "success",
  aprobada: "success",
  activo: "success",
  activa: "success",
  disponible: "success",
  procesando: "info",
  vendida: "info",
  registrado: "info",
  pendiente: "warning",
  desactivada: "neutral",
  inactivo: "neutral",
  cancelado: "neutral",
  suspendido: "danger",
  error: "danger",
  rechazado: "danger",
  rechazada: "danger",
  reembolsado: "info",
  "no disponible": "danger",
};

const toneClass: Record<Tone, string> = {
  success: "border-success/30 bg-success/12 text-success",
  warning: "border-warning/30 bg-warning/12 text-warning",
  danger: "border-destructive/30 bg-destructive/12 text-destructive",
  info: "border-info/30 bg-info/12 text-info",
  neutral: "border-border bg-muted text-muted-foreground",
};

const dotClass: Record<Tone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-destructive",
  info: "bg-info",
  neutral: "bg-muted-foreground",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const tone = TONES[status.toLowerCase()] ?? "neutral";
  return (
    <Badge
      variant="outline"
      className={cn("gap-1.5 capitalize", toneClass[tone], className)}
    >
      <span className={cn("size-1.5 rounded-full", dotClass[tone])} aria-hidden="true" />
      {status}
    </Badge>
  );
}
