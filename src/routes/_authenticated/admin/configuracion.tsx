import { useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/layout/AdminShell";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OperationalSettingsCard } from "@/components/admin/settings/OperationalSettingsCard";
import { UserBlockCard } from "@/components/admin/settings/UserBlockCard";
import { CampaignCard } from "@/components/admin/settings/CampaignCard";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  getSaldoRate,
  getUsdRate,
  recalculateOfferPrices,
  setSaldoRate,
  setUsdRate,
} from "@/lib/catalog.functions";
import { getListingFees, setListingFees } from "@/lib/marketplace.functions";
import { formatCUP } from "@/lib/format";
import {
  getLinePolicy,
  getSupportWhatsapp,
  listAllPaymentDestinations,
  listPaymentLines,
  listPaymentMethods,
  savePaymentDestination,
  savePaymentLine,
  savePaymentMethod,
  setDestinationGuideImage,
  setLineReusePolicy,
  setSupportWhatsapp,
  type PaymentDestination,
  type PaymentLine,
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
          "Métodos de pago (Transfermóvil, EnZona, iPhone, saldo móvil, USDT, Zelle), comisiones y ajustes generales.",
      },
    ],
  }),
  loader: async () => {
    const [pricing, saldo, methods, lines, linePolicy, destinations, support, listingFees] =
      await Promise.all([
        getUsdRate(),
        getSaldoRate(),
        listPaymentMethods(),
        listPaymentLines(),
        getLinePolicy(),
        listAllPaymentDestinations(),
        getSupportWhatsapp(),
        getListingFees(),
      ]);
    return { pricing, saldo, methods, lines, linePolicy, destinations, support, listingFees };
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
            await save({ data: { rate: Number(value), margin: Number(margin) } });
            toast.success("Valores guardados. Los precios publicados no cambian todavía.");
            await router.invalidate();
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "No se pudo guardar.");
          } finally {
            setSaving(false);
          }
        }}
      >
        {saving ? "Guardando…" : "Guardar valores"}
      </Button>
      <RecalculatePricesAction />
    </section>
  );
}

function RecalculatePricesAction() {
  const router = useRouter();
  const recalc = useServerFn(recalculateOfferPrices);
  const [running, setRunning] = useState(false);

  return (
    <div className="mt-4 space-y-2 rounded-lg border border-border/70 p-3">
      <p className="text-sm font-semibold">Recalcular precios de recargas</p>
      <p className="text-xs text-muted-foreground">
        Los precios ya publicados no cambian cuando guardas los valores. Usa esta acción cuando
        quieras aplicarlos a las ofertas.
      </p>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button type="button" variant="outline" size="sm" disabled={running}>
            {running ? "Recalculando…" : "Recalcular precios"}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Recalcular los precios de las recargas?</AlertDialogTitle>
            <AlertDialogDescription>
              Se actualizarán los precios de las ofertas según el valor del dólar y la ganancia
              guardados ahora. Los precios actuales serán sustituidos por los nuevos cálculos. Esta
              acción queda registrada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                setRunning(true);
                try {
                  const result = await recalc({});
                  if (result.repetido) {
                    toast.info("Ya se recalcularon los precios hace un momento.");
                  } else {
                    toast.success(`Precios recalculados: ${result.updated} ofertas actualizadas.`);
                  }
                  await router.invalidate();
                } catch (error) {
                  toast.error(
                    error instanceof Error ? error.message : "No se pudo recalcular.",
                  );
                } finally {
                  setRunning(false);
                }
              }}
            >
              Sí, recalcular
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
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
  
  const [conversion, setConversion] = useState(String(method.withdrawal_conversion_pct));
  const [saving, setSaving] = useState(false);
  // El estado de las transferencias en CUP se deriva de los destinos activos:
  // una sola fuente de verdad para el administrador y el cliente.
  const derived = method.payment_method === "tarjeta_cup";

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
          // La comisión de retiro es global (Comisiones y límites), no por método.
          withdrawal_fee_pct: 0,
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
            {derived
              ? active
                ? "Visible para los clientes (hay destinos activos abajo)"
                : "Oculto: activa un destino en «Métodos de pago del cliente»"
              : active
                ? "Visible para los clientes"
                : "Oculto para los clientes"}
          </p>
        </div>
        {derived ? null : (
          <Switch
            checked={active}
            onCheckedChange={setActive}
            aria-label={`Activar ${method.label}`}
          />
        )}
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

