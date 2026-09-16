import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  listMarketplaceGameConfigs,
  saveMarketplaceGameConfig,
  setMarketplaceGameActive,
  type MarketplaceField,
  type MarketplaceGameConfig,
} from "@/lib/marketplace-config.functions";

const TYPE_LABELS: Record<string, string> = {
  texto: "Texto",
  correo: "Correo",
  contrasena: "Contraseña",
  numero: "Número",
  nota: "Nota larga",
};

interface Draft {
  id: string | null;
  name: string;
  regions: string;
  platforms: string;
  fields: MarketplaceField[];
}

const emptyDraft: Draft = { id: null, name: "", regions: "", platforms: "", fields: [] };

function toDraft(config: MarketplaceGameConfig): Draft {
  return {
    id: config.id,
    name: config.name,
    regions: config.regions.join(", "),
    platforms: config.platforms.join(", "),
    fields: config.fields,
  };
}

/**
 * Centro de control del comercio de cuentas: qué juegos se venden, qué regiones
 * y plataformas se aceptan y qué datos privados pide la aplicación.
 */
export function GameConfigPanel() {
  const queryClient = useQueryClient();
  const load = useServerFn(listMarketplaceGameConfigs);
  const save = useServerFn(saveMarketplaceGameConfig);
  const setActive = useServerFn(setMarketplaceGameActive);

  const { data: configs } = useQuery({
    queryKey: ["marketplace-game-configs"],
    queryFn: () => load(),
  });
  const [draft, setDraft] = useState<Draft>(emptyDraft);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["marketplace-game-configs"] });
    await queryClient.invalidateQueries({ queryKey: ["marketplace-publishable-games"] });
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          id: draft.id,
          name: draft.name,
          regions: draft.regions.split(",").map((item) => item.trim()),
          platforms: draft.platforms.split(",").map((item) => item.trim()),
          fields: draft.fields,
        },
      }),
    onSuccess: async () => {
      setDraft(emptyDraft);
      await refresh();
      toast.success("Juego guardado", {
        description: "Los vendedores solo podrán usar estas opciones.",
      });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const toggleMutation = useMutation({
    mutationFn: (input: { id: string; active: boolean }) => setActive({ data: input }),
    onSuccess: async () => {
      await refresh();
      toast.success("Estado del juego actualizado");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function updateField(index: number, patch: Partial<MarketplaceField>) {
    setDraft((previous) => ({
      ...previous,
      fields: previous.fields.map((field, position) =>
        position === index ? { ...field, ...patch } : field,
      ),
    }));
  }

  return (
    <div className="space-y-4">
      <section className="surface-card space-y-4 p-5">
        <div>
          <h3 className="text-base font-semibold">
            {draft.id ? "Editar juego del comercio" : "Agregar juego al comercio"}
          </h3>
          <p className="text-xs text-muted-foreground">
            Todo lo que escribas aquí es lo único que el vendedor podrá elegir al publicar. La
            aplicación rechaza cualquier otro valor.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="cfg-nombre">Nombre del juego</Label>
            <Input
              id="cfg-nombre"
              value={draft.name}
              placeholder="Free Fire"
              onChange={(event) => setDraft((p) => ({ ...p, name: event.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cfg-regiones">Regiones permitidas</Label>
            <Input
              id="cfg-regiones"
              value={draft.regions}
              placeholder="Latinoamérica, Brasil, Europa"
              onChange={(event) => setDraft((p) => ({ ...p, regions: event.target.value }))}
            />
            <p className="text-xs text-muted-foreground">Sepáralas con comas.</p>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="cfg-plataformas">Plataformas de acceso permitidas</Label>
            <Input
              id="cfg-plataformas"
              value={draft.platforms}
              placeholder="Correo, Google, Facebook, VK"
              onChange={(event) => setDraft((p) => ({ ...p, platforms: event.target.value }))}
            />
            <p className="text-xs text-muted-foreground">Sepáralas con comas.</p>
          </div>
        </div>

        <div className="space-y-3 rounded-md border border-border p-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h4 className="text-sm font-semibold">Datos privados que pedirá la aplicación</h4>
              <p className="text-xs text-muted-foreground">
                Solo el panel administrador los ve. Puedes pedir los que necesites por juego.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                setDraft((previous) => ({
                  ...previous,
                  fields: [
                    ...previous.fields,
                    {
                      key: `campo_${previous.fields.length + 1}`,
                      label: "",
                      type: "texto",
                      required: true,
                      position: previous.fields.length + 1,
                    },
                  ],
                }))
              }
            >
              <Plus className="size-4" aria-hidden="true" /> Añadir dato
            </Button>
          </div>

          {draft.fields.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Añade al menos un dato, por ejemplo el correo y la contraseña de la cuenta.
            </p>
          ) : null}

          {draft.fields.map((field, index) => (
            <div key={`${field.key}-${index}`} className="grid gap-2 sm:grid-cols-[1fr_150px_auto_auto]">
              <Input
                value={field.label}
                placeholder="Nombre visible, ej. Correo de la cuenta"
                onChange={(event) => updateField(index, { label: event.target.value })}
              />
              <Select
                value={field.type}
                onValueChange={(value) =>
                  updateField(index, { type: value as MarketplaceField["type"] })
                }
              >
                <SelectTrigger aria-label="Tipo de dato">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TYPE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <label className="flex items-center gap-2 text-xs">
                <Switch
                  checked={field.required}
                  onCheckedChange={(checked) => updateField(index, { required: checked })}
                  aria-label="Obligatorio"
                />
                Obligatorio
              </label>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label="Quitar este dato"
                onClick={() =>
                  setDraft((previous) => ({
                    ...previous,
                    fields: previous.fields.filter((_, position) => position !== index),
                  }))
                }
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </Button>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? "Guardando…" : draft.id ? "Guardar cambios" : "Agregar juego"}
          </Button>
          {draft.id ? (
            <Button variant="outline" onClick={() => setDraft(emptyDraft)}>
              Cancelar edición
            </Button>
          ) : null}
        </div>
      </section>

      <div className="grid gap-3 md:grid-cols-2">
        {(configs ?? []).map((config) => (
          <article key={config.id} className="surface-card space-y-2 p-4">
            <header className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold">{config.name}</h3>
                <p className="text-xs text-muted-foreground">
                  {config.active ? "Disponible para publicar" : "No disponible"}
                </p>
              </div>
              <Switch
                checked={config.active}
                disabled={toggleMutation.isPending}
                aria-label={`Activar o desactivar ${config.name}`}
                onCheckedChange={(checked) =>
                  toggleMutation.mutate({ id: config.id, active: checked })
                }
              />
            </header>
            <p className="text-xs text-muted-foreground">Regiones: {config.regions.join(", ")}</p>
            <p className="text-xs text-muted-foreground">
              Plataformas: {config.platforms.join(", ")}
            </p>
            <p className="text-xs text-muted-foreground">
              Datos:{" "}
              {config.fields
                .map((field) => `${field.label}${field.required ? "" : " (opcional)"}`)
                .join(", ") || "—"}
            </p>
            <Button size="sm" variant="outline" onClick={() => setDraft(toDraft(config))}>
              Editar
            </Button>
          </article>
        ))}
      </div>
    </div>
  );
}
