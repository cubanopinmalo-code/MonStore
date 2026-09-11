import { useState } from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Check, ChevronLeft, Loader2 } from "lucide-react";
import { UserShell } from "@/components/layout/UserShell";
import { StatusBadge } from "@/components/common/StatusBadge";
import { UnavailableState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  RadioGroup,
  RadioGroupItem,
} from "@/components/ui/radio-group";
import { mockWallet } from "@/data/mock/wallet";
import { getCatalogGame, type CatalogProduct } from "@/lib/catalog.functions";
import { formatCUP } from "@/lib/format";
import type { OrderStatus, ProductField } from "@/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/recargas/$slug")({
  loader: async ({ params }) => {
    const result = await getCatalogGame({ data: { slug: params.slug } });
    if (!result) throw notFound();
    return result;
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData ? `Comprar ${loaderData.game.name} — MONSTORE` : "Comprar — MONSTORE" },
      { name: "description", content: "Completa tu recarga en pocos pasos." },
    ],
  }),
  errorComponent: () => (
    <UserShell>
      <p className="text-sm text-muted-foreground">No pudimos cargar este juego.</p>
    </UserShell>
  ),
  notFoundComponent: () => (
    <UserShell>
      <p className="text-sm text-muted-foreground">Juego no encontrado.</p>
    </UserShell>
  ),
  component: PurchaseFlowPage,
});

const STEPS = ["Producto", "Datos", "Resumen", "Confirmación"] as const;

