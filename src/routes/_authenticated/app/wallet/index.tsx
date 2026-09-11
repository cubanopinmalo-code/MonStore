import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowDownLeft, ArrowUpRight, Minus, Plus } from "lucide-react";
import { UserShell } from "@/components/layout/UserShell";
import { StatusBadge } from "@/components/common/StatusBadge";
import { EmptyState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { useWallet, useWalletTransactions } from "@/hooks/useAccount";
import { formatCUP, formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/app/wallet/")({
  head: () => ({
    meta: [
      { title: "Mi wallet — MONSTORE" },
      { name: "description", content: "Saldo, movimientos, depósitos y retiros en CUP." },
    ],
  }),
  component: WalletPage,
});

function WalletPage() {
  const { data: wallet } = useWallet();
  const { data: txData } = useWalletTransactions();
  const transactions = txData ?? [];

  return (
    <UserShell>
      <div className="space-y-6">
        <h1 className="sr-only">Mi wallet</h1>

        <section className="surface-card relative overflow-hidden p-6 glow-ring">
          <div
            className="pointer-events-none absolute inset-0 opacity-60"
            style={{ background: "var(--gradient-surface)" }}
            aria-hidden="true"
          />
          <div className="relative space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Saldo disponible</p>
              <StatusBadge status={wallet?.status ?? "activa"} />
            </div>
            <p className="font-display text-4xl font-bold">
              {formatCUP(Number(wallet?.balance ?? 0))}
            </p>

            <div className="flex flex-wrap gap-2 pt-3">
              <Button asChild>
                <Link to="/app/wallet/depositar">
                  <Plus className="size-4" aria-hidden="true" />
                  Agregar fondos
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/app/wallet/retirar">
                  <Minus className="size-4" aria-hidden="true" />
                  Retirar
                </Link>
              </Button>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold">Movimientos</h2>
          {transactions.length === 0 ? (
            <EmptyState title="Sin movimientos todavía" />
          ) : (
            <div className="grid gap-2">
              {transactions.map((tx) => {
                const positive = tx.amount > 0;
                return (
                  <div key={tx.id} className="surface-card flex items-center gap-3 p-4">
                    <span
                      className={
                        positive
                          ? "flex size-9 items-center justify-center rounded-full bg-success/12 text-success"
                          : "flex size-9 items-center justify-center rounded-full bg-muted text-muted-foreground"
                      }
                    >
                      {positive ? (
                        <ArrowDownLeft className="size-4" aria-hidden="true" />
                      ) : (
                        <ArrowUpRight className="size-4" aria-hidden="true" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{tx.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(tx.created_at)} · saldo anterior{" "}
                        {formatCUP(tx.balance_before)}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className={positive ? "text-sm font-semibold text-success" : "text-sm font-semibold"}>
                        {positive ? "+" : "−"}
                        {formatCUP(Math.abs(tx.amount))}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        saldo {formatCUP(tx.balance_after)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </UserShell>
  );
}
