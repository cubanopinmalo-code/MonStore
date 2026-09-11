import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ImagePlus, Pencil, RefreshCw, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/layout/AdminShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { EmptyState, GridSkeleton } from "@/components/common/states";
import {
  deleteGame,
  listGamesAdmin,
  saveGame,
  syncGameOffers,
  uploadCatalogImage,
  type CatalogGame,
  type GameDraft,
} from "@/lib/catalog.functions";
import { formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/juegos")({
  head: () => ({
    meta: [
      { title: "Juegos — Panel MONSTORE" },
      {
        name: "description",
        content:
          "Gestiona los juegos del catálogo de MONSTORE: visibilidad, portada, enlace y ofertas.",
      },
      { property: "og:title", content: "Juegos — Panel MONSTORE" },
      {
        property: "og:description",
        content: "Activa o desactiva juegos y decide qué se muestra en la tienda.",
      },
    ],
  }),
  component: AdminGamesPage,
});

function toTextList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function slugFrom(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function emptyDraft(): GameDraft & { id?: string } {
  return {
    name: "",
    slug: "",
    description: "",
    category: "",
    platforms: [],
    image_url: "",
    active: true,
  };
}

export function AdminGamesPage() {
  const queryClient = useQueryClient();
  const fetchGames = useServerFn(listGamesAdmin);
  const save = useServerFn(saveGame);
  const remove = useServerFn(deleteGame);
  const refreshOffers = useServerFn(syncGameOffers);
  const upload = useServerFn(uploadCatalogImage);

  const games = useQuery({ queryKey: ["admin-games"], queryFn: () => fetchGames() });
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<(GameDraft & { id?: string }) | null>(null);
  const [slugTouched, setSlugTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const visible = useMemo(() => {
    const rows = games.data ?? [];
    const term = search.trim().toLowerCase();
    return rows.filter((game) => {
      if (!term) return true;
      return (
        game.name.toLowerCase().includes(term) ||
        game.category.toLowerCase().includes(term) ||
        game.slug.includes(term)
      );
    });
  }, [games.data, search]);

  function openNew() {
    setSlugTouched(false);
    setDraft(emptyDraft());
  }

  function openEdit(game: CatalogGame) {
    setSlugTouched(true);
    setDraft({
      id: game.id,
      name: game.name,
      slug: game.slug,
      description: game.description,
      category: game.category,
      platforms: game.platforms,
      image_url: game.image_url,
      active: true,
    });
  }

  async function handleSave() {
    if (!draft) return;
    setSaving(true);
    try {
      await save({ data: draft });
      toast.success(draft.id ? "Juego actualizado." : "Juego creado.");
      setDraft(null);
      await queryClient.invalidateQueries({ queryKey: ["admin-games"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar el juego.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(game: CatalogGame) {
    try {
      await remove({ data: { id: game.id } });
      toast.success("Juego eliminado.");
      await queryClient.invalidateQueries({ queryKey: ["admin-games"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo eliminar el juego.");
    }
  }

  async function handleRefreshOffers(game: CatalogGame) {
    setBusyId(game.id);
    try {
      const result = await refreshOffers({ data: { gameId: game.id } });
      toast.success(
        result.offersCreated > 0
          ? `${result.offersCreated} ofertas nuevas para ${game.name}.`
          : `${game.name} ya estaba al día.`,
      );
      await queryClient.invalidateQueries({ queryKey: ["admin-games"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudieron cargar las ofertas.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleImage(file: File | undefined) {
    if (!file || !draft) return;
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
      reader.onerror = () => reject(new Error("No se pudo leer la imagen."));
      reader.readAsDataURL(file);
    }).catch((error: unknown) => {
      toast.error(error instanceof Error ? error.message : "No se pudo leer la imagen.");
      return "";
    });
    if (!base64) return;

    setSaving(true);
    try {
      const result = await upload({
        data: { name: file.name, mime: file.type, base64 },
      });
      setDraft({ ...draft, image_url: result.path });
      toast.success("Portada subida.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo subir la portada.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminShell
      title="Juegos"
      description="Todos los juegos del proveedor se muestran en la tienda automáticamente."
      actions={
        <Button onClick={openNew} size="sm">
          Nuevo juego
        </Button>
      }
    >
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nombre, categoría o enlace"
            className="pl-9"
          />
        </div>
      </div>

      {games.isPending ? <GridSkeleton items={6} /> : null}

      {games.isError ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          No se pudieron cargar los juegos.
        </p>
      ) : null}

      {!games.isPending && visible.length === 0 ? (
        <EmptyState
          title="No hay juegos que mostrar"
          description="Sincroniza el catálogo desde la pantalla del proveedor o crea un juego a mano."
          action={
            <Button asChild variant="outline">
              <Link to="/admin/g2bulk">Ir al proveedor</Link>
            </Button>
          }
        />
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {visible.map((game) => {
          const isTopUp = game.g2bulk_id.startsWith("game:");
          return (
            <article key={game.id} className="surface-card overflow-hidden">
              {game.cover ? (
                <img
                  src={game.cover}
                  alt={game.name}
                  loading="lazy"
                  width={768}
                  height={512}
                  className="aspect-video w-full object-cover"
                />
              ) : (
                <div className="flex aspect-video w-full items-center justify-center bg-muted text-xs text-muted-foreground">
                  Sin portada
                </div>
              )}
              <div className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-semibold">{game.name}</h2>
                    <p className="text-xs text-muted-foreground">
                      {game.category || "Sin categoría"} · /{game.slug}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {game.offers} ofertas · actualizado {formatDateTime(game.updated_at)}
                </p>
                <div className="flex items-center justify-between gap-2 pt-1">
                  <span className="text-xs text-muted-foreground">Visible en la tienda</span>
                  <div className="flex items-center gap-1">
                    {isTopUp ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Actualizar ofertas de este juego"
                        disabled={busyId === game.id}
                        onClick={() => handleRefreshOffers(game)}
                      >
                        <RefreshCw className="size-4" aria-hidden="true" />
                        <span className="sr-only">Actualizar ofertas</span>
                      </Button>
                    ) : null}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openEdit(game)}
                    >
                      <Pencil className="size-4" aria-hidden="true" />
                      Editar
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" title="Eliminar juego">
                          <Trash2 className="size-4" aria-hidden="true" />
                          <span className="sr-only">Eliminar</span>
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Eliminar {game.name}</AlertDialogTitle>
                          <AlertDialogDescription>
                            Esta acción no se puede deshacer. Si el juego todavía tiene ofertas,
                            elimínalas primero.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleRemove(game)}>
                            Eliminar
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <Dialog open={draft !== null} onOpenChange={(open) => !open && setDraft(null)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Editar juego" : "Nuevo juego"}</DialogTitle>
            <DialogDescription>
              El enlace es la dirección que verán tus clientes: /juegos/enlace
            </DialogDescription>
          </DialogHeader>
          {draft ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="game-name">Nombre</Label>
                <Input
                  id="game-name"
                  value={draft.name}
                  onChange={(event) => {
                    const name = event.target.value;
                    setDraft({
                      ...draft,
                      name,
                      slug: slugTouched ? draft.slug : slugFrom(name),
                    });
                  }}
                  placeholder="Free Fire"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="game-slug">Enlace</Label>
                <Input
                  id="game-slug"
                  value={draft.slug}
                  onChange={(event) => {
                    setSlugTouched(true);
                    setDraft({ ...draft, slug: slugFrom(event.target.value) });
                  }}
                  placeholder="free-fire"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="game-category">Categoría</Label>
                  <Input
                    id="game-category"
                    value={draft.category}
                    onChange={(event) => setDraft({ ...draft, category: event.target.value })}
                    placeholder="Recarga directa"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="game-platforms">Plataformas (separadas por coma)</Label>
                  <Input
                    id="game-platforms"
                    value={draft.platforms.join(", ")}
                    onChange={(event) =>
                      setDraft({ ...draft, platforms: toTextList(event.target.value) })
                    }
                    placeholder="Android, iOS, PC"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="game-description">Descripción</Label>
                <Textarea
                  id="game-description"
                  value={draft.description}
                  onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="game-image">Portada</Label>
                <Input
                  id="game-image"
                  value={draft.image_url}
                  onChange={(event) => setDraft({ ...draft, image_url: event.target.value })}
                  placeholder="Ruta subida o dirección de imagen"
                />
                <div className="flex items-center gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted">
                    <ImagePlus className="size-4" aria-hidden="true" />
                    Subir imagen
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="sr-only"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = "";
                        void handleImage(file);
                      }}
                    />
                  </label>
                  <span className="text-xs text-muted-foreground">JPG, PNG o WEBP hasta 4 MB</span>
                </div>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminShell>
  );
}
