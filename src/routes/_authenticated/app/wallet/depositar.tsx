import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, Copy, Upload } from "lucide-react";
import { toast } from "sonner";
import { UserShell } from "@/components/layout/UserShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { mockPaymentSettings } from "@/data/mock/admin";
import { calculateDeposit } from "@/services/wallet";
import { getSaldoRate } from "@/lib/catalog.functions";
import { formatCUP } from "@/lib/format";

type DepositSearch = { necesario?: number; metodo?: string };

export const Route = createFileRoute("/_authenticated/app/wallet/depositar")({
  validateSearch: (search: Record<string, unknown>): DepositSearch => {
    const needed = Number(search["necesario"]);
    const method = String(search["metodo"] ?? "");
    return {
      ...(Number.isFinite(needed) && needed > 0 ? { necesario: Math.ceil(needed) } : {}),
      ...(method === "movil" || method === "tarjeta" ? { metodo: method } : {}),
    };
  },
  loader: () => getSaldoRate(),
  head: () => ({
    meta: [
      { title: "Agregar fondos — MONSTORE" },
      { name: "description", content: "Recarga tu wallet con saldo móvil ETECSA o tarjeta CUP." },
    ],
  }),
  component: DepositPage,
});

function DepositPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { necesario, metodo } = Route.useSearch();
  const { rate: saldoRate } = Route.useLoaderData();
  const mobile = mockPaymentSettings.find((s) => s.payment_method === "saldo_movil");
  const card = mockPaymentSettings.find((s) => s.payment_method === "tarjeta_cup");
  const initialTab = metodo ?? "movil";
  const initialAmount = necesario
    ? String(
        Math.ceil(
          initialTab === "movil"
            ? necesario / saldoRate
            : necesario / (1 + (card?.deposit_bonus_pct ?? 0) / 100),
        ),
      )
    : "2000";
  const [amount, setAmount] = useState(initialAmount);
  const [tab, setTab] = useState(initialTab);
  const [mobileProof, setMobileProof] = useState<File | null>(null);
  const [mobileAttempts, setMobileAttempts] = useState(0);
  const [cardProof, setCardProof] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const parsed = Number(amount) || 0;
  const isMobile = tab === "movil";
  // Saldo móvil: cada peso de saldo se multiplica por la base puesta en el panel.
  const breakdown = isMobile
    ? {
        amount: parsed,
        bonusPct: 0,
        bonus: Math.round(parsed * saldoRate) - parsed,
        credited: Math.round(parsed * saldoRate),
      }
    : calculateDeposit(parsed, "tarjeta_cup");

  function copy(value: string) {
    void navigator.clipboard?.writeText(value);
    toast.success("Copiado al portapapeles");
  }

  async function submit(
    method: "saldo_movil" | "tarjeta_cup",
    hasProof: boolean,
    note?: string,
  ) {
    if (parsed <= 0) {
      toast.error("Escribe un importe válido.");
      return;
    }
    if (sending) return;
    setSending(true);
    const { error } = await supabase.rpc("request_deposit", {
      p_amount: parsed,
      p_method: method,
      p_reference: "",
      p_has_proof: hasProof,
    });
    setSending(false);
    if (error) {
      toast.error("No pudimos enviar tu solicitud", { description: error.message });
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["notifications"] });
    toast.success("Solicitud de fondos enviada", {
      description:
        note ?? "Tu solicitud está siendo procesada y te avisaremos al acreditarla.",
    });
    void navigate({ to: "/app/recargas" });
  }

  function submitMobile() {
    if (mobileProof) {
      setMobileAttempts(0);
      void submit("saldo_movil", true);
      return;
    }
    if (mobileAttempts === 0) {
      setMobileAttempts(1);
      toast.error("Falta la captura de pantalla del pago", {
        description: "Sube la captura para que podamos verificar tu depósito más rápido.",
      });
      return;
    }
    setMobileAttempts(0);
    void submit(
      "saldo_movil",
      false,
      "Sin captura puede demorar hasta 24 horas en agregar sus fondos. La solicitud llegó al panel marcada como “Sin captura de pantalla”.",
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

        {necesario ? (
          <div className="surface-card border-primary/40 p-4">
            <p className="text-sm">
              Te faltan <span className="font-semibold text-primary">{formatCUP(necesario)}</span>{" "}
              para completar tu compra. Ya pusimos el importe justo a pagar.
            </p>
          </div>
        ) : null}

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
              <span>{formatCUP(breakdown.amount)}</span>
            </div>
            {isMobile ? (
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  Conversión (cada peso de saldo × {saldoRate})
                </span>
                <span>+ {formatCUP(breakdown.bonus)}</span>
              </div>
            ) : breakdown.bonusPct > 0 ? (
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  Conversión (+{breakdown.bonusPct}%)
                </span>
                <span>+ {formatCUP(breakdown.bonus)}</span>
              </div>
            ) : null}
            <div className="flex justify-between border-t border-border pt-2 font-semibold">
              <span>Acreditaremos</span>
              <span className="text-primary">{formatCUP(breakdown.credited)}</span>
            </div>
          </div>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full">
            <TabsTrigger value="movil" className="flex-1">Saldo móvil</TabsTrigger>
            <TabsTrigger value="tarjeta" className="flex-1">Tarjeta CUP</TabsTrigger>
          </TabsList>

          <TabsContent value="movil" className="mt-4">
            <div className="surface-card space-y-4 p-5">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Número de destino</p>
                <div className="flex items-center gap-2">
                  <p className="font-display text-lg font-bold">{mobile?.destination_number}</p>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copy(mobile?.destination_number ?? "")}
                    aria-label="Copiar número"
                  >
                    <Copy className="size-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">{mobile?.instructions}</p>
              <div className="space-y-1.5">
                <Label htmlFor="comprobante-movil">Captura de pantalla del pago</Label>
                <label
                  htmlFor="comprobante-movil"
                  className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground"
                >
                  <Upload className="size-4" aria-hidden="true" />
                  {mobileProof ? mobileProof.name : "Sube la captura de la transferencia"}
                </label>
                <Input
                  id="comprobante-movil"
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(event) => setMobileProof(event.target.files?.[0] ?? null)}
                />
                {!mobileProof && mobileAttempts > 0 ? (
                  <p className="text-xs text-destructive">
                    Sin captura puede demorar hasta 24 horas en agregar sus fondos. Pulsa otra
                    vez para enviarla igual.
                  </p>
                ) : null}
              </div>
              <Button className="w-full" onClick={submitMobile}>
                He pagado
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="tarjeta" className="mt-4">
            <div className="surface-card space-y-4 p-5">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Número de tarjeta</p>
                <div className="flex items-center gap-2">
                  <p className="font-display text-lg font-bold">{card?.card_number}</p>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copy(card?.card_number ?? "")}
                    aria-label="Copiar tarjeta"
                  >
                    <Copy className="size-4" aria-hidden="true" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Móvil asociado: {card?.phone_number}
                </p>
              </div>
              <p className="text-sm text-muted-foreground">{card?.instructions}</p>
              <div className="space-y-1.5">
                <Label htmlFor="comprobante">Comprobante de pago</Label>
                <label
                  htmlFor="comprobante"
                  className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground"
                >
                  <Upload className="size-4" aria-hidden="true" />
                  Sube una foto de la transferencia
                </label>
                <Input id="comprobante" type="file" accept="image/*" className="sr-only" />
              </div>
              <Button className="w-full" onClick={() => submit("Tarjeta CUP")}>
                Enviar solicitud
              </Button>
            </div>
          </TabsContent>
        </Tabs>

        <p className="text-xs text-muted-foreground">
          Las solicitudes quedan en estado pendiente hasta que el equipo verifica el pago.
        </p>
      </div>
    </UserShell>
  );
}
