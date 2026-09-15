import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { KeyRound, ShieldCheck, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getListingPrivateData, type ListingPrivateData } from "@/lib/marketplace.functions";
import { useCountdown } from "@/hooks/useMarketplace";

/**
 * Datos privados de la cuenta del juego. Quién puede verlos lo decide el
 * servidor: administración, el comprador de esa cuenta, o el vendedor cuando su
 * publicación salió del comercio sin venta.
 */
export function PrivateAccountPanel({
  listingId,
  title,
}: {
  listingId: string;
  title?: string;
}) {
  const fetchData = useServerFn(getListingPrivateData);
  const [open, setOpen] = useState(false);

  const { data, isFetching, error, refetch } = useQuery<ListingPrivateData>({
    queryKey: ["listing-private", listingId],
    enabled: open,
    // El código de 6 dígitos cambia cada 30 s: se vuelve a pedir al servidor.
    refetchInterval: 15_000,
    queryFn: () => fetchData({ data: { listingId } }),
  });

  const [seconds, setSeconds] = useState<number | null>(null);
  useEffect(() => {
    if (data?.totp_seconds_left == null) {
      setSeconds(null);
      return;
    }
    setSeconds(data.totp_seconds_left);
    const timer = setInterval(() => {
      setSeconds((current) => (current === null ? null : Math.max(current - 1, 0)));
    }, 1000);
    return () => clearInterval(timer);
  }, [data?.totp_seconds_left, data?.totp_code]);

  const secureLeft = useCountdown(data?.secure_deadline ?? null);

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <KeyRound className="size-4" aria-hidden="true" />
        Ver datos de acceso {title ? `de ${title}` : ""}
      </Button>
    );
  }

  return (
    <div className="space-y-3 rounded-md border border-warning/30 bg-warning/10 p-3 text-xs">
      <p className="flex items-center gap-2 font-semibold text-warning">
        <ShieldCheck className="size-4" aria-hidden="true" />
        Datos privados de la cuenta — no los compartas
      </p>

      {error ? (
        <p className="text-destructive">
          {error instanceof Error ? error.message : "No pudimos mostrar los datos."}
        </p>
      ) : null}

      {data ? (
        <>
          <dl className="space-y-1">
            <div>
              <dt className="inline text-muted-foreground">Correo: </dt>
              <dd className="inline break-all">{data.final_email || "—"}</dd>
            </div>
            <div>
              <dt className="inline text-muted-foreground">Contraseña: </dt>
              <dd className="inline break-all">{data.final_password || "—"}</dd>
            </div>
            {data.final_notes ? (
              <div>
                <dt className="inline text-muted-foreground">Cómo entrar: </dt>
                <dd className="inline">{data.final_notes}</dd>
              </div>
            ) : null}
            {data.viewer === "admin" && data.original_email ? (
              <div className="border-t border-border/60 pt-1">
                <dt className="inline text-muted-foreground">Datos originales del vendedor: </dt>
                <dd className="inline break-all">
                  {data.original_email} / {data.original_password}
                </dd>
              </div>
            ) : null}
          </dl>

          <div className="rounded-md border border-border/60 bg-background/60 p-2">
            <p className="mb-1 font-semibold">Doble factor de la cuenta del juego</p>
            {data.totp_active && data.totp_code ? (
              <>
                <p className="font-display text-2xl font-bold tracking-widest text-primary">
                  {data.totp_code}
                </p>
                <p className="flex items-center gap-1 text-muted-foreground">
                  <Timer className="size-3" aria-hidden="true" />
                  Cambia en {seconds ?? 0} s
                </p>
                {data.totp_secret ? (
                  <p className="mt-1 break-all text-muted-foreground">
                    Clave para tu app de autenticación: {data.totp_secret}
                  </p>
                ) : null}
              </>
            ) : (
              <p className="text-muted-foreground">Esta cuenta no tiene doble factor configurado.</p>
            )}
          </div>

          {secureLeft && data.viewer === "comprador" ? (
            <p className="rounded-md border border-primary/30 bg-primary/10 p-2 text-primary">
              Te quedan {secureLeft} para cambiar el correo, la contraseña, el teléfono y el doble
              factor de la cuenta.
            </p>
          ) : null}
        </>
      ) : (
        <p className="text-muted-foreground">{isFetching ? "Cargando datos…" : ""}</p>
      )}

      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
          {isFetching ? "Actualizando…" : "Actualizar código"}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Ocultar
        </Button>
      </div>
    </div>
  );
}
