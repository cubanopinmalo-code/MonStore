import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Database, Loader2, Power, RefreshCw, ShieldCheck, Wallet } from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/layout/AdminShell";
import { StatCard } from "@/components/common/PageHeader";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { CardListSkeleton } from "@/components/common/states";
import {
  getProviderStatus,
  listGamesAdmin,
  syncMissingGameOffers,
  syncProviderCatalog,
} from "@/lib/catalog.functions";
import { savePlatformSettings } from "@/lib/settings.functions";

export const Route = createFileRoute("/_authenticated/admin/g2bulk")({
  head: () => ({
    meta: [
      { title: "Proveedor de catálogo — Panel MONSTORE" },
      {
        name: "description",
        content:
          "Estado de la conexión con el proveedor de recargas y sincronización del catálogo en MONSTORE.",
      },
      { property: "og:title", content: "Proveedor de catálogo — MONSTORE" },
      {
        property: "og:description",
        content: "Sincroniza juegos y ofertas desde el proveedor sin exponer tu clave.",
      },
    ],
  }),
  component: AdminProviderPage,
});

function AdminProviderPage() {
  const queryClient = useQueryClient();
  const fetchStatus = useServerFn(getProviderStatus);
  const runSync = useServerFn(syncProviderCatalog);
  const runOffers = useServerFn(syncMissingGameOffers);
  const fetchGames = useServerFn(listGamesAdmin);
  const savePlatform = useServerFn(savePlatformSettings);
  const [syncing, setSyncing] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [loadingOffers, setLoadingOffers] = useState(false);
  const [lastRun, setLastRun] = useState<string | null>(null);

  async function handleToggle(next: boolean) {
    setSwitching(true);
    try {
      await savePlatform({ data: { g2bulk_purchases_enabled: next } });
      toast.success(next ? "Compras reales activadas." : "Compras reales pausadas.");
      await queryClient.invalidateQueries({ queryKey: ["provider-status"] });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No se pudo cambiar el estado de las compras.",
      );
    } finally {
      setSwitching(false);
    }
  }

  async function handleOffers() {
    setLoadingOffers(true);
    try {
      let created = 0;
      let remaining = 1;
      let guard = 0;
      while (remaining > 0 && guard < 30) {
        const result = await runOffers({ data: { batch: 20 } });
        created += result.offersCreated;
        remaining = result.remaining;
        guard += 1;
        if (result.processed === 0) break;
        setLastRun(`${created} ofertas añadidas · ${remaining} juegos por revisar`);
      }
      setLastRun(`${created} ofertas añadidas`);
      toast.success(`Listo: ${created} ofertas añadidas.`);
      await queryClient.invalidateQueries();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudieron cargar las ofertas.");
    } finally {
      setLoadingOffers(false);
    }
  }

  const status = useQuery({
    queryKey: ["provider-status"],
    queryFn: () => fetchStatus(),
    staleTime: 30_000,
  });
  const games = useQuery({
    queryKey: ["admin-games"],
    queryFn: () => fetchGames(),
  });

  async function handleSync() {
    setSyncing(true);
    try {
      const result = await runSync();
      setLastRun(
        `${result.gamesCreated} juegos añadidos · ${result.offersCreated} ofertas añadidas · ${result.offersUpdated} ofertas actualizadas`,
      );
      toast.success("Catálogo sincronizado con el proveedor.");
      result.notes.forEach((note) => toast.info(note));
      await queryClient.invalidateQueries();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo sincronizar el catálogo.");
    } finally {
      setSyncing(false);
    }
  }

  const data = status.data;
  const totalGames = games.data?.length ?? 0;
  const visibleGames = games.data?.filter((game) => game.active).length ?? 0;
  const totalOffers = games.data?.reduce((sum, game) => sum + game.offers, 0) ?? 0;

  return (
    <AdminShell
      title="Proveedor"
      description="El catálogo se carga desde el proveedor y se guarda en tu base de datos."
    >
      <div className="surface-card flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold">Conexión con el proveedor</h2>
            <StatusBadge
              status={data?.hasKey ? "activo" : data ? "pendiente" : "procesando"}
            />
          </div>
          <p className="text-sm text-muted-foreground">
            {data?.hasKey
              ? "La clave está guardada en el servidor y solo se usa en compras."
              : "El catálogo ya se puede sincronizar. La clave solo hace falta para comprar."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={handleSync} disabled={syncing || loadingOffers}>
            {syncing ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="size-4" aria-hidden="true" />
            )}
            Sincronizar catálogo
          </Button>
          <Button
            variant="secondary"
            onClick={handleOffers}
            disabled={syncing || loadingOffers}
          >
            {loadingOffers ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="size-4" aria-hidden="true" />
            )}
            Cargar ofertas faltantes
          </Button>
        </div>
      </div>

      <section className="surface-card flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold">Compras reales</h2>
            <StatusBadge
              status={data?.purchasesEnabled ? "activo" : data ? "pendiente" : "procesando"}
            />
          </div>
          <p className="max-w-xl text-sm text-muted-foreground">
            {data?.purchasesEnabled
              ? "Las recargas se compran de verdad al proveedor y se cobran del saldo del cliente."
              : "Las recargas están pausadas: el catálogo se ve, pero nadie puede comprar ni se cobra nada."}
          </p>
        </div>
        <Button
          variant={data?.purchasesEnabled ? "destructive" : "default"}
          disabled={!data || switching}
          onClick={() => {
            const next = !data?.purchasesEnabled;
            if (
              next &&
              !window.confirm(
                "Vas a activar las compras reales. Cada recarga descontará saldo real del proveedor. ¿Continuar?",
              )
            ) {
              return;
            }
            void handleToggle(next);
          }}
        >
          {switching ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Power className="size-4" aria-hidden="true" />
          )}
          {data?.purchasesEnabled ? "Pausar compras reales" : "Activar compras reales"}
        </Button>
      </section>

      {lastRun ? (
        <p className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-primary">
          Última sincronización de esta sesión: {lastRun}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Juegos guardados" value={String(totalGames)} />
        <StatCard label="Juegos visibles" value={String(visibleGames)} />
        <StatCard label="Ofertas guardadas" value={String(totalOffers)} />
        <StatCard
          label="Saldo en el proveedor"
          value={
            data?.balance === null || data?.balance === undefined
              ? "—"
              : `USD ${data.balance.toFixed(2)}`
          }
        />
      </div>

      {games.isPending ? <CardListSkeleton items={2} /> : null}

      {data?.error ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {data.error}
        </p>
      ) : null}

      <section className="surface-card space-y-3 p-5">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-5 text-primary" aria-hidden="true" />
          <h2 className="text-base font-semibold">Seguridad de la clave</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          La clave se guarda como secreto del servidor. El navegador nunca la recibe ni llama
          al proveedor directamente: todas las compras pasan por el backend de MONSTORE.
        </p>
        <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Flujo de una compra</p>
          <p className="mt-1">
            MONSTORE Web → Backend de MONSTORE → Proveedor → respuesta guardada y mostrada al
            cliente.
          </p>
        </div>
      </section>

      <section className="surface-card space-y-3 p-5">
        <div className="flex items-center gap-2">
          <Database className="size-5 text-primary" aria-hidden="true" />
          <h2 className="text-base font-semibold">Cómo funciona la sincronización</h2>
        </div>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li>
            <span className="font-medium text-foreground">Catálogo público.</span> Juegos y
            ofertas se leen del proveedor sin clave: nada de tu información sale hacia fuera.
          </li>
          <li>
            <span className="font-medium text-foreground">Todo se publica solo.</span> Lo nuevo
            se muestra en la tienda automáticamente con su precio en CUP calculado.
          </li>
          <li>
            <span className="font-medium text-foreground">Sin duplicados.</span> Cada juego y
            cada oferta quedan vinculados a su referencia interna del proveedor.
          </li>
        </ul>
      </section>

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Wallet className="size-4" aria-hidden="true" />
        Las compras descuentan saldo del proveedor, así que el catálogo y el saldo se revisan
        antes de cobrar a un cliente.
      </p>
    </AdminShell>
  );
}
