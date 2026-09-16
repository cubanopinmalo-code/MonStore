import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";
import { getPlatformSettings, savePlatformSettings } from "@/lib/settings.functions";
import { getGatewayOverview } from "@/lib/payment-gateway.functions";

const MODES = [
  { value: "off", label: "Desactivado", hint: "No se acredita nada de forma automática." },
  { value: "simulation", label: "Simulación", hint: "Analiza el aviso y anota qué habría hecho." },
  { value: "live", label: "Activo", hint: "Acredita automáticamente cuando todo coincide." },
] as const;

const OUTCOME_LABEL: Record<string, string> = {
  aprobado_automatico: "Aprobado automático",
  simulado_aprobaria: "Habría aprobado",
  revision_manual: "Revisión manual",
  duplicado: "Duplicado",
  gateway_desactivado: "Gateway desactivado",
};

/**
 * Gateway de pagos: estado del teléfono dedicado y últimos avisos recibidos.
 * Nunca muestra la clave compartida con el dispositivo.
 */
export function PaymentGatewayCard() {
  const queryClient = useQueryClient();
  const loadSettings = useServerFn(getPlatformSettings);
  const saveSettings = useServerFn(savePlatformSettings);
  const loadOverview = useServerFn(getGatewayOverview);

  const { data: settings } = useQuery({
    queryKey: ["platform-settings"],
    queryFn: () => loadSettings(),
  });
  const { data: overview } = useQuery({
    queryKey: ["payment-gateway"],
    queryFn: () => loadOverview(),
    refetchInterval: 60_000,
  });

  const mutation = useMutation({
    mutationFn: (mode: "off" | "simulation" | "live") =>
      saveSettings({ data: { payment_gateway_mode: mode } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["platform-settings"] });
      toast.success("Gateway actualizado");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const mode = settings?.payment_gateway_mode ?? "off";
  const stats = overview?.stats;

  return (
    <section className="surface-card space-y-4 p-5 lg:col-span-2">
      <div>
        <h2 className="text-base font-semibold">Gateway de pagos</h2>
        <p className="text-xs text-muted-foreground">
          Teléfono dedicado que reenvía los avisos de pago. La clave del dispositivo no se muestra
          nunca aquí.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        {MODES.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => mutation.mutate(option.value)}
            disabled={mutation.isPending}
            className={`rounded-lg border p-3 text-left text-sm transition ${
              mode === option.value
                ? "border-primary bg-primary/10"
                : "border-border hover:border-primary/50"
            }`}
          >
            <span className="font-medium">{option.label}</span>
            <span className="mt-1 block text-xs text-muted-foreground">{option.hint}</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 border-t border-border pt-4 sm:grid-cols-3">
        <Metric label="Avisos recibidos" value={stats?.total ?? 0} />
        <Metric label="Aprobaciones automáticas" value={stats?.approved ?? 0} />
        <Metric label="Revisiones manuales" value={stats?.review ?? 0} />
        <Metric label="Duplicados" value={stats?.duplicated ?? 0} />
        <Metric label="Simulados" value={stats?.simulated ?? 0} />
        <Metric label="Sin procesar" value={stats?.errors ?? 0} />
      </div>

      <div className="space-y-1 text-xs text-muted-foreground">
        <p>
          Último aviso:{" "}
          {overview?.last_event_at ? formatDate(overview.last_event_at) : "todavía ninguno"}
        </p>
        <p>Teléfono: {overview?.last_device_id ?? "sin comunicación"}</p>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium">Últimos avisos</h3>
        {(overview?.events ?? []).length === 0 ? (
          <p className="text-xs text-muted-foreground">Aún no se ha recibido ningún aviso.</p>
        ) : (
          <ul className="space-y-2">
            {(overview?.events ?? []).slice(0, 10).map((event) => (
              <li key={event.id} className="rounded-lg border border-border p-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">
                    {event.channel} · {event.amount !== null ? `${event.amount} CUP` : "sin importe"}
                  </span>
                  <Badge variant="secondary">
                    {OUTCOME_LABEL[event.outcome] ?? event.status}
                  </Badge>
                </div>
                <p className="mt-1 text-muted-foreground">{event.reason}</p>
                <p className="mt-1 text-muted-foreground">
                  {formatDate(event.created_at)}
                  {event.reference ? ` · Ref. ${event.reference}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => void queryClient.invalidateQueries({ queryKey: ["payment-gateway"] })}
        >
          Actualizar
        </Button>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-lg font-semibold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
