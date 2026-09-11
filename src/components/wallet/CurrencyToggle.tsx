import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  useCurrencySwitchUsage,
  useDisplayCurrency,
  useSaldoRate,
  useSwitchCurrency,
} from "@/hooks/useCurrency";
import type { DisplayCurrency } from "@/lib/format";

const OPTIONS: { value: DisplayCurrency; label: string }[] = [
  { value: "CUP", label: "CUP" },
  { value: "SALDO", label: "Saldo móvil" },
];

const ERRORS: Record<string, string> = {
  daily_limit: "Solo puedes cambiar de moneda una vez cada 24 horas.",
  weekly_limit: "Llegaste al límite de 4 cambios de moneda por semana.",
};

/** Permite ver todos los precios en CUP o en saldo móvil (CUP sigue siendo la base). */
export function CurrencyToggle() {
  const { data: currency } = useDisplayCurrency();
  const { data: rate } = useSaldoRate();
  const { data: usage } = useCurrencySwitchUsage();
  const switchCurrency = useSwitchCurrency();
  const active = currency ?? "CUP";

  function handleSwitch(value: DisplayCurrency) {
    if (value === active || switchCurrency.isPending) return;
    switchCurrency.mutate(value, {
      onSuccess: () => {
        toast.success(
          value === "SALDO"
            ? "Ahora ves todos los precios en saldo móvil"
            : "Ahora ves todos los precios en CUP",
        );
      },
      onError: (error) => {
        toast.error(ERRORS[error.message] ?? "No pudimos cambiar la moneda");
      },
    });
  }

  const remainingWeek = Math.max(4 - (usage?.week ?? 0), 0);

  return (
    <div className="space-y-2 rounded-md border border-border bg-surface p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">Ver precios en</p>
        <div className="flex gap-1 rounded-md border border-border p-1">
          {OPTIONS.map((option) => (
            <Button
              key={option.value}
              type="button"
              size="sm"
              variant={active === option.value ? "default" : "ghost"}
              onClick={() => handleSwitch(option.value)}
              disabled={switchCurrency.isPending}
              aria-pressed={active === option.value}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        1 de saldo móvil equivale a {rate ?? 2.8} CUP. Los precios se convierten solos; el CUP
        sigue siendo la moneda principal.
      </p>
      <p className="text-xs text-muted-foreground">
        Puedes cambiar una vez cada 24 horas · te quedan {remainingWeek} cambios esta semana.
      </p>
    </div>
  );
}
