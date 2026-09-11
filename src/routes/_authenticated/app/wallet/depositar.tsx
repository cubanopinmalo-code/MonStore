import { useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import {
  Calculator,
  Check,
  ChevronLeft,
  ChevronRight,
  Coins,
  Copy,
  CreditCard,
  Globe,
  Mail,
  Smartphone,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { UserShell } from "@/components/layout/UserShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { getSaldoRate } from "@/lib/catalog.functions";
import { formatBaseCUP, formatCUP, formatSaldo } from "@/lib/format";
import { useMoneyDisplay } from "@/hooks/useCurrency";
import { getVerificationClock, verificationNotice } from "@/lib/paymentHours";
import { PaymentHoursNotice } from "@/components/common/PaymentHoursNotice";
import {
  listPaymentMethods,
  requestDeposit,
  type PaymentMethodInfo,
} from "@/lib/payments.functions";

type DepositSearch = { necesario?: number; metodo?: string };

/** Atajos históricos del enlace «me falta saldo» y nombres completos del método. */
const METHOD_ALIASES: Record<string, string> = {
  movil: "saldo_movil",
  saldo: "saldo_movil",
  tarjeta: "tarjeta_cup",
  saldo_movil: "saldo_movil",
  tarjeta_cup: "tarjeta_cup",
  usdt: "usdt",
  zelle: "zelle",
};

const METHOD_ICONS: Record<string, typeof Smartphone> = {
  saldo_movil: Smartphone,
  tarjeta_cup: CreditCard,
  usdt: Coins,
  zelle: Mail,
};

function methodIcon(method: string) {
  return METHOD_ICONS[method] ?? Globe;
}

/** Importe que debe enviar el cliente para que le acrediten `necesario`. */
function neededFor(method: PaymentMethodInfo, needed: number, saldoRate: number) {
  if (method.payment_method === "saldo_movil") return Math.ceil(needed / saldoRate);
  return Math.ceil(needed / (1 + method.deposit_bonus_pct / 100));
}

/** Texto corto que acompaña al método: «cada peso × 2.8» o «+5% al depositar». */
function methodHint(method: PaymentMethodInfo, saldoRate: number) {
  if (method.payment_method === "saldo_movil") {
    return `Cada peso de saldo vale ${saldoRate} CUP`;
  }
  return method.deposit_bonus_pct > 0
    ? `+${method.deposit_bonus_pct}% al depositar`
    : "Sin bonificación";
}

/**
 * Aviso de conversión: solo aparece cuando el cliente eligió ver los precios en
 * saldo móvil. Explica que la cifra en saldo sale de dividir el CUP entre la base.
 */
function SaldoDisplayNotice({ rate, inSaldo }: { rate: number; inSaldo: boolean }) {
  if (!inSaldo) return null;
  return (
    <div className="surface-card flex items-start gap-3 border-primary/40 p-4">
      <Calculator className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
      <p className="text-sm">
        Estás viendo los precios en{" "}
        <span className="font-semibold text-primary">saldo móvil</span>: cada peso por tarjeta CUP
        se divide entre <span className="font-semibold text-primary">{rate}</span>. El dinero lo
        envías en CUP y abajo te dejamos la cifra exacta que debes transferir.
      </p>
    </div>
  );
}

function StepBadge({ step }: { step: 1 | 2 }) {
  const steps = [
    { id: 1, label: "Método" },
    { id: 2, label: "Importe" },
  ];
  return (
    <ol className="flex w-full items-center gap-2">
      {steps.map((item) => {
        const isActive = item.id === step;
        return (
          <li
            key={item.id}
            className={`flex min-w-0 flex-1 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium ${
              isActive
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border bg-muted/30 text-muted-foreground"
            }`}
          >
            <span
              className={`grid size-4 shrink-0 place-items-center rounded-full text-[10px] font-bold ${
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {item.id}
            </span>
            <span className="truncate">{item.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

export const Route = createFileRoute("/_authenticated/app/wallet/depositar")({
  validateSearch: (search: Record<string, unknown>): DepositSearch => {
    const needed = Number(search["necesario"]);
    const resolved = METHOD_ALIASES[String(search["metodo"] ?? "")];
    return {
      ...(Number.isFinite(needed) && needed > 0 ? { necesario: Math.ceil(needed) } : {}),
      ...(resolved ? { metodo: resolved } : {}),
    };
  },
  loader: async () => {
    const [saldo, methods] = await Promise.all([getSaldoRate(), listPaymentMethods()]);
    return { saldo: saldo.rate, methods: methods.filter((method) => method.active) };
  },
  head: () => ({
    meta: [
      { title: "Agregar fondos — MONSTORE" },
      {
        name: "description",
        content:
          "Recarga tu wallet MONSTORE por saldo móvil ETECSA, tarjeta CUP, USDT o Zelle.",
      },
    ],
  }),
  component: DepositPage,
});

function DepositPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const send = useServerFn(requestDeposit);
  const { necesario, metodo } = Route.useSearch();
  const { saldo: saldoRate, methods } = Route.useLoaderData();
  // Moneda elegida con el selector: CUP o saldo móvil (el CUP sigue siendo la base).
  const { currency } = useMoneyDisplay();
  const inSaldo = currency === "SALDO";

  // Si llegamos desde «me falta saldo» el método ya viene elegido: vamos al paso 2.
  const preselected = methods.find((item) => item.payment_method === metodo) ?? null;
  const [selected, setSelected] = useState<string | null>(
    preselected?.payment_method ?? null,
  );
  const current = methods.find((item) => item.payment_method === selected) ?? null;
  const [amount, setAmount] = useState(() =>
    necesario && preselected
      ? String(neededFor(preselected, necesario, saldoRate))
      : "2000",
  );
  const [proof, setProof] = useState<File | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [sending, setSending] = useState(false);
  const [fromNumber, setFromNumber] = useState("");
  const [senderError, setSenderError] = useState(false);
  const senderRef = useRef<HTMLInputElement>(null);

  const parsed = Number(amount) || 0;
  const isSaldo = current?.payment_method === "saldo_movil";
  const bonusPct = current?.deposit_bonus_pct ?? 0;
  /** Importes en CUP (moneda base) para poder convertirlos al mostrarlos. */
  const sentBaseCup = isSaldo ? Math.round(parsed * saldoRate) : parsed;
  const creditedBaseCup = isSaldo
    ? sentBaseCup
    : Math.round(parsed * (1 + bonusPct / 100));
  const bonusCup = Math.max(creditedBaseCup - sentBaseCup, 0);
  const transferFields = (current?.transfer_fields ?? []).filter(
    (field) => field.value.trim().length > 0,
  );

  function chooseMethod(method: PaymentMethodInfo) {
    setSelected(method.payment_method);
    setProof(null);
    setAttempts(0);
    setSenderError(false);
    setAmount((previous) =>
      necesario
        ? String(neededFor(method, necesario, saldoRate))
        : previous.trim() === ""
          ? "2000"
          : previous,
    );
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function copy(value: string) {
    void navigator.clipboard?.writeText(value);
    toast.success("Copiado al portapapeles");
  }

  /** Saldo móvil exige número de origen: resalta la pregunta y enfoca el campo. */
  function requireSender() {
    const sender = fromNumber.replace(/\D/g, "");
    if (!isSaldo || sender.length >= 8) return true;
    setSenderError(true);
    if (typeof window !== "undefined") {
      senderRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    senderRef.current?.focus({ preventScroll: true });
    toast.error("Escribe desde qué número realizaste la transferencia de saldo", {
      description: "Sin ese número no podemos verificar tu depósito.",
    });
    return false;
  }

  async function submit(hasProof: boolean, note?: string) {
    if (!current) return;
    if (parsed <= 0) {
      toast.error("Escribe un importe válido.");
      return;
    }
    if (!requireSender()) return;
    const sender = fromNumber.replace(/\D/g, "");
    if (sending) return;
    setSending(true);
    try {
      await send({
        data: {
          amount: parsed,
          method: current.payment_method,
          reference: isSaldo ? sender : "",
          hasProof,
        },
      });
    } catch (error) {
      setSending(false);
      toast.error("No pudimos enviar tu solicitud", {
        description: error instanceof Error ? error.message : "Inténtalo de nuevo.",
      });
      return;
    }
    setSending(false);
    await queryClient.invalidateQueries({ queryKey: ["notifications"] });
    toast.success("Solicitud de fondos enviada", {
      description: `${note ?? "Tu solicitud está siendo procesada y te avisaremos al acreditarla."} ${verificationNotice(getVerificationClock())}`,
      duration: 10000,
    });
    void navigate({ to: "/app/recargas" });
  }

  function submitPaid() {
    if (!requireSender()) return;
    if (proof) {
      setAttempts(0);
      void submit(true);
      return;
    }
    if (attempts === 0) {
      setAttempts(1);
      toast.error("Falta la captura de pantalla del pago", {
        description: "Sube la captura para que podamos verificar tu depósito más rápido.",
      });
      return;
    }
    setAttempts(0);
    void submit(
      false,
      "Sin captura puede demorar hasta 24 horas en agregar sus fondos. La solicitud llegó al panel marcada como “Sin captura de pantalla”.",
    );
  }

  function ShortageNotice() {
    if (!necesario) return null;
    return (
      <div className="surface-card border-primary/40 p-4">
        <p className="text-sm">
          Te faltan <span className="font-semibold text-primary">{formatCUP(necesario)}</span> para
          completar tu compra. Ya pusimos el importe justo a pagar.
        </p>
      </div>
    );
  }

  if (methods.length === 0) {
    return (
      <UserShell>
        <div className="surface-card p-5 text-sm text-muted-foreground">
          El administrador aún no activó ningún método de pago. Escribe al soporte para cargar
          fondos.
        </div>
      </UserShell>
    );
  }

  // ── Paso 1: elegir el método de pago ───────────────────────────────────────
  if (!current) {
    return (
      <UserShell>
        <div className="mx-auto max-w-xl space-y-5">
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="icon">
              <Link to="/app/wallet" aria-label="Volver al wallet">
                <ChevronLeft className="size-5" aria-hidden="true" />
              </Link>
            </Button>
            <h1 className="text-xl font-bold">Agregar fondos</h1>
          </div>

          <PaymentHoursNotice />
          <SaldoDisplayNotice rate={saldoRate} inSaldo={inSaldo} />
          <ShortageNotice />

          <section className="surface-card space-y-4 p-5">
            <StepBadge step={1} />
            <h2 className="text-base font-semibold">Método de pago a usar</h2>
            <p className="text-sm text-muted-foreground">
              Elige cómo vas a enviar el dinero y después verás el importe y los datos para
              transferir.
            </p>

            <div className="space-y-2">
              {methods.map((method) => {
                const Icon = methodIcon(method.payment_method);
                return (
                  <button
                    key={method.payment_method}
                    type="button"
                    onClick={() => chooseMethod(method)}
                    className="flex w-full items-center gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3 text-left transition-colors hover:border-primary/50 hover:bg-primary/5"
                  >
                    <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="size-5" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">
                        {method.label}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {methodHint(method, saldoRate)}
                      </span>
                    </span>
                    <ChevronRight
                      className="size-4 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                  </button>
                );
              })}
            </div>
          </section>

          <p className="text-xs text-muted-foreground">
            Las solicitudes quedan en estado pendiente hasta que el equipo verifica el pago.
          </p>
        </div>
      </UserShell>
    );
  }

  const CurrentIcon = methodIcon(current.payment_method);

  // ── Paso 2: importe a depositar + datos para transferir ────────────────────
  return (
    <UserShell>
      <div className="mx-auto max-w-xl space-y-5">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSelected(null)}
            aria-label="Volver a elegir el método de pago"
          >
            <ChevronLeft className="size-5" aria-hidden="true" />
          </Button>
          <h1 className="text-xl font-bold">Agregar fondos</h1>
        </div>

        <PaymentHoursNotice />
        <SaldoDisplayNotice rate={saldoRate} inSaldo={inSaldo} />
        <ShortageNotice />

        <section className="surface-card flex items-center gap-3 p-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <CurrentIcon className="size-5" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs text-muted-foreground">Método seleccionado</span>
            <span className="block truncate text-sm font-semibold">{current.label}</span>
          </span>
          <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
            Cambiar
          </Button>
        </section>

        <div className="surface-card space-y-3 p-5">
          <StepBadge step={2} />
          <div className="space-y-1.5">
            <Label htmlFor="monto">
              {isSaldo ? "Importe a enviar (saldo móvil)" : "Importe a depositar (CUP)"}
            </Label>
            <Input
              id="monto"
              inputMode="numeric"
              value={amount}
              onChange={(event) => setAmount(event.target.value.replace(/[^\d]/g, ""))}
            />
          </div>
          <div className="space-y-1 rounded-lg border border-border bg-muted/40 p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Envías</span>
              <span>{isSaldo ? formatSaldo(parsed) : formatCUP(parsed)}</span>
            </div>
            {isSaldo && !inSaldo ? (
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  Conversión (cada peso de saldo × {saldoRate})
                </span>
                <span>+ {formatCUP(Math.max(creditedBaseCup - parsed, 0))}</span>
              </div>
            ) : !isSaldo && bonusPct > 0 ? (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Conversión (+{bonusPct}%)</span>
                <span>+ {formatCUP(bonusCup)}</span>
              </div>
            ) : null}
            {inSaldo && !isSaldo ? (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Transfieres exactamente</span>
                <span>{formatBaseCUP(sentBaseCup)}</span>
              </div>
            ) : null}
            <div className="flex justify-between border-t border-border pt-2 font-semibold">
              <span>Acreditaremos</span>
              <span className="text-primary">{formatCUP(creditedBaseCup)}</span>
            </div>
          </div>
        </div>

        <section className="surface-card space-y-4 p-5">
          <h2 className="text-base font-semibold">Datos para transferir</h2>
          {transferFields.length > 0 ? (
            <div className="space-y-3">
              {transferFields.map((field) => (
                <div key={field.label} className="space-y-1">
                  <p className="text-sm text-muted-foreground">{field.label}</p>
                  <div className="flex items-center gap-2">
                    <p className="min-w-0 flex-1 break-all font-display text-lg font-bold">
                      {field.value}
                    </p>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => copy(field.value)}
                      aria-label={`Copiar ${field.label}`}
                    >
                      <Copy className="size-4" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-destructive">
              Este método todavía no tiene datos de transferencia publicados. Escribe al
              administrador para completarlos.
            </p>
          )}

          {isSaldo ? (
            <div className="space-y-1.5">
              <Label
                htmlFor="numero-origen"
                className={cn(
                  "flex flex-wrap items-center gap-1.5",
                  senderError && "text-destructive",
                )}
              >
                <span>¿Desde qué número realizaste la transferencia de saldo?</span>
                <span
                  aria-hidden="true"
                  className={cn(
                    "rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                    senderError
                      ? "border-destructive text-destructive"
                      : "border-border text-muted-foreground",
                  )}
                >
                  Obligatorio
                </span>
              </Label>
              <Input
                ref={senderRef}
                id="numero-origen"
                inputMode="tel"
                autoComplete="tel"
                placeholder="Escribe tu número, ej. 53000000"
                aria-invalid={senderError}
                aria-describedby={senderError ? "numero-origen-error" : undefined}
                className={cn(
                  "transition-colors",
                  senderError &&
                    "border-destructive ring-2 ring-destructive/30 focus-visible:ring-destructive/50",
                )}
                value={fromNumber}
                onChange={(event) => {
                  setFromNumber(event.target.value.replace(/[^\d]/g, "").slice(0, 11));
                  setSenderError(false);
                }}
              />
              {senderError ? (
                <p
                  id="numero-origen-error"
                  role="alert"
                  className="text-xs font-semibold text-destructive"
                >
                  Escribe desde qué número realizaste la transferencia de saldo (al menos 8
                  dígitos).
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Con ese número ubicamos rápido tu transferencia.
                </p>
              )}
            </div>
          ) : null}

          {current.instructions ? (
            <p className="text-sm text-muted-foreground">{current.instructions}</p>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="comprobante">Captura de pantalla del pago</Label>
            <label
              htmlFor="comprobante"
              className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground"
            >
              <Upload className="size-4" aria-hidden="true" />
              {proof ? proof.name : "Sube la captura de la transferencia"}
            </label>
            <Input
              id="comprobante"
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(event) => {
                setProof(event.target.files?.[0] ?? null);
                setAttempts(0);
              }}
            />
            {!proof && attempts > 0 ? (
              <p className="text-xs text-destructive">
                Sin captura puede demorar hasta 24 horas en agregar sus fondos. Pulsa otra vez
                para enviarla igual.
              </p>
            ) : null}
          </div>

          <Button className="w-full" disabled={sending} onClick={submitPaid}>
            {sending ? "Enviando…" : "He pagado"}
          </Button>
        </section>

        <p className="text-xs text-muted-foreground">
          <Check className="mr-1 inline size-3 text-primary" aria-hidden="true" />
          Las solicitudes quedan en estado pendiente hasta que el equipo verifica el pago.
        </p>
      </div>
    </UserShell>
  );
}