/** Líneas de recepción: números que el sistema asigna a cada solicitud de fondos. */
function PaymentLinesCard() {
  const { lines, linePolicy } = Route.useLoaderData();
  const router = useRouter();
  const saveLine = useServerFn(savePaymentLine);
  const savePolicy = useServerFn(setLineReusePolicy);
  const [drafts, setDrafts] = useState(
    lines.map((line: PaymentLine) => ({
      id: line.id,
      label: line.label,
      phone_number: line.phone_number,
      active: line.active,
    })),
  );
  const [reuse, setReuse] = useState(linePolicy.allow_line_reuse);
  const [saving, setSaving] = useState<string | null>(null);

  function update(id: string, patch: Partial<(typeof drafts)[number]>) {
    setDrafts((current) =>
      current.map((draft) => (draft.id === id ? { ...draft, ...patch } : draft)),
    );
  }

  return (
    <section className="surface-card space-y-4 p-5 lg:col-span-2">
      <div>
        <h2 className="text-base font-semibold">Líneas de recepción de saldo móvil</h2>
        <p className="text-xs text-muted-foreground">
          Cada solicitud de fondos recibe una línea libre. Mientras la solicitud esté pendiente,
          esa línea no se le asigna a nadie más, así sabes de quién es cada pago.
        </p>
      </div>

      <div className="space-y-3">
        {lines.map((line: PaymentLine) => {
          const draft = drafts.find((item) => item.id === line.id);
          if (!draft) return null;
          return (
            <div
              key={line.id}
              className="space-y-3 rounded-lg border border-border/60 p-3 sm:flex sm:items-end sm:gap-3 sm:space-y-0"
            >
              <div className="space-y-1.5 sm:w-40">
                <Label htmlFor={`line-label-${line.id}`}>Nombre</Label>
                <Input
                  id={`line-label-${line.id}`}
                  value={draft.label}
                  onChange={(event) => update(line.id, { label: event.target.value })}
                />
              </div>
              <div className="space-y-1.5 sm:flex-1">
                <Label htmlFor={`line-phone-${line.id}`}>
                  Número de la línea {line.line_number}
                </Label>
                <Input
                  id={`line-phone-${line.id}`}
                  inputMode="tel"
                  value={draft.phone_number}
                  placeholder="5XXXXXXX"
                  onChange={(event) =>
                    update(line.id, { phone_number: event.target.value.replace(/\D/g, "") })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  {draft.phone_number.length === 0
                    ? "Sin número todavía: escribe el móvil que recibirá el saldo."
                    : "Móvil cubano de 8 dígitos que empieza por 5. No puede repetirse en otra línea."}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  checked={draft.active}
                  onCheckedChange={(value) => update(line.id, { active: value })}
                  aria-label={`Activar línea ${line.line_number}`}
                />
                <span className="text-xs text-muted-foreground">
                  {line.busy ? "Ocupada ahora" : "Libre"}
                </span>
                <Button
                  type="button"
                  size="sm"
                  disabled={saving === line.id}
                  onClick={async () => {
                    setSaving(line.id);
                    try {
                      await saveLine({ data: draft });
                      toast.success(`Línea ${line.line_number} guardada.`);
                      await router.invalidate();
                    } catch (error) {
                      toast.error(
                        error instanceof Error ? error.message : "No se pudo guardar.",
                      );
                    } finally {
                      setSaving(null);
                    }
                  }}
                >
                  {saving === line.id ? "Guardando…" : "Guardar"}
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <label className="flex items-center justify-between gap-4 text-sm">
        <span>
          Permitir reutilizar una línea ocupada
          <span className="block text-xs text-muted-foreground">
            Desactivado: si las tres líneas tienen pagos en revisión, el cliente ve un aviso y
            debe esperar.
          </span>
        </span>
        <Switch
          checked={reuse}
          onCheckedChange={async (value) => {
            setReuse(value);
            try {
              await savePolicy({ data: { allow: value } });
              toast.success(value ? "Reutilización permitida." : "Reutilización desactivada.");
              await router.invalidate();
            } catch (error) {
              setReuse(!value);
              toast.error(error instanceof Error ? error.message : "No se pudo guardar.");
            }
          }}
        />
      </label>
    </section>
  );
}

/** Centro de control: cada pestaña agrupa una categoría de parámetros. */
function AdminSettingsPage() {
  const { methods } = Route.useLoaderData();

  return (
    <AdminShell title="Configuración" description="Centro de control de MonStore.">
      <Tabs defaultValue="economia">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="economia">Valores económicos</TabsTrigger>
          <TabsTrigger value="comisiones">Comisiones y límites</TabsTrigger>
          <TabsTrigger value="pagos">Métodos de pago</TabsTrigger>
          <TabsTrigger value="comercio">Comercio de cuentas</TabsTrigger>
          <TabsTrigger value="usuarios">Seguridad y usuarios</TabsTrigger>
          <TabsTrigger value="avisos">Notificaciones</TabsTrigger>
          <TabsTrigger value="otros">Otros parámetros</TabsTrigger>
        </TabsList>

        <TabsContent value="economia" className="mt-4 grid gap-4 lg:grid-cols-2">
          <UsdRateCard />
          <SaldoRateCard />
        </TabsContent>

        <TabsContent value="comisiones" className="mt-4 grid gap-4 lg:grid-cols-2">
          <OperationalSettingsCard />
        </TabsContent>

        <TabsContent value="pagos" className="mt-4 grid gap-4 lg:grid-cols-2">
          {methods.map((method) => (
            <PaymentMethodCard key={method.payment_method} method={method} />
          ))}
          <PaymentDestinationsCard />
          <PaymentLinesCard />
        </TabsContent>

        <TabsContent value="comercio" className="mt-4 grid gap-4 lg:grid-cols-2">
          <ListingFeesCard />
        </TabsContent>

        <TabsContent value="usuarios" className="mt-4 grid gap-4 lg:grid-cols-2">
          <UserBlockCard />
        </TabsContent>

        <TabsContent value="avisos" className="mt-4 grid gap-4 lg:grid-cols-2">
          <CampaignCard />
        </TabsContent>

        <TabsContent value="otros" className="mt-4 grid gap-4 lg:grid-cols-2">
          <SupportWhatsappCard />
        </TabsContent>
      </Tabs>
    </AdminShell>
  );
}

const CHANNEL_TITLES: Record<string, string> = {
  tarjeta_cup: "Tarjeta CUP",
  transfermovil: "Transfermóvil",
  enzona: "EnZona",
  metropolitana: "Metropolitana",
  iphone: "Utilizo iPhone",
};

/** Imagen que enseña al cliente dónde tocar para enviar al Monedero Mi Transfer. */
function GuideImageField({ destination }: { destination: PaymentDestination }) {
  const router = useRouter();
  const saveImage = useServerFn(setDestinationGuideImage);
  const [preview, setPreview] = useState<string | null>(destination.guide_image_url);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="space-y-2 rounded-lg border border-dashed border-border/70 p-3">
      <p className="text-sm font-semibold">Imagen que enseña dónde enviar el dinero</p>
      <p className="text-xs text-muted-foreground">
        Sube una captura de la aplicación señalando el paso. El cliente la verá junto al número.
      </p>
      {preview ? (
        <img
          src={preview}
          alt="Guía para enviar al Monedero Mi Transfer"
          className="max-h-64 w-full rounded-md border border-border/60 object-contain"
        />
      ) : (
        <p className="text-xs text-muted-foreground">Todavía no hay imagen.</p>
      )}
      <Input
        type="file"
        accept="image/*"
        onChange={(event) => {
          const picked = event.target.files?.[0] ?? null;
          if (picked && !picked.type.startsWith("image/")) {
            toast.error("Elige un archivo de imagen.");
            return;
          }
          if (picked && picked.size > 5 * 1024 * 1024) {
            toast.error("La imagen no puede pasar de 5 MB.");
            return;
          }
          setFile(picked);
          setPreview(picked ? URL.createObjectURL(picked) : destination.guide_image_url);
        }}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={!file || busy}
          onClick={async () => {
            if (!file) return;
            setBusy(true);
            try {
              const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase().slice(0, 5);
              const path = `${destination.id}/${Date.now()}.${ext}`;
              const { error } = await supabase.storage
                .from("payment-guides")
                .upload(path, file, { contentType: file.type || "image/jpeg", upsert: true });
              if (error) throw new Error("No se pudo subir la imagen.");
              await saveImage({ data: { id: destination.id, path } });
              toast.success("Imagen guardada. El cliente ya la verá.");
              setFile(null);
              await router.invalidate();
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "No se pudo guardar la imagen.");
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Guardando…" : "Guardar imagen"}
        </Button>
        {destination.guide_image_path ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await saveImage({ data: { id: destination.id, path: "" } });
                setPreview(null);
                setFile(null);
                toast.success("Imagen quitada.");
                await router.invalidate();
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "No se pudo quitar.");
              } finally {
                setBusy(false);
              }
            }}
          >
            Quitar imagen
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/** Destinos de pago: tarjeta BANDEC/BPA, Monedero Mi Transfer, EnZona e iPhone. */
function PaymentDestinationsCard() {
  const { destinations } = Route.useLoaderData();
  const router = useRouter();
  const save = useServerFn(savePaymentDestination);
  const [drafts, setDrafts] = useState(
    destinations.map((item: PaymentDestination) => ({
      id: item.id,
      label: item.label,
      description: item.description,
      bank: item.bank ?? "",
      holder_name: item.holder_name,
      destination_value: item.destination_value,
      confirm_phone: item.confirm_phone,
      instructions: item.instructions,
      requires_transaction_id: item.requires_transaction_id,
      requires_proof: item.requires_proof,
      active: item.active,
    })),
  );
  const [saving, setSaving] = useState<string | null>(null);

  function update(id: string, patch: Partial<(typeof drafts)[number]>) {
    setDrafts((current) =>
      current.map((draft) => (draft.id === id ? { ...draft, ...patch } : draft)),
    );
  }

  return (
    <section className="surface-card space-y-4 p-5 lg:col-span-2">
      <div>
        <h2 className="text-base font-semibold">Métodos de pago del cliente</h2>
        <p className="text-xs text-muted-foreground">
          Números de tarjeta, datos del Monedero Mi Transfer e instrucciones que verá el cliente.
          Nada de esto está escrito dentro de la aplicación: todo se edita aquí. El interruptor de
          cada destino es el que decide si el cliente puede usarlo al agregar fondos.
        </p>
      </div>

      <div className="space-y-3">
        {destinations.map((item: PaymentDestination) => {
          const draft = drafts.find((row) => row.id === item.id);
          if (!draft) return null;
          const title = `${CHANNEL_TITLES[item.channel] ?? item.channel}${
            item.bank ? ` · ${item.bank.toUpperCase()}` : ""
          }`;
          return (
            <div key={item.id} className="space-y-3 rounded-lg border border-border/60 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{title}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.kind === "monedero"
                      ? "Monedero Mi Transfer"
                      : item.kind === "tarjeta"
                        ? "Tarjeta bancaria"
                        : "Aplicación de pago"}
                    {item.requires_transaction_id ? " · pide ID de transacción" : ""}
                    {item.requires_proof ? " · captura obligatoria" : ""}
                  </p>
                </div>
                <Switch
                  checked={draft.active}
                  onCheckedChange={(value) => update(item.id, { active: value })}
                  aria-label={`Activar ${title}`}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {item.kind === "app" ? null : (
                  <div className="space-y-1.5">
                    <Label htmlFor={`dest-value-${item.id}`}>
                      {item.kind === "monedero"
                        ? "Número de Monedero Mi Transfer"
                        : item.kind === "tarjeta"
                          ? "Número de cuenta/tarjeta receptora"
                          : "Cuenta o usuario de destino"}
                    </Label>
                    <Input
                      id={`dest-value-${item.id}`}
                      inputMode="numeric"
                      value={draft.destination_value}
                      placeholder={
                        item.kind === "tarjeta" ? "9200 0000 0000 0000" : "Número del destino"
                      }
                      onChange={(event) =>
                        update(item.id, { destination_value: event.target.value })
                      }
                    />
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor={`dest-confirm-${item.id}`}>Móvil a confirmar</Label>
                  <Input
                    id={`dest-confirm-${item.id}`}
                    inputMode="tel"
                    maxLength={8}
                    value={draft.confirm_phone}
                    placeholder="5XXXXXXX"
                    onChange={(event) =>
                      update(item.id, {
                        confirm_phone: event.target.value.replace(/\D/g, "").slice(0, 8),
                      })
                    }
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Número que el cliente debe dar para confirmar la transferencia.
                  </p>
                </div>
              </div>

              {item.kind === "monedero" || item.channel === "iphone" ? (
                <div className="space-y-1.5">
                  <Label htmlFor={`dest-inst-${item.id}`}>Instrucciones para el cliente</Label>
                  <Textarea
                    id={`dest-inst-${item.id}`}
                    rows={3}
                    value={draft.instructions}
                    onChange={(event) => update(item.id, { instructions: event.target.value })}
                  />
                </div>
              ) : null}

              {item.channel === "enzona" || item.channel === "iphone" ? (
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={draft.requires_proof}
                    onCheckedChange={(value) => update(item.id, { requires_proof: value })}
                    aria-label="Captura de pantalla obligatoria"
                  />
                  Captura de pantalla obligatoria
                </label>
              ) : null}

              {item.kind === "monedero" ? <GuideImageField destination={item} /> : null}




              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  size="sm"
                  disabled={saving === item.id}
                  onClick={async () => {
                    setSaving(item.id);
                    try {
                      await save({ data: draft });
                      toast.success(`${title} guardado.`);
                      await router.invalidate();
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : "No se pudo guardar.");
                    } finally {
                      setSaving(null);
                    }
                  }}
                >
                  {saving === item.id ? "Guardando…" : "Guardar"}
                </Button>
                <span className="text-xs text-muted-foreground">
                  Última actualización:{" "}
                  {item.updated_at ? new Date(item.updated_at).toLocaleString("es-CU") : "—"}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** Número de WhatsApp que se muestra al cliente para atención y reclamaciones. */
function SupportWhatsappCard() {
  const { support } = Route.useLoaderData();
  const router = useRouter();
  const save = useServerFn(setSupportWhatsapp);
  const [phone, setPhone] = useState(support.phone);
  const [saving, setSaving] = useState(false);

  return (
    <section className="surface-card space-y-4 p-5">
      <div>
        <h2 className="text-base font-semibold">Atención al cliente por WhatsApp</h2>
        <p className="text-xs text-muted-foreground">
          Este número aparece en el perfil y cuando se rechaza una solicitud de fondos.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="support-whatsapp">Número de WhatsApp</Label>
        <Input
          id="support-whatsapp"
          inputMode="tel"
          value={phone}
          onChange={(event) => setPhone(event.target.value.replace(/\D/g, ""))}
        />
      </div>
      <Button
        type="button"
        disabled={saving}
        onClick={async () => {
          setSaving(true);
          try {
            await save({ data: { phone } });
            toast.success("Número de atención guardado.");
            await router.invalidate();
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "No se pudo guardar.");
          } finally {
            setSaving(false);
          }
        }}
      >
        {saving ? "Guardando…" : "Guardar número"}
      </Button>
    </section>
  );
}

/** Comisión que paga el vendedor según los días que quiera tener publicada su cuenta. */
function ListingFeesCard() {
  const { listingFees } = Route.useLoaderData();
  const router = useRouter();
  const save = useServerFn(setListingFees);
  const [perDay, setPerDay] = useState(String(listingFees.perDay));
  const [byDays, setByDays] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const day of [1, 2, 3, 4, 5]) {
      const value = listingFees.byDays[String(day)];
      initial[String(day)] = value === undefined ? "" : String(value);
    }
    return initial;
  });
  const [saving, setSaving] = useState(false);

  return (
    <section className="surface-card space-y-4 p-5 lg:col-span-2">
      <div>
        <h2 className="text-base font-semibold">Comisión por publicar una cuenta</h2>
        <p className="text-xs text-muted-foreground">
          Se cobra del saldo del vendedor al enviar la cuenta. Si dejas un precio fijo vacío, se
          usa el precio por día multiplicado por los días.
        </p>
      </div>
      <div className="space-y-1.5 sm:max-w-xs">
        <Label htmlFor="fee-per-day">Precio por día (CUP)</Label>
        <Input
          id="fee-per-day"
          inputMode="numeric"
          value={perDay}
          onChange={(event) => setPerDay(event.target.value)}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-5">
        {[1, 2, 3, 4, 5].map((day) => {
          const fallback = (Number(perDay) || 0) * day;
          return (
            <div key={day} className="space-y-1.5">
              <Label htmlFor={`fee-day-${day}`}>{day} día(s)</Label>
              <Input
                id={`fee-day-${day}`}
                inputMode="numeric"
                placeholder={String(fallback)}
                value={byDays[String(day)] ?? ""}
                onChange={(event) =>
                  setByDays((prev) => ({ ...prev, [String(day)]: event.target.value }))
                }
              />
              <p className="text-xs text-muted-foreground">
                Cobra {formatCUP(Number(byDays[String(day)]) || fallback)}
              </p>
            </div>
          );
        })}
      </div>
      <Button
        type="button"
        disabled={saving}
        onClick={async () => {
          setSaving(true);
          try {
            const payload: Record<string, number> = {};
            for (const day of [1, 2, 3, 4, 5]) {
              const raw = byDays[String(day)];
              if (raw !== undefined && raw !== "" && Number.isFinite(Number(raw))) {
                payload[String(day)] = Number(raw);
              }
            }
            await save({ data: { perDay: Number(perDay), byDays: payload } });
            toast.success("Comisiones de publicación guardadas.");
            await router.invalidate();
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "No se pudo guardar.");
          } finally {
            setSaving(false);
          }
        }}
      >
        {saving ? "Guardando…" : "Guardar comisiones"}
      </Button>
    </section>
  );
}
