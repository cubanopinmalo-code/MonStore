import { useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Apple,
  Check,
  ChevronLeft,
  ChevronRight,
  Coins,
  Copy,
  CreditCard,
  Globe,
  Mail,
  Smartphone,
  Trash2,
  Upload,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { UserShell } from "@/components/layout/UserShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { getSaldoRate } from "@/lib/catalog.functions";
import { formatCUP } from "@/lib/format";
import { getVerificationClock, verificationNotice } from "@/lib/paymentHours";
import { PaymentHoursNotice } from "@/components/common/PaymentHoursNotice";
import { supabase } from "@/integrations/supabase/client";
import {
  listPaymentDestinations,
  listPaymentMethods,
  previewPaymentLine,
  requestDeposit,
  type PaymentDestination,
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

const CHANNEL_ICONS: Record<string, typeof Smartphone> = {
  transfermovil: Smartphone,
  enzona: Wallet,
  iphone: Apple,
};

const CHANNEL_LABELS: Record<string, { title: string; hint: string }> = {
  transfermovil: {
    title: "Transfermóvil",
    hint: "Paga desde la app Transfermóvil con tu tarjeta BANDEC, BPA o Metropolitano.",
  },
  enzona: {
    title: "EnZona",
    hint: "Paga desde EnZona y escribe el ID de la transacción que te muestra la app.",
  },
  metropolitana: {
    title: "Metropolitana",
    hint: "Envía a la tarjeta del Banco Metropolitano o al Monedero Mi Transfer.",
  },
  iphone: {
    title: "Utilizo iPhone",
    hint: "En iPhone la verificación es manual: hace falta la captura del pago.",
  },
};

const BANK_LABELS: Record<string, { title: string; hint: string }> = {
  bandec: { title: "BANDEC", hint: "Transferencia a tarjeta BANDEC." },
  bpa: { title: "BPA", hint: "Transferencia a tarjeta BPA." },
  metropolitano: {
    title: "METROPOLITANO",
    hint: "El pago se hace por el Monedero Mi Transfer.",
  },
};

/** Los destinos configurables se usan con el método de tarjeta/transferencia. */
const DESTINATION_METHOD = "tarjeta_cup";

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

type Step = "metodo" | "canal" | "banco" | "datos" | "confirmar";

const STEP_ORDER: Step[] = ["metodo", "canal", "banco", "datos", "confirmar"];

function Stepper({ step, hasChannels }: { step: Step; hasChannels: boolean }) {
  const items = (
    hasChannels
      ? [
          { id: "metodo", label: "Método" },
          { id: "canal", label: "Cómo pagas" },
          { id: "datos", label: "Importe" },
          { id: "confirmar", label: "Confirmar" },
        ]
      : [
          { id: "metodo", label: "Método" },
          { id: "datos", label: "Importe" },
          { id: "confirmar", label: "Confirmar" },
        ]
  ) as { id: Step; label: string }[];

  return (
    <ol className="flex w-full items-center gap-2">
      {items.map((item) => {
        const active =
          item.id === step || (item.id === "canal" && step === "banco");
        const done = STEP_ORDER.indexOf(item.id) < STEP_ORDER.indexOf(step) && !active;
        return (
          <li
            key={item.id}
            className={cn(
              "flex min-w-0 flex-1 items-center gap-1.5 rounded-lg border px-2 py-1.5 text-[11px] font-medium",
              active
                ? "border-primary bg-primary/10 text-foreground"
                : done
                  ? "border-primary/30 bg-primary/5 text-muted-foreground"
                  : "border-border bg-muted/30 text-muted-foreground",
            )}
          >
            <span
              className={cn(
                "grid size-4 shrink-0 place-items-center rounded-full text-[10px] font-bold",
                active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
              )}
            >
              {done ? <Check className="size-2.5" aria-hidden="true" /> : items.indexOf(item) + 1}
            </span>
            <span className="truncate">{item.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function OptionCard({
  icon: Icon,
  title,
  hint,
  onClick,
}: {
  icon: typeof Smartphone;
  title: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl border border-border bg-muted/30 px-4 py-4 text-left transition-colors hover:border-primary/50 hover:bg-primary/5"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </button>
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
    const [saldo, methods, destinations] = await Promise.all([
      getSaldoRate(),
      listPaymentMethods(),
      listPaymentDestinations(),
    ]);
    return {
      saldo: saldo.rate,
      methods: methods.filter((method) => method.active),
      destinations,
    };
  },
  head: () => ({
    meta: [
      { title: "Agregar fondos — MONSTORE" },
      {
        name: "description",
        content:
          "Recarga tu wallet MONSTORE por Transfermóvil (BANDEC, BPA, Metropolitano), EnZona, saldo móvil, USDT o Zelle.",
      },
    ],
  }),
  component: DepositPage,
});

function DepositPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const send = useServerFn(requestDeposit);
  const previewLine = useServerFn(previewPaymentLine);
  const { necesario, metodo } = Route.useSearch();
  const { saldo: saldoRate, methods, destinations } = Route.useLoaderData();

  const preselected = methods.find((item) => item.payment_method === metodo) ?? null;
  const [selected, setSelected] = useState<string | null>(preselected?.payment_method ?? null);
  const [channel, setChannel] = useState<string | null>(null);
  const [destinationId, setDestinationId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const current = methods.find((item) => item.payment_method === selected) ?? null;
  const usesDestinations =
    current?.payment_method === DESTINATION_METHOD && destinations.length > 0;
  const channels = [...new Set(destinations.map((item) => item.channel))];
  const banks = destinations.filter((item) => item.channel === channel);
  const destination: PaymentDestination | null =
    destinations.find((item) => item.id === destinationId) ?? null;

  const [amount, setAmount] = useState(() =>
    necesario && preselected
      ? String(neededFor(preselected, necesario, saldoRate))
      : "2000",
  );
  const [proof, setProof] = useState<File | null>(null);
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [sending, setSending] = useState(false);
  const [fromNumber, setFromNumber] = useState("");
  const [senderError, setSenderError] = useState(false);
  const [transactionId, setTransactionId] = useState("");
  const [txnError, setTxnError] = useState(false);
  const senderRef = useRef<HTMLInputElement>(null);
  const txnRef = useRef<HTMLInputElement>(null);

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

  const needsTxn = Boolean(destination?.requires_transaction_id);
  const needsProof = Boolean(destination?.requires_proof);
  const needsSender = isSaldo || Boolean(destination?.requires_sender_phone);

  // Línea de recepción que el sistema asignará a esta solicitud (saldo móvil).
  const lineQuery = useQuery({
    queryKey: ["payment-line", current?.payment_method ?? "none"],
    enabled: Boolean(current),
    staleTime: 15 * 1000,
    refetchOnWindowFocus: true,
    queryFn: () => previewLine({ data: { method: current!.payment_method } }),
  });
  const line = lineQuery.data ?? null;
  const linesBusy = Boolean(line && !line.available);
  const hasLine = Boolean(line?.available && line.line_number != null);

  const step: Step = !current
    ? "metodo"
    : usesDestinations && !channel
      ? "canal"
      : usesDestinations && banks.length > 1 && !destination
        ? "banco"
        : confirming
          ? "confirmar"
          : "datos";

  function resetFlow() {
    setChannel(null);
    setDestinationId(null);
    setProof(null);
    setProofPreview(null);
    setAttempts(0);
    setSenderError(false);
    setTxnError(false);
    setTransactionId("");
    setConfirming(false);
  }

  function chooseMethod(method: PaymentMethodInfo) {
    setSelected(method.payment_method);
    resetFlow();
    setAmount((previous) =>
      necesario
        ? String(neededFor(method, necesario, saldoRate))
        : previous.trim() === ""
          ? "2000"
          : previous,
    );
    scrollTop();
  }

  function chooseChannel(value: string) {
    setChannel(value);
    const single = destinations.filter((item) => item.channel === value);
    setDestinationId(single.length === 1 ? (single[0]?.id ?? null) : null);
    setProof(null);
    setProofPreview(null);
    setTransactionId("");
    scrollTop();
  }

  function scrollTop() {
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function copy(value: string) {
    void navigator.clipboard?.writeText(value);
    toast.success("Copiado al portapapeles");
  }

  function pickProof(file: File | null) {
    setProof(file);
    setAttempts(0);
    setProofPreview((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return file ? URL.createObjectURL(file) : null;
    });
  }

  /** Valida los datos obligatorios del método antes de pasar a confirmar. */
  function validate() {
    if (parsed <= 0) {
      toast.error("Escribe un importe válido.");
      return false;
    }
    if (destination && !destination.destination_value) {
      toast.error("Este pago todavía no tiene destino publicado", {
        description: "Elige otro método o escríbenos antes de transferir.",
      });
      return false;
    }
    const sender = fromNumber.replace(/\D/g, "");
    if (needsSender && sender.length < 8) {
      setSenderError(true);
      senderRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      senderRef.current?.focus({ preventScroll: true });
      toast.error("Escribe desde qué número realizaste la transferencia");
      return false;
    }
    if (needsTxn && transactionId.trim().length < 4) {
      setTxnError(true);
      txnRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      txnRef.current?.focus({ preventScroll: true });
      toast.error("Escribe el ID de transacción de EnZona");
      return false;
    }
    if (needsProof && !proof) {
      toast.error("Sube la captura de pantalla del pago", {
        description: "En iPhone la verificación es manual y la captura es obligatoria.",
      });
      return false;
    }
    if (linesBusy) {
      toast.error("Todas las líneas están ocupadas ahora mismo", {
        description: "Espera unos minutos a que se liberen y vuelve a intentarlo.",
      });
      return false;
    }
    return true;
  }

  async function uploadProof(): Promise<string | null> {
    if (!proof) return null;
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id;
    if (!userId) throw new Error("Vuelve a iniciar sesión para subir la captura.");
    const ext = (proof.name.split(".").pop() ?? "jpg").toLowerCase().slice(0, 5);
    const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage.from("deposit-proofs").upload(path, proof, {
      contentType: proof.type || "image/jpeg",
      upsert: false,
    });
    if (error) throw new Error("No pudimos subir la captura. Inténtalo de nuevo.");
    return path;
  }

  async function submit(note?: string) {
    if (!current || sending) return;
    setSending(true);
    try {
      const proofPath = await uploadProof();
      const assigned = await send({
        data: {
          amount: parsed,
          method: current.payment_method,
          reference: transactionId.trim() || fromNumber.replace(/\D/g, ""),
          hasProof: Boolean(proofPath),
          destinationId: destination?.id ?? null,
          transactionId: transactionId.trim() || null,
          senderPhone: fromNumber.replace(/\D/g, "") || null,
          proofPath,
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
      const lineNote =
        assigned?.line_number != null
          ? ` Tu pago quedó registrado en la Línea ${assigned.line_number} (${assigned.line_phone ?? ""}).`
          : "";
      toast.success("Solicitud de fondos enviada", {
        description: `${note ?? "Tu solicitud está pendiente de confirmación y te avisaremos al acreditarla."}${lineNote} ${verificationNotice(getVerificationClock())}`,
        duration: 10000,
      });
      void navigate({ to: "/app/recargas" });
    } catch (error) {
      await lineQuery.refetch();
      toast.error("No pudimos enviar tu solicitud", {
        description: error instanceof Error ? error.message : "Inténtalo de nuevo.",
      });
    } finally {
      setSending(false);
    }
  }

  /** Sin captura: el primer intento la pide, el segundo avisa de las 24 horas. */
  function confirmSend() {
    if (!validate()) return;
    if (proof || needsTxn) {
      void submit();
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

  function Header({ onBack, title }: { onBack: (() => void) | null; title: string }) {
    return (
      <div className="flex items-center gap-2">
        {onBack ? (
          <Button variant="ghost" size="icon" onClick={onBack} aria-label="Volver">
            <ChevronLeft className="size-5" aria-hidden="true" />
          </Button>
        ) : (
          <Button asChild variant="ghost" size="icon">
            <Link to="/app/wallet" aria-label="Volver al wallet">
              <ChevronLeft className="size-5" aria-hidden="true" />
            </Link>
          </Button>
        )}
        <h1 className="text-xl font-bold">{title}</h1>
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

  // ── Paso 1: método de pago ─────────────────────────────────────────────────
  if (step === "metodo") {
    return (
      <UserShell>
        <div className="mx-auto max-w-xl space-y-5">
          <Header onBack={null} title="Agregar fondos" />
          <PaymentHoursNotice />
          <ShortageNotice />
          <section className="surface-card space-y-4 p-5">
            <Stepper step="metodo" hasChannels={destinations.length > 0} />
            <h2 className="text-base font-semibold">Método de pago a usar</h2>
            <p className="text-sm text-muted-foreground">
              Elige cómo vas a enviar el dinero y después verás el importe y los datos para
              transferir.
            </p>
            <div className="space-y-2">
              {methods.map((method) => (
                <OptionCard
                  key={method.payment_method}
                  icon={methodIcon(method.payment_method)}
                  title={method.label}
                  hint={methodHint(method, saldoRate)}
                  onClick={() => chooseMethod(method)}
                />
              ))}
            </div>
          </section>
        </div>
      </UserShell>
    );
  }

  // ── Paso 2: ¿cómo realizarás tu pago? ──────────────────────────────────────
  if (step === "canal") {
    return (
      <UserShell>
        <div className="mx-auto max-w-xl space-y-5">
          <Header onBack={() => setSelected(null)} title="¿Cómo realizarás tu pago?" />
          <section className="surface-card space-y-4 p-5">
            <Stepper step="canal" hasChannels />
            <p className="text-sm text-muted-foreground">
              Elige la aplicación que vas a usar para transferir. Cada una pide datos distintos.
            </p>
            <div className="space-y-2">
              {channels.map((item) => {
                const meta = CHANNEL_LABELS[item];
                const first = destinations.find((row) => row.channel === item);
                return (
                  <OptionCard
                    key={item}
                    icon={CHANNEL_ICONS[item] ?? Globe}
                    title={meta?.title ?? first?.label ?? item}
                    hint={meta?.hint ?? first?.description ?? ""}
                    onClick={() => chooseChannel(item)}
                  />
                );
              })}
            </div>
          </section>
        </div>
      </UserShell>
    );
  }

  // ── Paso 2b: tipo de tarjeta en Transfermóvil ──────────────────────────────
  if (step === "banco") {
    return (
      <UserShell>
        <div className="mx-auto max-w-xl space-y-5">
          <Header onBack={() => setChannel(null)} title="¿Qué tipo de tarjeta utilizarás?" />
          <section className="surface-card space-y-4 p-5">
            <Stepper step="banco" hasChannels />
            <p className="text-sm text-muted-foreground">
              Selecciona tu banco para mostrarte el destino correcto del pago.
            </p>
            <div className="space-y-2">
              {banks.map((item) => {
                const meta = item.bank ? BANK_LABELS[item.bank] : undefined;
                return (
                  <OptionCard
                    key={item.id}
                    icon={item.kind === "monedero" ? Wallet : CreditCard}
                    title={meta?.title ?? item.label}
                    hint={meta?.hint ?? item.description}
                    onClick={() => {
                      setDestinationId(item.id);
                      scrollTop();
                    }}
                  />
                );
              })}
              {banks.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  El administrador todavía no activó tarjetas para este método.
                </p>
              ) : null}
            </div>
          </section>
        </div>
      </UserShell>
    );
  }

  const CurrentIcon = methodIcon(current!.payment_method);
  const channelTitle = channel ? (CHANNEL_LABELS[channel]?.title ?? channel) : null;
  const bankTitle = destination?.bank ? (BANK_LABELS[destination.bank]?.title ?? destination.bank) : null;

  // ── Paso 4: confirmación ───────────────────────────────────────────────────
  if (step === "confirmar") {
    return (
      <UserShell>
        <div className="mx-auto max-w-xl space-y-5">
          <Header onBack={() => setConfirming(false)} title="Confirmar solicitud de fondos" />
          <section className="surface-card space-y-3 p-5 text-sm">
            <Row label="Monto" value={formatCUP(parsed)} />
            <Row label="Acreditaremos" value={formatCUP(credited)} strong />
            <Row label="Método" value={channelTitle ?? current!.label} />
            {bankTitle ? <Row label="Banco" value={bankTitle} /> : null}
            {destination ? (
              <Row
                label="Destino"
                value={destination.destination_value || "Configurado por MONSTORE"}
              />
            ) : null}
            {hasLine ? (
              <Row label="Línea asignada" value={`Línea ${line?.line_number} · ${line?.phone_number}`} />
            ) : null}
            {transactionId.trim() ? (
              <Row label="ID de transacción" value={transactionId.trim()} />
            ) : null}
            {fromNumber ? <Row label="Número de origen" value={fromNumber} /> : null}
            {proof ? <Row label="Comprobante" value={proof.name} /> : null}
            <Row label="Estado" value="Pendiente de confirmación" />
          </section>
          <Button className="w-full" size="lg" disabled={sending} onClick={confirmSend}>
            {sending ? "Enviando…" : "Enviar solicitud"}
          </Button>
          <PaymentHoursNotice />
        </div>
      </UserShell>
    );
  }

  // ── Paso 3: importe + datos del destino ────────────────────────────────────
  return (
    <UserShell>
      <div className="mx-auto max-w-xl space-y-5">
        <Header
          onBack={() => {
            if (usesDestinations) {
              if (banks.length > 1) setDestinationId(null);
              else setChannel(null);
            } else {
              setSelected(null);
            }
          }}
          title="Agregar fondos"
        />

        <PaymentHoursNotice />
        <ShortageNotice />

        <section className="surface-card flex items-center gap-3 p-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <CurrentIcon className="size-5" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs text-muted-foreground">Pago seleccionado</span>
            <span className="block truncate text-sm font-semibold">
              {channelTitle ?? current!.label}
              {bankTitle ? ` · ${bankTitle}` : ""}
            </span>
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSelected(null);
              resetFlow();
            }}
          >
            Cambiar
          </Button>
        </section>

        <div className="surface-card space-y-3 p-5">
          <Stepper step="datos" hasChannels={destinations.length > 0} />
          <div className="space-y-1.5">
            <Label htmlFor="monto">Importe a depositar (CUP)</Label>
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

          {linesBusy ? (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm">
              <p className="font-semibold text-destructive">
                Todas las líneas de recepción están ocupadas
              </p>
              <p className="mt-1 text-muted-foreground">
                Hay pagos en revisión en todas las líneas. Espera unos minutos y vuelve a entrar: en
                cuanto se libere una, te la asignamos automáticamente.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => void lineQuery.refetch()}
              >
                Volver a comprobar
              </Button>
            </div>
          ) : hasLine ? (
            <div className="rounded-lg border border-primary/40 bg-primary/5 p-3">
              <p className="text-xs text-muted-foreground">
                Línea asignada a tu solicitud — envía el dinero solo a este número
              </p>
              <div className="mt-1 flex items-center gap-2">
                <p className="min-w-0 flex-1 break-all font-display text-lg font-bold text-primary">
                  Línea {line?.line_number}: {line?.phone_number}
                </p>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => copy(line?.phone_number ?? "")}
                  aria-label="Copiar número de la línea asignada"
                >
                  <Copy className="size-4" aria-hidden="true" />
                </Button>
              </div>
            </div>
          ) : null}

          {destination ? (
            <div className="space-y-2">
              {destination.destination_value ? (
                <div className="rounded-lg border border-primary/40 bg-primary/5 p-3">
                  <p className="text-xs text-muted-foreground">
                    {destination.kind === "monedero"
                      ? "Datos del Monedero Mi Transfer"
                      : destination.kind === "tarjeta"
                        ? "Número de tarjeta para realizar el pago"
                        : "Destino del pago"}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <p className="min-w-0 flex-1 break-all font-display text-lg font-bold text-primary">
                      {destination.destination_value}
                    </p>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => copy(destination.destination_value)}
                      aria-label="Copiar destino del pago"
                    >
                      <Copy className="size-4" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-destructive">
                  El administrador todavía no publicó el destino de este pago. Escríbenos antes de
                  transferir.
                </p>
              )}
              {destination.confirm_phone ? (
                <div className="rounded-lg border border-border/60 p-3">
                  <p className="text-xs text-muted-foreground">
                    Móvil a confirmar (escríbelo en la app al hacer el pago)
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <p className="min-w-0 flex-1 font-display text-base font-bold">
                      {destination.confirm_phone}
                    </p>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => copy(destination.confirm_phone)}
                      aria-label="Copiar móvil a confirmar"
                    >
                      <Copy className="size-4" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              ) : null}
              {destination.bank || destination.holder_name ? (
                <div className="space-y-1 rounded-lg border border-border/60 p-3 text-sm">
                  {destination.bank ? (
                    <p>
                      <span className="text-muted-foreground">Banco: </span>
                      {destination.bank}
                    </p>
                  ) : null}
                  {destination.holder_name ? (
                    <p>
                      <span className="text-muted-foreground">A nombre de: </span>
                      {destination.holder_name}
                    </p>
                  ) : null}
                </div>
              ) : null}
              {destination.guide_image_url ? (
                <img
                  src={destination.guide_image_url}
                  alt={`Dónde tocar para enviar el dinero a ${destination.label}`}
                  className="w-full rounded-lg border border-border/60 object-contain"
                  loading="lazy"
                />
              ) : null}
              {destination.instructions ? (
                <p className="text-sm text-muted-foreground">{destination.instructions}</p>
              ) : null}
            </div>
          ) : transferFields.length > 0 ? (
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
          ) : !hasLine ? (
            <p className="text-sm text-destructive">
              Este método todavía no tiene datos de transferencia publicados. Escribe al
              administrador para completarlos.
            </p>
          ) : null}

          {needsSender ? (
            <div className="space-y-1.5">
              <Label
                htmlFor="numero-origen"
                className={cn("flex flex-wrap items-center gap-1.5", senderError && "text-destructive")}
              >
                <span>¿Desde qué número realizaste la transferencia?</span>
                <span
                  aria-hidden="true"
                  className={cn(
                    "rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                    senderError ? "border-destructive text-destructive" : "border-border text-muted-foreground",
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
              <p className="text-xs text-muted-foreground">
                Con ese número ubicamos rápido tu transferencia.
              </p>
            </div>
          ) : null}

          {needsTxn ? (
            <div className="space-y-1.5">
              <Label
                htmlFor="id-transaccion"
                className={cn("flex flex-wrap items-center gap-1.5", txnError && "text-destructive")}
              >
                <span>ID de transacción de EnZona</span>
                <span
                  aria-hidden="true"
                  className={cn(
                    "rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                    txnError ? "border-destructive text-destructive" : "border-border text-muted-foreground",
                  )}
                >
                  Obligatorio
                </span>
              </Label>
              <Input
                ref={txnRef}
                id="id-transaccion"
                placeholder="Ej. kwh23yijww99"
                aria-invalid={txnError}
                className={cn(
                  "transition-colors",
                  txnError &&
                    "border-destructive ring-2 ring-destructive/30 focus-visible:ring-destructive/50",
                )}
                value={transactionId}
                onChange={(event) => {
                  setTransactionId(event.target.value.trim().slice(0, 80));
                  setTxnError(false);
                }}
              />
              <p className="text-xs text-muted-foreground">
                Con ese identificador conciliamos tu pago con la operación recibida.
              </p>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="comprobante" className="flex flex-wrap items-center gap-1.5">
              <span>Captura de pantalla del pago</span>
              {needsProof ? (
                <span className="rounded-full border border-destructive px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-destructive">
                  Obligatoria
                </span>
              ) : null}
            </Label>
            {needsProof ? (
              <p className="text-xs text-muted-foreground">
                En iPhone las notificaciones de pago no se identifican igual, por eso revisamos tu
                comprobante a mano.
              </p>
            ) : null}
            {proofPreview ? (
              <div className="space-y-2">
                <img
                  src={proofPreview}
                  alt="Vista previa de la captura del pago"
                  className="max-h-64 w-full rounded-lg border border-border object-contain"
                />
                <div className="flex gap-2">
                  <Button asChild variant="outline" size="sm">
                    <label htmlFor="comprobante" className="cursor-pointer">
                      Cambiar captura
                    </label>
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => pickProof(null)}>
                    <Trash2 className="mr-1 size-4" aria-hidden="true" />
                    Eliminar
                  </Button>
                </div>
              </div>
            ) : (
              <label
                htmlFor="comprobante"
                className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground"
              >
                <Upload className="size-4" aria-hidden="true" />
                Sube la captura de la transferencia
              </label>
            )}
            <Input
              id="comprobante"
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(event) => pickProof(event.target.files?.[0] ?? null)}
            />
            {!proof && attempts > 0 && !needsProof ? (
              <p className="text-xs text-destructive">
                Sin captura puede demorar hasta 24 horas en agregar sus fondos. Pulsa otra vez para
                enviarla igual.
              </p>
            ) : null}
          </div>

          <Button
            className="w-full"
            size="lg"
            disabled={sending || linesBusy}
            onClick={() => {
              if (!validate()) return;
              setConfirming(true);
              scrollTop();
            }}
          >
            {linesBusy ? "Líneas ocupadas, espera un momento" : "Continuar"}
          </Button>
        </section>

        <p className="text-xs text-muted-foreground">
          <Check className="mr-1 inline size-3 text-primary" aria-hidden="true" />
          Las solicitudes quedan pendientes hasta que el equipo verifica el pago.
        </p>
      </div>
    </UserShell>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("min-w-0 break-all text-right", strong && "font-semibold text-primary")}>
        {value}
      </span>
    </div>
  );
}