function PurchaseFlowPage() {
  const { game, products } = Route.useLoaderData();
  const [step, setStep] = useState(0);
  const [product, setProduct] = useState<CatalogProduct | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [payment, setPayment] = useState("wallet");
  const [status, setStatus] = useState<OrderStatus>("procesando");
  const [submitting, setSubmitting] = useState(false);

  const fields = product ? fieldsFor(product) : [];
  const missing = fields.filter((field) => field.required && !values[field.key]?.trim());

  function selectProduct(item: CatalogProduct) {
    setProduct(item);
    setValues({});
    setStep(1);
  }

  function confirm() {
    if (submitting) return;
    setSubmitting(true);
    setStatus("procesando");
    setStep(3);
    window.setTimeout(() => {
      setStatus("completado");
      setSubmitting(false);
    }, 1600);
  }

  return (
    <UserShell>
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="icon">
            <Link to="/app/recargas" aria-label="Volver a recargas">
              <ChevronLeft className="size-5" aria-hidden="true" />
            </Link>
          </Button>
          <div>
            <h1 className="text-xl font-bold">{game.name}</h1>
            <p className="text-xs text-muted-foreground">Compra en 4 pasos</p>
          </div>
        </div>

        <ol className="grid grid-cols-4 gap-1.5" aria-label="Progreso de la compra">
          {STEPS.map((label, index) => (
            <li key={label} className="space-y-1.5">
              <span
                className={cn(
                  "block h-1 rounded-full",
                  index <= step ? "bg-primary" : "bg-muted",
                )}
              />
              <span
                className={cn(
                  "text-[11px]",
                  index <= step ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {label}
              </span>
            </li>
          ))}
        </ol>

        {step === 0 && (
          <section className="space-y-3">
            <h2 className="text-base font-semibold">1. Elige la oferta</h2>
            {products.map((item) => (
              <button
                key={item.id}
                type="button"
                disabled={!item.available}
                onClick={() => selectProduct(item)}
                className="surface-card flex w-full items-center justify-between gap-3 p-4 text-left transition-colors hover:border-primary/50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{item.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.delivery_method === "via_id" ? "Entrega por ID" : "Entrega por cuenta"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <StatusBadge status={item.available ? "disponible" : "no disponible"} />
                  <span className="font-display font-bold text-primary">
                    {formatCUP(item.sale_price)}
                  </span>
                </div>
              </button>
            ))}
            {products.length === 0 || products.every((item) => !item.available) ? (
              <UnavailableState />
            ) : null}
          </section>
        )}

        {step === 1 && product && (
          <section className="surface-card space-y-4 p-5">
            <h2 className="text-base font-semibold">2. Datos del jugador</h2>
            <p className="text-sm text-muted-foreground">
              Los campos cambian según el producto seleccionado.
            </p>
            {fields.map((field) => (
              <div key={field.key} className="space-y-1.5">
                <Label htmlFor={field.key}>
                  {field.label}
                  {field.required ? " *" : ""}
                </Label>
                {field.type === "select" ? (
                  <Select
                    value={values[field.key] ?? ""}
                    onValueChange={(value) =>
                      setValues((prev) => ({ ...prev, [field.key]: value }))
                    }
                  >
                    <SelectTrigger id={field.key}>
                      <SelectValue placeholder="Selecciona una opción" />
                    </SelectTrigger>
                    <SelectContent>
                      {(field.options ?? []).map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id={field.key}
                    placeholder={field.placeholder}
                    value={values[field.key] ?? ""}
                    onChange={(event) =>
                      setValues((prev) => ({ ...prev, [field.key]: event.target.value }))
                    }
                  />
                )}
              </div>
            ))}
            {missing.length > 0 ? (
              <p className="text-xs text-warning">
                Completa los campos obligatorios para continuar.
              </p>
            ) : null}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(0)}>
                Atrás
              </Button>
              <Button className="flex-1" disabled={missing.length > 0} onClick={() => setStep(2)}>
                Continuar
              </Button>
            </div>
          </section>
        )}

        {step === 2 && product && (
          <section className="space-y-4">
            <div className="surface-card space-y-3 p-5">
              <h2 className="text-base font-semibold">3. Resumen de compra</h2>
              <dl className="grid gap-2 text-sm">
                <Row label="Juego" value={game.name} />
                <Row label="Producto" value={product.name} />
                {fields.map((field) => (
                  <Row
                    key={field.key}
                    label={field.label}
                    value={values[field.key] || "—"}
                  />
                ))}
                <Row label="Precio" value={formatCUP(product.sale_price)} />
              </dl>
            </div>

            <div className="surface-card space-y-3 p-5">
              <h3 className="text-sm font-semibold">Método de pago</h3>
              <RadioGroup value={payment} onValueChange={setPayment} className="gap-2">
                <label className="flex items-center gap-3 rounded-lg border border-border p-3 text-sm">
                  <RadioGroupItem value="wallet" id="pago-wallet" />
                  <span className="flex-1">
                    Wallet MONSTORE
                    <span className="block text-xs text-muted-foreground">
                      Saldo disponible: {formatCUP(mockWallet.balance)}
                    </span>
                  </span>
                </label>
              </RadioGroup>
              <div className="flex items-center justify-between border-t border-border pt-3">
                <span className="text-sm text-muted-foreground">Total</span>
                <span className="font-display text-xl font-bold text-primary">
                  {formatCUP(product.sale_price)}
                </span>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(1)}>
                  Atrás
                </Button>
                <Button className="flex-1" onClick={confirm} disabled={submitting}>
                  {submitting ? "Procesando…" : "Confirmar compra"}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Prototipo: no se descuenta saldo real. El cobro se validará en el servidor en la
                próxima fase.
              </p>
            </div>
          </section>
        )}

        {step === 3 && product && (
          <section className="surface-card space-y-4 p-6 text-center">
            <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-primary/12 text-primary">
              {status === "completado" ? (
                <Check className="size-6" aria-hidden="true" />
              ) : (
                <Loader2 className="size-6 animate-spin" aria-hidden="true" />
              )}
            </span>
            <h2 className="text-lg font-bold">
              {status === "completado" ? "Recarga completada" : "Procesando tu pedido"}
            </h2>
            <div className="flex justify-center">
              <StatusBadge status={status} />
            </div>
            <p className="text-sm text-muted-foreground">
              {product.name} · {game.name} · {formatCUP(product.sale_price)}
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button asChild variant="outline">
                <Link to="/app/pedidos">Ver mis pedidos</Link>
              </Button>
              <Button
                onClick={() => {
                  setStep(0);
                  setProduct(null);
                  setValues({});
                }}
              >
                Nueva recarga
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Estados simulados posibles: pendiente, procesando, completado, error y reembolsado.
            </p>
          </section>
        )}
      </div>
    </UserShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}

function fieldsFor(product: CatalogProduct): ProductField[] {
  const metadata = product.metadata as { fields?: unknown } | null;
  if (!Array.isArray(metadata?.fields)) return [];

  return metadata.fields.map((value) => {
    if (typeof value === "object" && value !== null && "key" in value) {
      return value as ProductField;
    }

    const key = String(value);
    const labels: Record<string, string> = {
      player_id: "ID del jugador",
      user_id: "ID del jugador",
      server_id: "Servidor",
      charname: "Nombre del personaje",
      zone_id: "ID de zona",
    };
    return {
      key,
      label: labels[key] ?? key.replaceAll("_", " "),
      placeholder: labels[key] ?? key.replaceAll("_", " "),
      type: "text",
      required: true,
    };
  });
}
