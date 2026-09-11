import type { ReactNode } from "react";
import { AlertTriangle, Inbox, PackageX, RefreshCw, ShieldAlert, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

function Shell({
  icon,
  title,
  description,
  action,
  tone = "muted",
}: {
  icon: ReactNode;
  title: string;
  description?: string | undefined;
  action?: ReactNode | undefined;
  tone?: "muted" | "warning" | "danger" | undefined;

}) {
  return (
    <div className="surface-card flex flex-col items-center gap-3 px-6 py-10 text-center">
      <span
        className={cn(
          "flex size-12 items-center justify-center rounded-full",
          tone === "muted" && "bg-muted text-muted-foreground",
          tone === "warning" && "bg-warning/15 text-warning",
          tone === "danger" && "bg-destructive/15 text-destructive",
        )}
      >
        {icon}
      </span>
      <h3 className="text-base font-semibold">{title}</h3>
      {description ? (
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      ) : null}
      {action}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <Shell
      icon={<Inbox className="size-5" aria-hidden="true" />}
      title={title}
      description={description}
      action={action}
    />
  );
}

export function ErrorState({
  title = "No pudimos cargar esta información",
  description = "Revisa tu conexión e inténtalo otra vez.",
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <Shell
      tone="danger"
      icon={<AlertTriangle className="size-5" aria-hidden="true" />}
      title={title}
      description={description}
      action={
        onRetry ? (
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RefreshCw className="size-4" aria-hidden="true" />
            Reintentar
          </Button>
        ) : null
      }
    />
  );
}

export function MaintenanceState({
  title = "Servicio en mantenimiento",
  description = "Estamos trabajando en esta sección. Vuelve en unos minutos.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <Shell
      tone="warning"
      icon={<Wrench className="size-5" aria-hidden="true" />}
      title={title}
      description={description}
    />
  );
}

export function UnavailableState({
  title = "Producto no disponible",
  description = "Este producto está temporalmente agotado.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <Shell
      tone="warning"
      icon={<PackageX className="size-5" aria-hidden="true" />}
      title={title}
      description={description}
    />
  );
}

export function ProtectedNotice({ area }: { area: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-dashed border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
      <ShieldAlert className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
      <p>
        Vista de prototipo: {area} funcionará con datos reales y acceso protegido en la próxima
        fase.
      </p>
    </div>
  );
}

export function CardListSkeleton({ items = 3 }: { items?: number }) {
  return (
    <div className="grid gap-3">
      {Array.from({ length: items }).map((_, index) => (
        <div key={index} className="surface-card flex items-center gap-4 p-4">
          <Skeleton className="size-14 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function GridSkeleton({ items = 6 }: { items?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: items }).map((_, index) => (
        <Skeleton key={index} className="aspect-3/4 w-full rounded-xl" />
      ))}
    </div>
  );
}
