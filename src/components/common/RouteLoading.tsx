import { Loader2 } from "lucide-react";

/** Pantalla de carga breve para evitar que la app quede en blanco/negro. */
export function RouteLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <Loader2 className="size-6 animate-spin text-primary" aria-hidden="true" />
        <p className="text-sm">Cargando…</p>
      </div>
    </div>
  );
}
