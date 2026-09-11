import { useEffect, useState } from "react";
import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
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
import { toast } from "sonner";
import { useWallet } from "@/hooks/useAccount";
import {
  checkGamePlayer,
  getCatalogGame,
  type CatalogProduct,
} from "@/lib/catalog.functions";
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
  const navigate = useNavigate();
  const { data: wallet } = useWallet();
  const balance = Number(wallet?.balance ?? 0);

  const [player, setPlayer] = useState<{
    loading: boolean;
    name: string | null;
    message: string | null;
  }>({ loading: false, name: null, message: null });

  const fields = product ? fieldsFor(product) : [];
  const missing = fields.filter((field) => field.required && !values[field.key]?.trim());

  const gameCode = codeFor(product, game.g2bulk_id);
  const playerKey = fields.find((field) => PLAYER_KEYS.includes(field.key))?.key ?? null;
  const playerId = playerKey ? (values[playerKey] ?? "").trim() : "";
  const serverId = (values["server_id"] ?? "").trim();
  const needsServer = fields.some((field) => field.key === "server_id" && field.required);

  useEffect(() => {
    if (!gameCode || !playerId || playerId.length < 4 || (needsServer && !serverId)) {
      setPlayer({ loading: false, name: null, message: null });
      return;
    }
    let active = true;
    setPlayer({ loading: true, name: null, message: null });
    const timer = window.setTimeout(() => {
      void checkGamePlayer({
        data: { gameCode, playerId, ...(serverId ? { serverId } : {}) },
      })
        .then((result) => {
          if (!active) return;
          setPlayer({ loading: false, name: result.name, message: result.message });
        })
        .catch(() => {
          if (!active) return;
          setPlayer({
            loading: false,
            name: null,
            message: "No pudimos verificar el ID ahora mismo.",
          });
        });
    }, 600);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [gameCode, playerId, serverId, needsServer]);


  function selectProduct(item: CatalogProduct) {
    setProduct(item);
    setValues({});
    setPlayer({ loading: false, name: null, message: null });
    setStep(1);
  }

  function confirm() {
    if (submitting || !product) return;
    if (balance < product.sale_price) {
      const missingAmount = Math.ceil(product.sale_price - balance);
      toast.info("Te falta saldo para esta compra", {
        description: `Necesitas ${formatCUP(missingAmount)} más. Te llevamos a agregar fondos por saldo móvil.`,
      });
      void navigate({
        to: "/app/wallet/depositar",
        search: { necesario: missingAmount, metodo: "movil" },
      });
      return;
    }
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
            {playerKey ? (
              player.loading ? (
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                  Verificando el ID en el juego…
                </p>
              ) : player.name ? (
                <div className="rounded-lg border border-success/40 bg-success/10 p-3">
                  <p className="text-xs text-muted-foreground">Personaje encontrado</p>
                  <p className="text-sm font-semibold text-success">{player.name}</p>
                </div>
              ) : player.message ? (
                <p className="text-xs text-warning">{player.message}</p>
              ) : null
            ) : null}
            {missing.length > 0 ? (
              <p className="text-xs text-warning">
                Completa los campos obligatorios para continuar.
              </p>
            ) : null}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(0)}>
                Atrás
              </Button>
              <Button
                className="flex-1"
                disabled={missing.length > 0 || (playerKey ? !player.name : false)}
                onClick={() => setStep(2)}
              >
                {playerKey && player.loading ? "Verificando…" : "Continuar"}
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
                {player.name ? <Row label="Personaje" value={player.name} /> : null}
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
                      Saldo disponible: {formatCUP(balance)}
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
      userid: "ID del jugador",
      uid: "ID del jugador",
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

const PLAYER_KEYS = ["player_id", "user_id", "userid", "uid"];

function codeFor(product: CatalogProduct | null, gameRef: string | null): string | null {
  const metadata = product?.metadata as { game_code?: unknown } | null;
  if (typeof metadata?.game_code === "string" && metadata.game_code) return metadata.game_code;
  if (typeof gameRef === "string" && gameRef.startsWith("game:")) return gameRef.slice(5);
  return null;
}
