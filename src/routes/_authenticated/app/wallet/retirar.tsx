import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { UserShell } from "@/components/layout/UserShell";
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
import { PaymentHoursNotice } from "@/components/common/PaymentHoursNotice";
import { supabase } from "@/integrations/supabase/client";
import { listPaymentMethods } from "@/lib/payments.functions";
import { getPlatformSettings } from "@/lib/settings.functions";
import { useWallet } from "@/hooks/useAccount";
import { formatCUP } from "@/lib/format";
import type { Database } from "@/integrations/supabase/types";

type DbPaymentMethod = Database["public"]["Enums"]["payment_method"];

export const Route = createFileRoute("/_authenticated/app/wallet/retirar")({
  head: () => ({
    meta: [
      { title: "Retirar fondos — MONSTORE" },
      { name: "description", content: "Solicita un retiro de tu wallet en CUP." },
    ],
  }),
  component: WithdrawPage,
});

function WithdrawPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchMethods = useServerFn(listPaymentMethods);
  const fetchSettings = useServerFn(getPlatformSettings);
  const { data: wallet } = useWallet();

  const { data: methods } = useQuery({
    queryKey: ["payment-methods"],
    staleTime: 5 * 60 * 1000,
    queryFn: () => fetchMethods(),
  });

  /** Comisión y mínimo vienen de la configuración del administrador. */
  const { data: settings } = useQuery({
    queryKey: ["platform-settings"],
    staleTime: 60 * 1000,
    queryFn: () => fetchSettings(),
  });

  const available = useMemo(
    () => (methods ?? []).filter((item) => item.active && item.payment_method !== "wallet"),
    [methods],
  );

  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<string>("");
  const [destination, setDestination] = useState("");

  const selected = available.find((item) => item.payment_method === (method || available[0]?.payment_method));
  const activeMethod = method || selected?.payment_method || "";
  const balance = Number(wallet?.balance ?? 0);
  const parsed = Number(amount) || 0;

  const conversionPct = selected?.withdrawal_conversion_pct ?? 0;
  const feePct = settings?.withdrawal_fee_pct ?? selected?.withdrawal_fee_pct ?? 5;
  const minimum = Number(settings?.min_withdrawal_cup ?? 0);
  const conversion = Math.round((parsed * conversionPct) / 100);
  const fee = Math.round(((parsed - conversion) * feePct) / 100);
  const net = Math.max(parsed - conversion - fee, 0);
  const tooMuch = parsed > balance;
  const tooLow = minimum > 0 && parsed > 0 && parsed < minimum;

  const request = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("request_withdrawal", {
        p_amount: parsed,
        p_method: activeMethod as DbPaymentMethod,
        p_destination: destination.trim(),
      });
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      toast.success("Solicitud de retiro enviada", {
        description: "El importe quedó descontado. Si se rechaza, te lo devolvemos.",
      });
      void queryClient.invalidateQueries({ queryKey: ["wallet"] });
      void queryClient.invalidateQueries({ queryKey: ["wallet-transactions"] });
      void queryClient.invalidateQueries({ queryKey: ["withdrawals"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      void navigate({ to: "/app/wallet" });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <UserShell>
      <div className="mx-auto max-w-xl space-y-5">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="icon">
            <Link to="/app/wallet" aria-label="Volver al wallet">
              <ChevronLeft className="size-5" aria-hidden="true" />
            </Link>
          </Button>
          <h1 className="text-xl font-bold">Retirar fondos</h1>
        </div>

        <PaymentHoursNotice />

        <form
          className="surface-card space-y-4 p-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (!activeMethod) {
              toast.error("Elige un método para recibir el dinero.");
              return;
            }
            if (destination.trim().length < 5) {
              toast.error("Escribe el destino donde quieres recibir el dinero.");
              return;
            }
            request.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="metodo">Método</Label>
            <Select value={activeMethod} onValueChange={setMethod}>
              <SelectTrigger id="metodo">
                <SelectValue placeholder="Elige cómo quieres recibir el dinero" />
              </SelectTrigger>
              <SelectContent>
                {available.map((item) => (
                  <SelectItem key={item.payment_method} value={item.payment_method}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cantidad">Cantidad (CUP)</Label>
            <Input
              id="cantidad"
              inputMode="numeric"
              value={amount}
              placeholder="2000"
              onChange={(event) => setAmount(event.target.value.replace(/[^\d]/g, ""))}
            />
            <p className="text-xs text-muted-foreground">
              Disponible: {formatCUP(balance)}
              {minimum > 0 ? ` · Mínimo: ${formatCUP(minimum)}` : ""}
            </p>
            {tooMuch ? (
              <p className="text-xs text-destructive">La cantidad supera tu saldo disponible.</p>
            ) : null}
            {tooLow ? (
              <p className="text-xs text-destructive">El retiro mínimo es {formatCUP(minimum)}.</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="destino">Destino</Label>
            <Input
              id="destino"
              value={destination}
              onChange={(event) => setDestination(event.target.value)}
              placeholder={
                activeMethod === "tarjeta_cup" ? "9227 0000 0000 0000" : "+53 5 000 0000"
              }
            />
          </div>

          <div className="space-y-1.5 rounded-lg border border-border bg-muted/40 p-4 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cantidad</span>
              <span>{formatCUP(parsed)}</span>
            </div>
            {conversionPct > 0 ? (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Conversión (−{conversionPct}%)</span>
                <span>− {formatCUP(conversion)}</span>
              </div>
            ) : null}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Comisión ({feePct}%)</span>
              <span>− {formatCUP(fee)}</span>
            </div>
            <div className="flex justify-between border-t border-border pt-2 font-semibold">
              <span>Recibirás</span>
              <span className="text-primary">{formatCUP(net)}</span>
            </div>
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={tooMuch || tooLow || parsed <= 0 || request.isPending}
          >
            Solicitar retiro
          </Button>
        </form>
      </div>
    </UserShell>
  );
}
