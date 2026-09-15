import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/common/StatusBadge";
import { formatCUP, formatDate } from "@/lib/format";
import { findUserByPhone, setUserBlock, type FoundUser } from "@/lib/settings.functions";

/**
 * Bloqueo y desbloqueo de una cuenta por teléfono. La búsqueda, la validación
 * del rol y el cambio de estado se hacen en el servidor y quedan en auditoría.
 * Una cuenta bloqueada no recibe códigos SMS ni puede entrar.
 */
export function UserBlockCard() {
  const search = useServerFn(findUserByPhone);
  const block = useServerFn(setUserBlock);

  const [phone, setPhone] = useState("");
  const [reason, setReason] = useState("");
  const [found, setFound] = useState<FoundUser | null>(null);
  const [confirming, setConfirming] = useState(false);

  const lookup = useMutation({
    mutationFn: () => search({ data: { phone } }),
    onSuccess: (result) => {
      setConfirming(false);
      if (!result.found || !result.user) {
        setFound(null);
        toast.error("No encontramos ninguna cuenta con ese número.");
        return;
      }
      setFound(result.user);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const apply = useMutation({
    mutationFn: (blocked: boolean) =>
      block({ data: { userId: found?.id ?? "", blocked, reason } }),
    onSuccess: (result) => {
      setConfirming(false);
      setReason("");
      setFound((prev) => (prev ? { ...prev, status: result.status } : prev));
      toast.success(
        result.status === "activo" ? "Cuenta reactivada" : "Cuenta bloqueada",
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const blocked = Boolean(found && found.status !== "activo");

  return (
    <section className="surface-card space-y-4 p-5">
      <div>
        <h2 className="text-base font-semibold">Bloqueo de cuentas</h2>
        <p className="text-xs text-muted-foreground">
          Busca por teléfono, revisa la cuenta y confirma. Queda registrado quién lo hizo y cuándo.
        </p>
      </div>

      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          lookup.mutate();
        }}
      >
        <div className="min-w-40 flex-1 space-y-1.5">
          <Label htmlFor="buscar-tel">Teléfono</Label>
          <Input
            id="buscar-tel"
            inputMode="numeric"
            placeholder="55555555"
            value={phone}
            onChange={(event) => setPhone(event.target.value.replace(/[^\d]/g, "").slice(0, 8))}
          />
        </div>
        <Button type="submit" variant="secondary" disabled={lookup.isPending}>
          {lookup.isPending ? "Buscando…" : "Buscar"}
        </Button>
      </form>

      {found ? (
        <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-4 text-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-semibold">{found.name || "Sin nombre"}</p>
              <p className="text-xs text-muted-foreground">
                {found.phone} · {[found.municipality, found.province].filter(Boolean).join(", ")}
              </p>
            </div>
            <StatusBadge status={found.status} />
          </div>
          <p className="text-xs text-muted-foreground">
            Saldo: {formatCUP(found.balance)} · Alta: {formatDate(found.created_at)}
          </p>

          {!blocked ? (
            <div className="space-y-2">
              <Label htmlFor="motivo-bloqueo">Motivo (opcional)</Label>
              <Textarea
                id="motivo-bloqueo"
                rows={2}
                value={reason}
                onChange={(event) => setReason(event.target.value.slice(0, 300))}
                placeholder="Por qué se bloquea esta cuenta"
              />
            </div>
          ) : null}

          {confirming ? (
            <div className="flex flex-wrap gap-2">
              <Button
                variant={blocked ? "default" : "destructive"}
                disabled={apply.isPending}
                onClick={() => apply.mutate(!blocked)}
              >
                {blocked ? "Sí, reactivar la cuenta" : "Sí, bloquear la cuenta"}
              </Button>
              <Button variant="ghost" onClick={() => setConfirming(false)}>
                Cancelar
              </Button>
            </div>
          ) : (
            <Button
              variant={blocked ? "secondary" : "destructive"}
              onClick={() => setConfirming(true)}
            >
              {blocked ? "Desbloquear cuenta" : "Bloquear cuenta"}
            </Button>
          )}
        </div>
      ) : null}
    </section>
  );
}
