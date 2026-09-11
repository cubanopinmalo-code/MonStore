import { useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/layout/AdminShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { getSaldoRate, getUsdRate, setSaldoRate, setUsdRate } from "@/lib/catalog.functions";
import { formatCUP } from "@/lib/format";
import {
  listPaymentMethods,
  savePaymentMethod,
  type PaymentMethodInfo,
  type TransferField,
} from "@/lib/payments.functions";

export const Route = createFileRoute("/_authenticated/admin/configuracion")({
  head: () => ({
    meta: [
      { title: "Configuración — Panel MONSTORE" },
      {
        name: "description",
        content:
          "Métodos de pago (saldo móvil, tarjeta CUP, USDT, Zelle), comisiones y ajustes generales.",
      },
    ],
  }),
  loader: async () => {
    const [pricing, saldo, methods] = await Promise.all([
      getUsdRate(),
      getSaldoRate(),
      listPaymentMethods(),
    ]);
    return { pricing, saldo, methods };
  },
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
  const { pricing: initial } = Route.useLoaderData();
  const router = useRouter();
  const save = useServerFn(setUsdRate);
  const [value, setValue] = useState(String(initial.rate));
  const [margin, setMargin] = useState(String(initial.margin));
  const [saving, setSaving] = useState(false);
  const base = Number(value) > 0 ? Number(value) : 0;
  const extra = Number(margin) > 0 ? Number(margin) : 0;
  const preview = base + extra;

  return (
    <section className="surface-card space-y-4 p-5 lg:col-span-2">
      <div>
        <h2 className="text-base font-semibold">Precio base del dólar</h2>
        <p className="text-xs text-muted-foreground">
          Cada precio en CUP se calcula multiplicando el costo en dólares del proveedor por la base
          más la ganancia adicional por dólar.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="usd-rate">Base: 1 USD equivale a (CUP)</Label>
          <Input
            id="usd-rate"
            inputMode="decimal"
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="usd-margin">Ganancia por cada USD (CUP)</Label>
          <Input
            id="usd-margin"
            inputMode="decimal"
            value={margin}
            onChange={(event) => setMargin(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Ejemplo</Label>
          <p className="rounded-md border border-border/60 px-3 py-2 text-sm">
            Una oferta de 1 USD se vende en {formatCUP(preview)}
          </p>
        </div>
      </div>
      <Button
        type="button"
        disabled={saving}
        onClick={async () => {
          setSaving(true);
          try {
            const result = await save({
              data: { rate: Number(value), margin: Number(margin) },
            });
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

function SaldoRateCard() {
  const { saldo } = Route.useLoaderData();
  const router = useRouter();
  const save = useServerFn(setSaldoRate);
  const [value, setValue] = useState(String(saldo.rate));
  const [saving, setSaving] = useState(false);
  const rate = Number(value) > 0 ? Number(value) : 0;

  return (
    <section className="surface-card space-y-4 p-5 lg:col-span-2">
      <div>
        <h2 className="text-base font-semibold">Base de conversión del saldo móvil</h2>
        <p className="text-xs text-muted-foreground">
          Cada peso de saldo móvil que envía el cliente se multiplica por esta base para acreditar
          su wallet.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="saldo-rate">Multiplicador por cada peso de saldo</Label>
          <Input
            id="saldo-rate"
            inputMode="decimal"
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Ejemplo</Label>
          <p className="rounded-md border border-border/60 px-3 py-2 text-sm">
            1000 CUP de saldo acreditan {formatCUP(Math.round(1000 * rate))}
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
            toast.success(`Base de conversión guardada: × ${result.rate}`);
            await router.invalidate();
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "No se pudo guardar.");
          } finally {
            setSaving(false);
          }
        }}
      >
        {saving ? "Guardando…" : "Guardar base de conversión"}
      </Button>
    </section>
  );
}

/** Ficha de un método de pago: datos de transferencia, instrucciones y porcentajes. */
function PaymentMethodCard({ method }: { method: PaymentMethodInfo }) {
  const router = useRouter();
  const save = useServerFn(savePaymentMethod);
  const [label, setLabel] = useState(method.label);
  const [active, setActive] = useState(method.active);
  const [instructions, setInstructions] = useState(method.instructions);
  const [fields, setFields] = useState<TransferField[]>(
    method.transfer_fields.length > 0
      ? method.transfer_fields
      : [{ label: "", value: "" }],
  );
  const [bonus, setBonus] = useState(String(method.deposit_bonus_pct));
  const [fee, setFee] = useState(String(method.withdrawal_fee_pct));
  const [conversion, setConversion] = useState(String(method.withdrawal_conversion_pct));
  const [saving, setSaving] = useState(false);

  function updateField(index: number, key: keyof TransferField, value: string) {
    setFields((current) =>
      current.map((field, position) =>
        position === index ? { ...field, [key]: value } : field,
      ),
    );
  }

  async function submit() {
    setSaving(true);
    try {
      await save({
        data: {
          payment_method: method.payment_method,
          label,
          instructions,
          active,
          deposit_bonus_pct: Number(bonus) || 0,
          withdrawal_fee_pct: Number(fee) || 0,
          withdrawal_conversion_pct: Number(conversion) || 0,
          transfer_fields: fields,
        },
      });
      toast.success(`${label || method.label} guardado.`);
      await router.invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="surface-card space-y-4 p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold">{method.label}</h2>
          <p className="text-xs text-muted-foreground">
            {active ? "Visible para los clientes" : "Oculto para los clientes"}
          </p>
        </div>
        <Switch
          checked={active}
          onCheckedChange={setActive}
          aria-label={`Activar ${method.label}`}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`label-${method.payment_method}`}>Nombre del método</Label>
        <Input
          id={`label-${method.payment_method}`}
          value={label}
          onChange={(event) => setLabel(event.target.value)}
        />
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Datos de transferencia</p>
        {fields.map((field, index) => (
          <div key={index} className="flex items-center gap-2">
            <Input
              value={field.label}
              onChange={(event) => updateField(index, "label", event.target.value)}
              placeholder="Nombre (ej. Dirección USDT)"
              aria-label={`Nombre del dato ${index + 1}`}
              className="flex-1"
            />
            <Input
              value={field.value}
              onChange={(event) => updateField(index, "value", event.target.value)}
              placeholder="Valor (ej. TXk…)"
              aria-label={`Valor del dato ${index + 1}`}
              className="flex-[2]"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setFields((current) => current.filter((_, position) => position !== index))}
              aria-label={`Quitar dato ${index + 1}`}
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </Button>
          </div>
        ))}
        {fields.length < 8 ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setFields((current) => [...current, { label: "", value: "" }])}
          >
            <Plus className="size-4" aria-hidden="true" />
            Agregar dato
          </Button>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`inst-${method.payment_method}`}>Instrucciones para el usuario</Label>
        <Textarea
          id={`inst-${method.payment_method}`}
          rows={3}
          value={instructions}
          onChange={(event) => setInstructions(event.target.value)}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor={`bonus-${method.payment_method}`}>Conversión al depositar (%)</Label>
          <Input
            id={`bonus-${method.payment_method}`}
            inputMode="numeric"
            value={bonus}
            onChange={(event) => setBonus(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`fee-${method.payment_method}`}>Comisión al retirar (%)</Label>
          <Input
            id={`fee-${method.payment_method}`}
            inputMode="numeric"
            value={fee}
            onChange={(event) => setFee(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`conv-${method.payment_method}`}>Conversión al retirar (%)</Label>
          <Input
            id={`conv-${method.payment_method}`}
            inputMode="numeric"
            value={conversion}
            onChange={(event) => setConversion(event.target.value)}
          />
        </div>
      </div>

      <Button type="button" disabled={saving} onClick={() => void submit()}>
        {saving ? "Guardando…" : "Guardar método de pago"}
      </Button>
    </section>
  );
}

function AdminSettingsPage() {
  const { methods } = Route.useLoaderData();
  const [limitsSaved, setLimitsSaved] = useState(false);

  return (
    <AdminShell title="Configuración" description="Ajustes generales de la plataforma.">
      <div className="grid gap-4 lg:grid-cols-2">
        <UsdRateCard />
        <SaldoRateCard />

        {methods.map((method) => (
          <PaymentMethodCard key={method.payment_method} method={method} />
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
          <Button
            type="button"
            onClick={() => {
              setLimitsSaved(true);
              toast.info(
                limitsSaved
                  ? "Estos ajustes todavía se guardan manualmente."
                  : "Los límites y el estado de la plataforma aún no se guardan en el servidor.",
              );
            }}
          >
            Guardar cambios
          </Button>
        </div>
      </div>
    </AdminShell>
  );
}
