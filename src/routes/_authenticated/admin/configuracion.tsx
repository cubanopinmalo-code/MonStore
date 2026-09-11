import { useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AdminShell } from "@/components/layout/AdminShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { mockPaymentSettings } from "@/data/mock/admin";
import { getUsdRate, setUsdRate } from "@/lib/catalog.functions";
import { formatCup } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/configuracion")({
  head: () => ({
    meta: [
      { title: "Configuración — Panel MONSTORE" },
      { name: "description", content: "Métodos de pago, comisiones y ajustes generales." },
    ],
  }),
  loader: () => getUsdRate(),
  errorComponent: () => (
    <AdminShell title="Configuración" description="Ajustes generales de la plataforma.">
      <p className="surface-card p-5 text-sm text-muted-foreground">
        No se pudo cargar la configuración. Recarga la página.
      </p>
    </AdminShell>
  ),
  notFoundComponent: () => null,
  component: AdminSettingsPage,
});

function UsdRateCard() {
  const initial = Route.useLoaderData();
  const router = useRouter();
  const save = useServerFn(setUsdRate);
  const [value, setValue] = useState(String(initial));
  const [saving, setSaving] = useState(false);
  const preview = Number(value) > 0 ? Number(value) : 0;

  return (
    <section className="surface-card space-y-4 p-5 lg:col-span-2">
      <div>
        <h2 className="text-base font-semibold">Precio base del dólar</h2>
        <p className="text-xs text-muted-foreground">
          Todos los precios en CUP se calculan multiplicando el costo en dólares del proveedor por
          este valor.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="usd-rate">1 USD equivale a (CUP)</Label>
          <Input
            id="usd-rate"
            inputMode="decimal"
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Ejemplo</Label>
          <p className="rounded-md border border-border/60 px-3 py-2 text-sm">
            Una oferta de 1 USD se vende en {formatCup(preview)}
          </p>
        </div>
      </div>
      <Button
        type="button"
        disabled={saving}
        onClick={async () => {
          setSaving(true);
          try {
            const result = await save({ data: { rate: Number(value) } });
            toast.success(`Precios actualizados: ${result.updated} ofertas recalculadas.`);
            await router.invalidate();
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "No se pudo guardar.");
          } finally {
            setSaving(false);
          }
        }}
      >
        {saving ? "Guardando…" : "Guardar y recalcular precios"}
      </Button>
    </section>
  );
}

function AdminSettingsPage() {
  return (
    <AdminShell title="Configuración" description="Ajustes generales de la plataforma.">
      <form
        className="grid gap-4 lg:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          toast.success("Configuración guardada (simulado)");
        }}
      >
        {mockPaymentSettings.map((setting) => (
          <section key={setting.id} className="surface-card space-y-4 p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">{setting.label}</h2>
              <Switch defaultChecked={setting.active} aria-label={`Activar ${setting.label}`} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`dest-${setting.id}`}>Destino de cobro</Label>
              <Input id={`dest-${setting.id}`} defaultValue={setting.destination_number} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`tel-${setting.id}`}>Teléfono de contacto</Label>
              <Input id={`tel-${setting.id}`} defaultValue={setting.phone_number ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`inst-${setting.id}`}>Instrucciones para el usuario</Label>
              <Textarea id={`inst-${setting.id}`} rows={3} defaultValue={setting.instructions} />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor={`bonus-${setting.id}`}>Conversión al depositar (%)</Label>
                <Input
                  id={`bonus-${setting.id}`}
                  inputMode="numeric"
                  defaultValue={String(setting.deposit_bonus_pct)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`fee-${setting.id}`}>Comisión al retirar (%)</Label>
                <Input
                  id={`fee-${setting.id}`}
                  inputMode="numeric"
                  defaultValue={String(setting.withdrawal_fee_pct)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`conv-${setting.id}`}>Conversión al retirar (%)</Label>
                <Input
                  id={`conv-${setting.id}`}
                  inputMode="numeric"
                  defaultValue={String(setting.withdrawal_conversion_pct)}
                />
              </div>
            </div>
          </section>
        ))}

        <section className="surface-card space-y-4 p-5">
          <h2 className="text-base font-semibold">Límites</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="min-dep">Depósito mínimo (CUP)</Label>
              <Input id="min-dep" inputMode="numeric" defaultValue="500" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="min-ret">Retiro mínimo (CUP)</Label>
              <Input id="min-ret" inputMode="numeric" defaultValue="1000" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="referido">Recompensa por referido (CUP)</Label>
            <Input id="referido" inputMode="numeric" defaultValue="250" />
          </div>
        </section>

        <section className="surface-card space-y-4 p-5">
          <h2 className="text-base font-semibold">Estado de la plataforma</h2>
          <label className="flex items-center justify-between gap-4 text-sm">
            <span>
              Modo mantenimiento
              <span className="block text-xs text-muted-foreground">
                Muestra un aviso y desactiva las compras.
              </span>
            </span>
            <Switch />
          </label>
          <label className="flex items-center justify-between gap-4 text-sm">
            <span>
              Registro abierto
              <span className="block text-xs text-muted-foreground">
                Permite crear nuevas cuentas.
              </span>
            </span>
            <Switch defaultChecked />
          </label>
          <label className="flex items-center justify-between gap-4 text-sm">
            <span>
              Comercio de cuentas
              <span className="block text-xs text-muted-foreground">
                Habilita la publicación de cuentas.
              </span>
            </span>
            <Switch defaultChecked />
          </label>
        </section>

        <div className="lg:col-span-2">
          <Button type="submit">Guardar cambios</Button>
        </div>
      </form>
    </AdminShell>
  );
}
