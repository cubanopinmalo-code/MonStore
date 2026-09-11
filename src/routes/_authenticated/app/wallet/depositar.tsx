import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
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
import { getSaldoRate } from "@/lib/catalog.functions";
import { formatCUP } from "@/lib/format";
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

  const initialMethod =
    methods.find((item) => item.payment_method === metodo) ?? methods[0];
  const [selected, setSelected] = useState(initialMethod?.payment_method ?? "");
  const current = methods.find((item) => item.payment_method === selected) ?? initialMethod;
  const [amount, setAmount] = useState(() =>
    necesario && initialMethod
      ? String(neededFor(initialMethod, necesario, saldoRate))
      : "2000",
  );
  const [proof, setProof] = useState<File | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [sending, setSending] = useState(false);

  const parsed = Number(amount) || 0;
  const isSaldo = current?.payment_method === "saldo_movil";
  const bonusPct = current?.deposit_bonus_pct ?? 0;
  const credited = isSaldo
    ? Math.round(parsed * saldoRate)
    : Math.round(parsed * (1 + bonusPct / 100));
  const bonus = credited - parsed;
  const transferFields = (current?.transfer_fields ?? []).filter(
    (field) => field.value.trim().length > 0,
  );

  function chooseMethod(method: PaymentMethodInfo) {
    setSelected(method.payment_method);
    setProof(null);
    setAttempts(0);
    if (necesario) setAmount(String(neededFor(method, necesario, saldoRate)));
  }

  function copy(value: string) {
    void navigator.clipboard?.writeText(value);
    toast.success("Copiado al portapapeles");
  }

  async function submit(hasProof: boolean, note?: string) {
    if (!current) return;
    if (parsed <= 0) {
      toast.error("Escribe un importe válido.");
      return;
    }
    if (sending) return;
    setSending(true);
    try {
      await send({
        data: {
          amount: parsed,
          method: current.payment_method,
          reference: "",
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

  if (!current) {
    return (
      <UserShell>
        <div className="surface-card p-5 text-sm text-muted-foreground">
          El administrador aún no activó ningún método de pago. Escribe al soporte para cargar
          fondos.
        </div>
      </UserShell>
    );
  }

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

        {necesario ? (
          <div className="surface-card border-primary/40 p-4">
            <p className="text-sm">
              Te faltan <span className="font-semibold text-primary">{formatCUP(necesario)}</span>{" "}
              para completar tu compra. Ya pusimos el importe justo a pagar.
            </p>
          </div>
        ) : null}

        <section className="surface-card space-y-3 p-5">
          <h2 className="text-base font-semibold">Métodos de pago</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {methods.map((method) => {
              const Icon = methodIcon(method.payment_method);
              const isActive = method.payment_method === current.payment_method;
              return (
                <button
                  key={method.payment_method}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => chooseMethod(method)}
                  className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border px-2 py-3 text-center text-xs font-medium transition-colors ${
                    isActive
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border bg-muted/30 text-muted-foreground hover:border-primary/50"
                  }`}
                >
                  <Icon className="size-5" aria-hidden="true" />
                  {method.label}
                </button>
              );
            })}
          </div>
        </section>

        <div className="surface-card space-y-1.5 p-5">
          <Label htmlFor="monto">Importe a depositar (CUP)</Label>
          <Input
            id="monto"
            inputMode="numeric"
            value={amount}
            onChange={(event) => setAmount(event.target.value.replace(/[^\d]/g, ""))}
          />
          <div className="space-y-1 rounded-lg border border-border bg-muted/40 p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Envías</span>
              <span>{formatCUP(bonus < 0 ? 0 : parsed)}</span>
            </div>
            {isSaldo ? (
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  Conversión (cada peso de saldo × {saldoRate})
                </span>
                <span>+ {formatCUP(bonus)}</span>
              </div>
            ) : bonusPct > 0 ? (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Conversión (+{bonusPct}%)</span>
                <span>+ {formatCUP(bonus)}</span>
              </div>
            ) : null}
            <div className="flex justify-between border-t border-border pt-2 font-semibold">
              <span>Acreditaremos</span>
              <span className="text-primary">{formatCUP(credited)}</span>
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
          Las solicitudes quedan en estado pendiente hasta que el equipo verifica el pago.
        </p>
      </div>
    </UserShell>
  );
}
