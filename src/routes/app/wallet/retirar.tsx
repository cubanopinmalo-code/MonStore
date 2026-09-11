import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
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
import { mockWallet } from "@/data/mock/wallet";
import { WITHDRAWAL_FEE_PCT } from "@/services/wallet";
import { formatCUP } from "@/lib/format";

export const Route = createFileRoute("/app/wallet/retirar")({
  head: () => ({
    meta: [
      { title: "Retirar fondos — MONSTORE" },
      { name: "description", content: "Solicita un retiro de tu wallet en CUP." },
    ],
  }),
  component: WithdrawPage,
});

function WithdrawPage() {
  const [amount, setAmount] = useState("2000");
  const [method, setMethod] = useState("tarjeta_cup");
  const [destination, setDestination] = useState("");

  const parsed = Number(amount) || 0;
  const fee = Math.round((parsed * WITHDRAWAL_FEE_PCT) / 100);
  const net = Math.max(parsed - fee, 0);
  const tooMuch = parsed > mockWallet.balance;

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

        <form
          className="surface-card space-y-4 p-5"
          onSubmit={(event) => {
            event.preventDefault();
            toast.success("Solicitud de retiro creada (pendiente)", {
              description: "Prototipo: no se descuenta saldo real.",
            });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="cantidad">Cantidad (CUP)</Label>
            <Input
              id="cantidad"
              inputMode="numeric"
              value={amount}
              onChange={(event) => setAmount(event.target.value.replace(/[^\d]/g, ""))}
            />
            <p className="text-xs text-muted-foreground">
              Disponible: {formatCUP(mockWallet.balance)}
            </p>
            {tooMuch ? (
              <p className="text-xs text-destructive">
                La cantidad supera tu saldo disponible.
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="metodo">Método</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger id="metodo">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tarjeta_cup">Tarjeta CUP</SelectItem>
                <SelectItem value="saldo_movil">Saldo móvil ETECSA</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="destino">Destino</Label>
            <Input
              id="destino"
              value={destination}
              onChange={(event) => setDestination(event.target.value)}
              placeholder={method === "tarjeta_cup" ? "9227 0000 0000 0000" : "+53 5 000 0000"}
            />
          </div>

          <div className="space-y-1.5 rounded-lg border border-border bg-muted/40 p-4 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cantidad</span>
              <span>{formatCUP(parsed)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Comisión ({WITHDRAWAL_FEE_PCT}%)</span>
              <span>− {formatCUP(fee)}</span>
            </div>
            <div className="flex justify-between border-t border-border pt-2 font-semibold">
              <span>Recibirás</span>
              <span className="text-primary">{formatCUP(net)}</span>
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={tooMuch || parsed <= 0}>
            Solicitar retiro
          </Button>
        </form>
      </div>
    </UserShell>
  );
}
