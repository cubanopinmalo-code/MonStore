import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { formatDate } from "@/lib/format";
import {
  getPlatformSettings,
  savePlatformSettings,
  type PlatformSettings,
} from "@/lib/settings.functions";

/**
 * Comisión de retiro, importes mínimos, premio de referidos y estado de la
 * plataforma. Todo se guarda en la fila única de configuración y lo usan las
 * operaciones NUEVAS; las operaciones ya procesadas conservan sus valores.
 */
export function OperationalSettingsCard() {
  const queryClient = useQueryClient();
  const load = useServerFn(getPlatformSettings);
  const save = useServerFn(savePlatformSettings);

  const { data } = useQuery({ queryKey: ["platform-settings"], queryFn: () => load() });

  const [draft, setDraft] = useState<Partial<PlatformSettings>>({});
  const value = <K extends keyof PlatformSettings>(key: K): PlatformSettings[K] | undefined =>
    (draft[key] ?? data?.[key]) as PlatformSettings[K] | undefined;

  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          withdrawal_fee_pct: Number(value("withdrawal_fee_pct") ?? 0),
          min_deposit_cup: Number(value("min_deposit_cup") ?? 0),
          min_withdrawal_cup: Number(value("min_withdrawal_cup") ?? 0),
          referral_reward_cup: Number(value("referral_reward_cup") ?? 0),
          maintenance_mode: Boolean(value("maintenance_mode")),
          registration_open: Boolean(value("registration_open")),
          marketplace_enabled: Boolean(value("marketplace_enabled")),
        },
      }),
    onSuccess: () => {
      setDraft({});
      void queryClient.invalidateQueries({ queryKey: ["platform-settings"] });
      toast.success("Configuración guardada", {
        description: "Las operaciones nuevas ya usan estos valores.",
      });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const number = (key: keyof PlatformSettings) => ({
    value: String(value(key) ?? ""),
    onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
      setDraft((prev) => ({ ...prev, [key]: event.target.value.replace(/[^\d.]/g, "") as never })),
  });

  const toggle = (key: keyof PlatformSettings) => ({
    checked: Boolean(value(key)),
    onCheckedChange: (checked: boolean) =>
      setDraft((prev) => ({ ...prev, [key]: checked as never })),
  });

  return (
    <section className="surface-card space-y-4 p-5">
      <div>
        <h2 className="text-base font-semibold">Comisiones, límites y estado</h2>
        <p className="text-xs text-muted-foreground">
          Se aplican a las operaciones nuevas. Los retiros ya creados conservan la comisión con la
          que se procesaron.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="fee-ret">Comisión de retiro (%)</Label>
          <Input id="fee-ret" inputMode="decimal" {...number("withdrawal_fee_pct")} />
          <p className="text-xs text-muted-foreground">
            Ejemplo: 10 000 CUP con {String(value("withdrawal_fee_pct") ?? 0)}% → el cliente recibe{" "}
            {Math.round(10000 - (10000 * Number(value("withdrawal_fee_pct") ?? 0)) / 100)} CUP.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="premio-ref">Premio por referidos (CUP)</Label>
          <Input id="premio-ref" inputMode="decimal" {...number("referral_reward_cup")} />
          <p className="text-xs text-muted-foreground">
            0 = usar el valor del USDT, como hasta ahora.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="min-dep">Depósito mínimo (CUP)</Label>
          <Input id="min-dep" inputMode="decimal" {...number("min_deposit_cup")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="min-ret">Retiro mínimo (CUP)</Label>
          <Input id="min-ret" inputMode="decimal" {...number("min_withdrawal_cup")} />
        </div>
      </div>

      <div className="space-y-3 border-t border-border pt-4">
        <label className="flex items-center justify-between gap-4 text-sm">
          <span>
            Modo mantenimiento
            <span className="block text-xs text-muted-foreground">
              Muestra un aviso en la aplicación del cliente.
            </span>
          </span>
          <Switch {...toggle("maintenance_mode")} />
        </label>
        <label className="flex items-center justify-between gap-4 text-sm">
          <span>
            Registro abierto
            <span className="block text-xs text-muted-foreground">Permite crear cuentas nuevas.</span>
          </span>
          <Switch {...toggle("registration_open")} />
        </label>
        <label className="flex items-center justify-between gap-4 text-sm">
          <span>
            Comercio de cuentas
            <span className="block text-xs text-muted-foreground">
              Habilita publicar y comprar cuentas.
            </span>
          </span>
          <Switch {...toggle("marketplace_enabled")} />
        </label>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Última modificación: {data?.updated_at ? formatDate(data.updated_at) : "—"}
        </p>
        <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
          {mutation.isPending ? "Guardando…" : "Guardar cambios"}
        </Button>
      </div>
    </section>
  );
}
